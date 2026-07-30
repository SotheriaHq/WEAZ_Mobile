import React, { useCallback, useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { FeedMediaCarousel } from '@/src/features/feed/components/FeedMediaCarousel';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';
import {
  buildChromeCurve,
  buildScaleCurve,
  buildScrimCurve,
} from '@/src/features/feed/utils/runwayTransitCurves';

type RunwayFeedItemProps = {
  collectionId: string;
  pageHeight: number;
  pageIndex: number;
  scrollY: Animated.Value;
  scrimColor: string;
  /**
   * False under Reduce Motion. Only the scale is suppressed — the scrim and
   * chrome cross-fades stay, because a cross-fade is what Reduce Motion wants
   * *instead of* movement, not another thing to strip.
   */
  pageScaleEnabled: boolean;
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
  pageScaleEnabled,
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

  // Geometry and rationale live in runwayTransitCurves.ts, which is pure and
  // unit-tested. Everything here does is bind those ranges to the shared native
  // scroll value — there is no transition maths in the component layer.
  const scrimOpacity = useMemo(
    () => scrollY.interpolate({ ...buildScrimCurve(pageIndex, pageHeight), extrapolate: 'clamp' }),
    [pageHeight, pageIndex, scrollY],
  );
  const pageScale = useMemo(
    () => scrollY.interpolate({ ...buildScaleCurve(pageIndex, pageHeight, pageScaleEnabled), extrapolate: 'clamp' }),
    [pageHeight, pageIndex, pageScaleEnabled, scrollY],
  );
  const chromeOpacity = useMemo(
    () => scrollY.interpolate({ ...buildChromeCurve(pageIndex, pageHeight), extrapolate: 'clamp' }),
    [pageHeight, pageIndex, scrollY],
  );

  // Transform, not layout: scale never feeds back into row height, so
  // getItemLayout and native paging keep agreeing on `pageHeight * index`.
  return (
    <Animated.View style={[styles.page, { height: pageHeight, transform: [{ scale: pageScale }] }]}>
      <FeedMediaCarousel
        collectionId={collectionId}
        mediaItems={mediaItems}
        pageHeight={pageHeight}
        isActive={isActive}
        initialActiveIndex={activeMediaIndex}
        /* The dot row is chrome that happens to live inside the carousel, so it
           has to be handed the fade rather than wrapped by it — nesting the
           carousel under the chrome layer would fade the media too. */
        chromeOpacity={chromeOpacity}
        onActiveIndexChange={handleActiveIndexChange}
        onContentPress={handleContentPress}
      />
      {/* All three overlays position themselves absolutely against the page, so
          an absoluteFill wrapper leaves their geometry untouched and only adds
          the fade. box-none so the wrapper itself is invisible to touches while
          the rail's own buttons stay tappable. */}
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: chromeOpacity }]}>
        {badgeOverlay}
        {actionRail}
        {metaOverlay}
      </Animated.View>
      {/* Last child on purpose: the scrim covers the chrome as well as the media.
          The chrome is already fading faster on its own, so the two compound —
          which is the intent, since the rails are the worst offender.
          pointerEvents="none" keeps the rail tappable through it. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor, opacity: scrimOpacity }]}
      />
    </Animated.View>
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
    previous.pageScaleEnabled === next.pageScaleEnabled &&
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
