import React from 'react';
import { FlatList, type FlatListProps } from 'react-native';

import type { FeedListEntry } from '@/src/features/feed/components/feedComponentTypes';

export type RunwayFeedListProps = FlatListProps<FeedListEntry>;

export const RunwayFeedList = React.forwardRef<FlatList<FeedListEntry>, RunwayFeedListProps>(function RunwayFeedList(
  props,
  ref,
) {
  return <FlatList ref={ref} {...props} />;
});
