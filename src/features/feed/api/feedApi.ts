import * as SecureStore from 'expo-secure-store';

import { getMarketFeed, type GetMarketFeedParams } from '@/src/api/MarketApi';
import type { FeedCacheIdentity, FeedPageResult, PersistedFeedSnapshot } from '@/src/features/feed/api/feed.dto';
import { sanitizeFeedItems } from '@/src/features/feed/api/feed.schema';
import { getFeedCacheMemoryKey, getPersistedFeedCacheKey } from '@/src/features/feed/utils/feedKeys';
import { feedDevLog, feedDevWarn } from '@/src/features/feed/utils/feedDiagnostics';

const FEED_CACHE_TTL_MS = 5 * 60_000;
const PERSISTED_CACHE_VERSION = 2;

const memoryCache = new Map<string, PersistedFeedSnapshot>();

const isMatchingSnapshot = (
  snapshot: PersistedFeedSnapshot | null,
  identity: FeedCacheIdentity,
) =>
  snapshot?.version === PERSISTED_CACHE_VERSION &&
  snapshot.identity.feedType === identity.feedType &&
  snapshot.identity.apiEnvironmentKey === identity.apiEnvironmentKey &&
  snapshot.identity.userId === identity.userId &&
  snapshot.identity.tag === identity.tag &&
  snapshot.items.length > 0;

export const readCachedMarketFeed = async (identity: FeedCacheIdentity) => {
  const memoryKey = getFeedCacheMemoryKey(identity);
  const memory = memoryCache.get(memoryKey);
  if (isMatchingSnapshot(memory ?? null, identity)) {
    feedDevLog('stale-cache-used', {
      source: 'memory',
      itemCount: memory!.items.length,
      isFresh: Date.now() - memory!.cachedAt < FEED_CACHE_TTL_MS,
    });
    return {
      snapshot: memory!,
      isFresh: Date.now() - memory!.cachedAt < FEED_CACHE_TTL_MS,
      source: 'memory' as const,
    };
  }

  try {
    const raw = await SecureStore.getItemAsync(getPersistedFeedCacheKey(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedFeedSnapshot;
    if (!isMatchingSnapshot(parsed, identity)) {
      feedDevLog('cache-discarded', {
        reason: 'version-or-identity-mismatch',
        cacheKey: getPersistedFeedCacheKey(identity),
        expectedVersion: PERSISTED_CACHE_VERSION,
        actualVersion: parsed?.version ?? null,
      });
      return null;
    }
    const sanitizedItems = sanitizeFeedItems(parsed.items);
    if (!sanitizedItems.length) return null;
    const snapshot = { ...parsed, items: sanitizedItems };
    memoryCache.set(memoryKey, snapshot);
    feedDevLog('stale-cache-used', {
      source: 'persisted',
      cacheKey: getPersistedFeedCacheKey(identity),
      version: snapshot.version,
      itemCount: snapshot.items.length,
      isFresh: Date.now() - snapshot.cachedAt < FEED_CACHE_TTL_MS,
    });
    return {
      snapshot,
      isFresh: Date.now() - snapshot.cachedAt < FEED_CACHE_TTL_MS,
      source: 'persisted' as const,
    };
  } catch {
    return null;
  }
};

export const writeCachedMarketFeed = async (
  identity: FeedCacheIdentity,
  page: FeedPageResult,
) => {
  const items = sanitizeFeedItems(page.items);
  if (!items.length) {
    feedDevWarn('cache-write-skipped', { reason: 'empty-or-invalid-response' });
    return null;
  }

  const snapshot: PersistedFeedSnapshot = {
    version: PERSISTED_CACHE_VERSION,
    identity,
    items,
    nextCursor: page.nextCursor ?? null,
    hasNextPage: page.hasNextPage,
    cachedAt: Date.now(),
  };

  memoryCache.set(getFeedCacheMemoryKey(identity), snapshot);

  try {
    feedDevLog('cache-write', {
      cacheKey: getPersistedFeedCacheKey(identity),
      version: snapshot.version,
      itemCount: items.length,
    });
    await SecureStore.setItemAsync(getPersistedFeedCacheKey(identity), JSON.stringify(snapshot));
  } catch {
    feedDevWarn('persisted-cache-write-failed', { itemCount: items.length });
  }

  return snapshot;
};

export const fetchMarketFeedPage = async (
  params: GetMarketFeedParams,
): Promise<FeedPageResult> => {
  feedDevLog('fetch-page', {
    cursor: params.cursor ?? null,
    tag: params.tag ?? null,
  });
  const page = await getMarketFeed(params);
  return {
    ...page,
    items: sanitizeFeedItems(page.items),
  };
};
