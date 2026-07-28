import React, { useCallback, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { FeedMediaCarousel } from '@/src/features/feed/components/FeedMediaCarousel';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

// Depth of the transit scrim once a page sits a full viewport away from centre.
// At rest the centred page interpolates to 0, so an idle feed is pixel-identical
// to before — the scrim only exists while two pages share the viewport.
export const RUNWAY_PAGE_SCRIM_MAX_OPACITY = 0.55;

// Scrim at the halfway point of a transition, as a fraction of the peak above.
// Deliberately more than half (0.72, not 0.5): the midpoint is exactly where the
// eye is asked to parse two full-bleed images plus two action rails at once, so
// the outgoing page has to recede *early* rather than on a linear ramp that only
// dims it once it is already mostly gone.
const SCRIM_MIDPOINT_RATIO = 0.72;

type RunwayFeedItemProps = {
  collectionId: string;
  pageHeight: number;
  pageIndex: number;
  scrollY: Animated.Value;
  scrimColor: string;
  mediaItems: FeedViewerMedia[];
  activeMediaIndex: number;
  isActive: boolean;
  renderVersion: string;
  actionRail: React.ReactNode;
  metaOverlay: React.ReactNode;
  badgeOverlay?: React.ReactNode;
  onCarouselIndexChange: (collectionId: string, nextIndex: number) => void;
  onContentPress: (collectionId: string) => void;
};

function RunwayFeedItemComponent({
  collectionId,
  pageHeight,
  pageIndex,
  scrollY,
  scrimColor,
  mediaItems,
  activeMediaIndex,
  isActive,
  actionRail,
  metaOverlay,
  badgeOverlay,
  onCarouselIndexChange,
  onContentPress,
}: RunwayFeedItemProps) {
  const handleActiveIndexChange = useCallback(
    (nextIndex: number) => {
      onCarouselIndexChange(collectionId, nextIndex);
    },
    [collectionId, onCarouselIndexChange],
  );
  const handleContentPress = useCallback(() => {
    onContentPress(collectionId);
  }, [collectionId, onContentPress]);

  // Distance of this page from the viewport, in both directions. Row k always
  // starts at k * pageHeight (getItemLayout and every scrollToOffset in the
  // screen agree on that), so the offset maths needs no measurement of its own.
  const scrimOpacity = useMemo(() => {
    const pageOffset = pageIndex * pageHeight;
    const halfPage = pageHeight / 2;
    const midpoint = RUNWAY_PAGE_SCRIM_MAX_OPACITY * SCRIM_MIDPOINT_RATIO;
    return scrollY.interpolate({
      inputRange: [pageOffset - pageHeight, pageOffset - halfPage, pageOffset, pageOffset + halfPage, pageOffset + pageHeight],
      outputRange: [RUNWAY_PAGE_SCRIM_MAX_OPACITY, midpoint, 0, midpoint, RUNWAY_PAGE_SCRIM_MAX_OPACITY],
      extrapolate: 'clamp',
    });
  }, [pageHeight, pageIndex, scrollY]);

  return (
    <View style={[styles.page, { height: pageHeight }]}>
      <FeedMediaCarousel
        collectionId={collectionId}
        mediaItems={mediaItems}
        pageHeight={pageHeight}
        isActive={isActive}
        initialActiveIndex={activeMediaIndex}
        onActiveIndexChange={handleActiveIndexChange}
        onContentPress={handleContentPress}
      />
      {badgeOverlay}
      {actionRail}
      {metaOverlay}
      {/* Last child on purpose: the scrim has to cover the action rail and meta
          overlay too, not just the media. Two sets of high-contrast icons and
          counts sliding past each other is a bigger share of the "everything is
          vivid at once" load than the imagery is. pointerEvents="none" keeps the
          rail tappable through it. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor, opacity: scrimOpacity }]}
      />
    </View>
  );
}

export const RunwayFeedItem = React.memo(
  RunwayFeedItemComponent,
  // Overlay/action elements are composed by the parent. The primitive version
  // captures their visible state so unrelated row updates can skip safely.
  (previous, next) =>
    previous.collectionId === next.collectionId &&
    previous.pageHeight === next.pageHeight &&
    previous.pageIndex === next.pageIndex &&
    previous.scrollY === next.scrollY &&
    previous.scrimColor === next.scrimColor &&
    previous.mediaItems === next.mediaItems &&
    previous.activeMediaIndex === next.activeMediaIndex &&
    previous.isActive === next.isActive &&
    previous.renderVersion === next.renderVersion &&
    previous.onCarouselIndexChange === next.onCarouselIndexChange &&
    previous.onContentPress === next.onContentPress,
);

const styles = StyleSheet.create({
  page: {
    width: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
});
