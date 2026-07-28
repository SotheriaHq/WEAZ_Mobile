import React from 'react';
import { Animated, FlatList, type FlatListProps } from 'react-native';

import type { FeedListEntry } from '@/src/features/feed/components/feedComponentTypes';

export type RunwayFeedListProps = FlatListProps<FeedListEntry>;

// Animated so the vertical scroll offset can drive the per-page scrim on the
// native thread (`Animated.event(..., { useNativeDriver: true })`). A plain
// FlatList cannot host a native-driven onScroll, and routing the offset through
// JS would put a per-frame bridge write back into the swipe we just cleaned up.
// The ref still resolves to the underlying FlatList, so scrollToOffset /
// scrollToIndex on the screen are unaffected.
// `createAnimatedComponent` erases FlatList's generic to `unknown`, which makes
// getItemLayout/renderItem stop matching FeedListEntry. Re-assert the entry type
// at this one boundary rather than loosening the props on the screen.
type AnimatedRunwayListProps = RunwayFeedListProps & { ref?: React.Ref<FlatList<FeedListEntry>> };

const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList,
) as unknown as React.ComponentType<AnimatedRunwayListProps>;

export const RunwayFeedList = React.forwardRef<FlatList<FeedListEntry>, RunwayFeedListProps>(function RunwayFeedList(
  props,
  ref,
) {
  return <AnimatedFlatList ref={ref} {...props} />;
});
