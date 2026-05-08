import { getApiEnvironmentKey } from '@/src/api/httpClient';
import type { FeedCacheIdentity } from '@/src/features/feed/api/feed.dto';

const normalizePart = (value: string | null | undefined) =>
  (value && value.trim().length ? value.trim() : 'anonymous').replace(/[^a-zA-Z0-9._-]/g, '_');

export const buildFeedCacheIdentity = ({
  tag,
  userId,
}: {
  tag: string | null;
  userId: string | null;
}): FeedCacheIdentity => ({
  tag,
  userId,
  feedType: 'market',
  apiEnvironmentKey: getApiEnvironmentKey(),
});

export const getFeedCacheMemoryKey = (identity: FeedCacheIdentity) =>
  [
    identity.feedType,
    identity.apiEnvironmentKey,
    normalizePart(identity.userId),
    normalizePart(identity.tag ?? 'all'),
  ].join(':');

export const getPersistedFeedCacheKey = (identity: FeedCacheIdentity) =>
  `threadly.feed.${getFeedCacheMemoryKey(identity)}`;
