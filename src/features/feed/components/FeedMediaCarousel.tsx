import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { prefetchResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { feedMediaDevLog, scrollDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { FeedMediaSlide } from '@/src/features/feed/components/FeedMediaSlide';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

type FeedMediaCarouselProps = {
  collectionId: string;
  mediaItems: FeedViewerMedia[];
  pageHeight: number;
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
 */
export const FeedMediaCarousel = React.memo(function FeedMediaCarousel({
  collectionId,
  mediaItems,
  pageHeight,
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

  const stableMediaItems = useMemo(
    () =>
      mediaItems.map((item) => ({
        ...item,
        url: normalizeStableUri(item.url) ?? item.url,
        displayUrl: normalizeStableUri(item.displayUrl) ?? normalizeStableUri(item.url) ?? item.url,
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
    });
  }, [collectionId, safeActiveIndex, stableMediaItems.length, uniqueDisplayUrls, uniqueMediaIds]);

  // Prefetch next image to eliminate loading lag on swipe.
  useEffect(() => {
    if (stableMediaItems.length < 2) return;
    const nextIndex = Math.min(stableMediaItems.length - 1, safeActiveIndex + 1);
    const next = stableMediaItems[nextIndex];
    if (!next) return;
    void prefetchResolvedImageAsset({
      src: next.displayUrl ?? next.url,
      fileId: next.fileId,
      debugContext: {
        designId: next.id,
        fileId: next.fileId ?? undefined,
        mediaIndex: nextIndex,
        sourceField: next.fileId ? 'feed.media.fileId' : 'feed.media.displayUrl',
      },
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

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const measuredIndex = Math.max(
        0,
        Math.min(stableMediaItems.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
      );
      const previousIndex = previousIndexRef.current;
      const jumpDistance = Math.abs(measuredIndex - previousIndex);

      // Limit to one page per gesture even if the device let momentum carry farther.
      const nextIndex =
        jumpDistance > 1
          ? Math.max(0, Math.min(stableMediaItems.length - 1, previousIndex + Math.sign(measuredIndex - previousIndex)))
          : measuredIndex;

      if (nextIndex !== measuredIndex) {
        carouselRef.current?.scrollTo({ x: nextIndex * width, y: 0, animated: false });
      }

      previousIndexRef.current = nextIndex;
      scrollDevLog('horizontal-carousel-index', {
        collectionId: stableMediaItems[nextIndex]?.collectionId ?? null,
        mediaId: stableMediaItems[nextIndex]?.id ?? null,
        previousIndex,
        nextIndex,
        jumpDistance,
        corrected: nextIndex !== measuredIndex,
      });
      setActiveIndex(nextIndex);
      onActiveIndexChange(nextIndex);
    },
    [onActiveIndexChange, stableMediaItems, width],
  );

  if (!mediaItems.length) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <FeedMediaSlide media={null} imageIndex={0} viewportWidth={width} viewportHeight={pageHeight} onPress={onContentPress} />
      </View>
    );
  }

  if (!hasMultipleItems) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <FeedMediaSlide
          media={stableMediaItems[0] ?? null}
          imageIndex={0}
          viewportWidth={width}
          viewportHeight={pageHeight}
          onPress={onContentPress}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
        nestedScrollEnabled
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {stableMediaItems.map((item, index) => (
          <View key={item.id} style={[styles.slide, { width }]}>
            <FeedMediaSlide
              media={item}
              imageIndex={index}
              viewportWidth={width}
              viewportHeight={pageHeight}
              onPress={onContentPress}
            />
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
