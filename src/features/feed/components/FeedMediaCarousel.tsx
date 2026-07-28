import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { isUsableImageHttpUrl, prefetchResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { feedMediaDevLog, scrollDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { FeedMediaSlide } from '@/src/features/feed/components/FeedMediaSlide';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const getAspectClass = (aspectRatio?: number | null) => {
  if (typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return 'unknown';
  if (aspectRatio > 1.08) return 'landscape';
  if (aspectRatio < 0.92) return 'portrait';
  return 'square';
};

// Mount two slides on each side of the active one: the incoming slide is fully
// rendered (image decoded and painted) BEFORE the swipe reveals it, and a late
// or missed momentum event can no longer strand the next slide unmounted —
// that unmounted frame was the "freeze + flicker on swipe" symptom.
const shouldMountSlide = (index: number, activeIndex: number) =>
  Math.abs(index - activeIndex) <= 2;

type FeedMediaCarouselProps = {
  collectionId: string;
  mediaItems: FeedViewerMedia[];
  pageHeight: number;
  isActive: boolean;
  initialActiveIndex?: number;
  onActiveIndexChange: (nextIndex: number) => void;
  onContentPress?: () => void;
};

/**
 * Horizontal image carousel for a single feed item.
 *
 * Uses ScrollView (not FlatList) so Android's NestedScrollingChild3
 * protocol is exercised directly. This prevents the outer vertical FlatList
 * from stealing horizontal gestures on low-end Android devices.
 *
 * The onScroll handler is intentionally omitted: dot-indicator position updates
 * only on momentum end, keeping the JS thread free during the drag so the
 * native scroll layer can respond instantly to touch on budget CPUs.
 * Every angle keeps a fixed-width frame for exact paging, but only the current
 * and adjacent frames mount media. This preserves direct ScrollView gestures
 * without paying the image/component cost for every angle.
 */
export const FeedMediaCarousel = React.memo(function FeedMediaCarousel({
  collectionId,
  mediaItems,
  pageHeight,
  isActive,
  initialActiveIndex = 0,
  onActiveIndexChange,
  onContentPress,
}: FeedMediaCarouselProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const previousIndexRef = useRef(initialActiveIndex);
  const initialActiveIndexRef = useRef(initialActiveIndex);
  const prevCollectionIdRef = useRef<string>(collectionId);
  const prevMediaIdentityRef = useRef<string>('');
  const prevWidthRef = useRef<number>(width);
  const hasMultipleItems = mediaItems.length > 1;
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);
  const safeActiveIndex = mediaItems.length > 0 ? Math.min(activeIndex, mediaItems.length - 1) : 0;
  // Slide frames sit on the immersive runway: the frame behind every image is
  // the deep-black matte in BOTH themes. A theme surface here flashed white in
  // light mode whenever a not-yet-painted slide entered the viewport.
  const slideFrameStyle = useMemo(
    () => [styles.slide, { width, backgroundColor: tokens.themes.dark.colors.bg }],
    [width],
  );

  const stableMediaItems = useMemo(
    () =>
      mediaItems.map((item) => ({
        ...item,
        url: normalizeStableUri(item.url) ?? item.url,
        displayUrl: normalizeStableUri(item.displayUrl) ?? normalizeStableUri(item.url) ?? item.url,
        previewUrl: normalizeStableUri(item.previewUrl),
        thumbnailUrl: normalizeStableUri(item.thumbnailUrl),
        fileId: normalizeStableUri(item.fileId),
      })),
    [mediaItems],
  );

  const mediaIdentity = useMemo(
    () => stableMediaItems.map((item) => `${item.id}:${item.fileId ?? ''}:${item.displayUrl ?? item.url}`).join('|'),
    [stableMediaItems],
  );

  const uniqueMediaIds = useMemo(
    () => Array.from(new Set(stableMediaItems.map((item) => item.id))),
    [stableMediaItems],
  );

  const uniqueDisplayUrls = useMemo(
    () => Array.from(new Set(stableMediaItems.map((item) => normalizeStableUri(item.displayUrl) ?? normalizeStableUri(item.url)).filter(Boolean))),
    [stableMediaItems],
  );

  useEffect(() => {
    if (!__DEV__) return;
    feedMediaDevLog('carousel-summary', {
      collectionId,
      mediaCount: stableMediaItems.length,
      uniqueMediaIds,
      uniqueDisplayUrls: uniqueDisplayUrls.length,
      activeIndex: safeActiveIndex,
      nextIndex: stableMediaItems.length > 1 ? Math.min(stableMediaItems.length - 1, safeActiveIndex + 1) : null,
      mountedIndices: stableMediaItems
        .map((_, index) => index)
        .filter((index) => shouldMountSlide(index, safeActiveIndex)),
    });
  }, [collectionId, safeActiveIndex, stableMediaItems.length, uniqueDisplayUrls, uniqueMediaIds]);

  // Prefetch adjacent images in BOTH directions (and one extra ahead) so a
  // swipe left or right always reveals an already-cached image — never a
  // shimmer that resolves seconds later.
  useEffect(() => {
    if (stableMediaItems.length < 2) return;
    const candidateIndices = [
      safeActiveIndex + 1,
      safeActiveIndex - 1,
      safeActiveIndex + 2,
    ].filter((index) => index >= 0 && index <= stableMediaItems.length - 1);
    candidateIndices.forEach((candidateIndex) => {
      const candidate = stableMediaItems[candidateIndex];
      if (!candidate) return;
      const directUrl =
        normalizeStableUri(candidate.displayUrl) ??
        normalizeStableUri(candidate.url) ??
        normalizeStableUri(candidate.previewUrl) ??
        normalizeStableUri(candidate.thumbnailUrl);
      if (!directUrl || !isUsableImageHttpUrl(directUrl)) return;
      void prefetchResolvedImageAsset({
        src: directUrl,
        fileId: null,
        allowSignedFallback: false,
        debugContext: {
          designId: candidate.id,
          mediaIndex: candidateIndex,
          sourceField: 'feed.media.adjacent-preview',
        },
      });
    });
  }, [safeActiveIndex, stableMediaItems]);

  // Keep initialActiveIndex accessible in the reset effect without making it a dep.
  useEffect(() => {
    initialActiveIndexRef.current = initialActiveIndex;
  }, [initialActiveIndex]);

  // Reset carousel when collection identity, media identity, or screen width changes.
  // Never fires on a normal parent re-render with a new activeIndex after a user swipe.
  useEffect(() => {
    const collectionChanged = prevCollectionIdRef.current !== collectionId;
    const identityChanged = prevMediaIdentityRef.current !== mediaIdentity;
    const widthChanged = prevWidthRef.current !== width;

    prevCollectionIdRef.current = collectionId;
    prevMediaIdentityRef.current = mediaIdentity;
    prevWidthRef.current = width;

    if (!collectionChanged && !identityChanged && !widthChanged) return;
    if (!carouselRef.current || !stableMediaItems.length) return;

    const targetIndex = Math.max(0, Math.min(stableMediaItems.length - 1, initialActiveIndexRef.current));
    previousIndexRef.current = targetIndex;
    setActiveIndex(targetIndex);
    requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({ x: targetIndex * width, y: 0, animated: false });
    });
  }, [collectionId, mediaIdentity, stableMediaItems.length, width]);

  // Clamp active index when media item count shrinks below current position.
  useEffect(() => {
    if (!stableMediaItems.length) return;
    setActiveIndex((prev) => {
      const clamped = Math.min(prev, stableMediaItems.length - 1);
      if (clamped !== prev) previousIndexRef.current = clamped;
      return clamped;
    });
  }, [stableMediaItems.length]);

  // Scroll to initial position after mount when starting beyond index 0.
  useEffect(() => {
    if (initialActiveIndex <= 0 || !stableMediaItems.length) return;
    requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({ x: initialActiveIndex * width, y: 0, animated: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settleToMeasuredIndex = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const measuredIndex = Math.max(
        0,
        Math.min(stableMediaItems.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
      );
      const previousIndex = previousIndexRef.current;
      const jumpDistance = Math.abs(measuredIndex - previousIndex);
      const nextIndex = measuredIndex;

      previousIndexRef.current = nextIndex;
      scrollDevLog('horizontal-carousel-index', {
        collectionId: stableMediaItems[nextIndex]?.collectionId ?? null,
        mediaId: stableMediaItems[nextIndex]?.id ?? null,
        previousIndex,
        nextIndex,
        jumpDistance,
        corrected: false,
        mountedIndices: stableMediaItems
          .map((_, index) => index)
          .filter((index) => shouldMountSlide(index, nextIndex)),
      });
      if (nextIndex !== previousIndex) {
        const nextMedia = stableMediaItems[nextIndex] ?? null;
        trackMobileEvent('media_angle_swiped', {
          sourceScreen: 'runway_feed',
          itemId: collectionId,
          mediaId: nextMedia?.id ?? null,
          fromIndex: previousIndex,
          toIndex: nextIndex,
          mediaCount: stableMediaItems.length,
          aspectClass: getAspectClass(nextMedia?.aspectRatio),
        });
      }
      setActiveIndex(nextIndex);
      onActiveIndexChange(nextIndex);
    },
    [onActiveIndexChange, stableMediaItems, width],
  );

  // Momentum end is the primary settle signal, but Android drops it when the
  // finger releases exactly on a page boundary (zero velocity → no momentum
  // phase). A stale activeIndex then left the upcoming slide unmounted and the
  // dots frozen until the NEXT full swipe — the "swipe waits/holds" symptom.
  // Drag end with ~zero horizontal velocity is that missing settle signal; the
  // index math is idempotent, so double-firing with momentum end is harmless.
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) > 0.05) return;
      settleToMeasuredIndex(event);
    },
    [settleToMeasuredIndex],
  );

  if (!mediaItems.length) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <FeedMediaSlide media={null} imageIndex={0} viewportWidth={width} viewportHeight={pageHeight} onPress={onContentPress} />
      </View>
    );
  }

  if (!hasMultipleItems) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <FeedMediaSlide
          media={stableMediaItems[0] ?? null}
          imageIndex={0}
          viewportWidth={width}
          viewportHeight={pageHeight}
          allowDetailUpgrade={isActive}
          onPress={onContentPress}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* No `disableIntervalMomentum` here. With pagingEnabled and no
          snapToInterval it is dead on both platforms (iOS only reads it inside
          the snapToInterval/snapToOffsets branches of scrollViewWillEndDragging;
          Android short-circuits to smoothScrollAndSnap before reading it), and
          it was dropped so the flag does not get copied back onto the vertical
          feed — there it caused the slam-into-page settle. See the paging
          comment on RunwayFeedScreen's list. */}
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        directionalLockEnabled
        nestedScrollEnabled
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        onMomentumScrollEnd={settleToMeasuredIndex}
        onScrollEndDrag={handleScrollEndDrag}
      >
        {stableMediaItems.map((item, index) => (
          <View key={item.id} style={slideFrameStyle}>
            {shouldMountSlide(index, safeActiveIndex) ? (
              <FeedMediaSlide
                media={item}
                imageIndex={index}
                viewportWidth={width}
                viewportHeight={pageHeight}
                allowDetailUpgrade={isActive && index === safeActiveIndex}
                onPress={onContentPress}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Dots update on momentum end only; no JS state during drag keeps the
          thread free and touch fully responsive on low-end Android devices. */}
      <View style={styles.dotRow} pointerEvents="none">
        {stableMediaItems.map((_, index) => (
          <View
            key={`${stableMediaItems[index]?.id ?? index}-${index}`}
            style={[
              styles.dot,
              {
                backgroundColor: theme.colors.textInverse,
                opacity: index === safeActiveIndex ? 1.0 : 0.38,
                width: index === safeActiveIndex ? 18 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  slide: {
    height: '100%',
    position: 'relative',
  },
  dotRow: {
    position: 'absolute',
    bottom: 114,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
