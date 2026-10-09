import React from 'react';
import { Animated, FlatList, type FlatListProps } from 'react-native';

import { useCommitCost } from '@/src/perf/commitCost';
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
  /*
    Splits the feed's cost three ways, with `Runway` on the screen and
    `FeedItem` on the rows.

    MEASURED on `83c6d81`: `worstCommit=Runway:self=386-624ms` on flows whose
    destination was Market or Catalogue — the feed spending ~400ms rendering
    itself on navigations AWAY from it, where it has nothing to show. The
    previous commit's memo cleared `TabShell` out of the attribution entirely,
    which is what exposed this.

    Static reading got no further: every child is `React.memo`, `renderItem`'s
    26 dependencies are all `useState`, `useMemo` or module constants, and
    `rowRenderVersion` is content-derived — so on paper the rows should skip and
    the cost should be the screen body alone. Three labels settle it instead of
    another inference. `FeedItem`'s occurrence COUNT in the `by=` breakdown is
    the actual tell: rows appearing at all means the memos are being defeated.
  */
  useCommitCost('RunwayList');
  return <AnimatedFlatList ref={ref} {...props} />;
});
