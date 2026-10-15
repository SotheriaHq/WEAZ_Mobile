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

/*
  Memoized, because an unchanged re-render of this list is not cheap.

  MEASURED on `636fec4`: `commits=RunwayList=8956.5ms×27` in a single flow —
  twenty-seven commits at ~400ms each, accounting for that flow's entire
  `blockedMs=8358`. On the same flows `FeedItem` is absent or at ×1-2, so the
  rows were skipping correctly under their own comparator; it was the list
  shell being re-rendered repeatedly by its parent. A windowed list with three
  to five live cells has no business costing 400ms, but while it does, the
  cheapest correct answer is to not run it when nothing it renders has changed.

  `React.memo` rather than a hand-written dependency list on the caller's side:
  this component takes some forty props, and enumerating them by hand is how a
  memo silently stops matching one of them and either freezes the feed or
  quietly does nothing. A shallow compare tracks whatever the list is actually
  given — it skips when the props are equal and re-renders the moment one is
  not, with no list to keep in step.

  This only works while the caller keeps those props stable. The two that were
  not — an inline `keyExtractor` arrow and an inline `refreshControl` element —
  are hoisted in `RunwayFeedScreen`, and a contract check holds that line,
  because either one alone defeats the comparison while leaving this memo
  looking as though it works.
*/
const RunwayFeedListInner = React.forwardRef<FlatList<FeedListEntry>, RunwayFeedListProps>(function RunwayFeedList(
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

export const RunwayFeedList = React.memo(RunwayFeedListInner);
