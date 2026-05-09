import type { MarketFeedResponse, MarketItem } from '@/src/types/market';

export type FeedFilterKey = string | null;

export type FeedCacheIdentity = {
  tag: FeedFilterKey;
  userId: string | null;
  feedType: 'market';
  apiEnvironmentKey: string;
};

export type PersistedFeedSnapshot = {
  version: 2;
  identity: FeedCacheIdentity;
  items: MarketItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
  cachedAt: number;
};

export type FeedPageResult = MarketFeedResponse;
