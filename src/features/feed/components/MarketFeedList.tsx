import React from 'react';
import { FlatList, type FlatListProps } from 'react-native';

import type { FeedListEntry } from '@/src/features/feed/components/feedComponentTypes';

export type MarketFeedListProps = FlatListProps<FeedListEntry>;

export const MarketFeedList = React.forwardRef<FlatList<FeedListEntry>, MarketFeedListProps>(function MarketFeedList(
  props,
  ref,
) {
  return <FlatList ref={ref} {...props} />;
});
