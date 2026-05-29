import AsyncStorage from '@react-native-async-storage/async-storage';

import { getMarketFeed, type GetMarketFeedParams } from '@/src/api/MarketApi';
import type { FeedCacheIdentity, FeedPageResult, PersistedFeedSnapshot } from '@/src/features/feed/api/feed.dto';
import { sanitizeFeedItems } from '@/src/features/feed/api/feed.schema';
import {
  getFeedCacheMemoryKey,
  getPersistedFeedCacheKey,
  PERSISTED_FEED_CACHE_PREFIX,
} from '@/src/features/feed/utils/feedKeys';
import { feedDevLog, feedDevWarn } from '@/src/features/feed/utils/feedDiagnostics';

const FEED_CACHE_TTL_MS = 5 * 60_000;
const PERSISTED_CACHE_VERSION = 2;

const memoryCache = new Map<string, PersistedFeedSnapshot>();

const getStorageErrorReason = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown-storage-error';

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
    const raw = await AsyncStorage.getItem(getPersistedFeedCacheKey(identity));
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
  } catch (error) {
    if (__DEV__) {
      console.warn('[feed-cache]', {
        event: 'persisted-cache-read-failed',
        reason: getStorageErrorReason(error),
      });
    }
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
    await AsyncStorage.setItem(getPersistedFeedCacheKey(identity), JSON.stringify(snapshot));
  } catch (error) {
    if (__DEV__) {
      console.warn('[feed-cache]', {
        event: 'persisted-cache-write-failed',
        itemCount: items.length,
        reason: getStorageErrorReason(error),
      });
    }
  }

  return snapshot;
};

export const clearCachedMarketFeed = async () => {
  memoryCache.clear();

  try {
    const keys = await AsyncStorage.getAllKeys();
    const feedKeys = keys.filter((key) => key.startsWith(PERSISTED_FEED_CACHE_PREFIX));
    if (feedKeys.length > 0) {
      await AsyncStorage.multiRemove(feedKeys);
    }
  } catch {
    // Feed cache cleanup must not block logout.
  }
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
