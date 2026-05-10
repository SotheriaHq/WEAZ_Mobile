import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { prefetchResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { feedMediaDevLog, scrollDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { FeedMediaSlide } from '@/src/features/feed/components/FeedMediaSlide';
import type { FeedCarouselMedia, FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

type FeedMediaCarouselProps = {
  collectionId: string;
  mediaItems: FeedViewerMedia[];
  initialActiveIndex?: number;
  onActiveIndexChange: (nextIndex: number) => void;
  onContentPress?: () => void;
};

export const FeedMediaCarousel = React.memo(function FeedMediaCarousel({
  collectionId,
  mediaItems,
  initialActiveIndex = 0,
  onActiveIndexChange,
  onContentPress,
}: FeedMediaCarouselProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<FlatList<FeedCarouselMedia>>(null);
  const previousIndexRef = useRef(initialActiveIndex);
  const initialActiveIndexRef = useRef(initialActiveIndex);
  const prevCollectionIdRef = useRef<string>(collectionId);
  const prevMediaIdentityRef = useRef<string>('');
  const prevWidthRef = useRef<number>(width);
  const hasMultipleItems = mediaItems.length > 1;
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);
  const [scrollProgressIndex, setScrollProgressIndex] = useState(initialActiveIndex);
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
  const carouselItems = useMemo<FeedCarouselMedia[]>(
    () =>
      stableMediaItems.map((item) => ({
        ...item,
        virtualKey: item.id,
      })),
    [stableMediaItems],
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

  // Sync prop to ref so reset effect can read latest value without it being a dep
  useEffect(() => {
    initialActiveIndexRef.current = initialActiveIndex;
  }, [initialActiveIndex]);

  // Reset carousel ONLY when collection identity, media identity, or layout width truly changes.
  // Never fires just because the parent re-renders with a new activeIndex after a user swipe.
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
    setScrollProgressIndex(targetIndex);
    requestAnimationFrame(() => {
      carouselRef.current?.scrollToIndex({ index: targetIndex, animated: false });
    });
  }, [collectionId, mediaIdentity, stableMediaItems.length, width]);

  // Clamp active index when media items shrink beneath current position
  useEffect(() => {
    if (!stableMediaItems.length) return;
    setActiveIndex((prev) => {
      const clamped = Math.min(prev, stableMediaItems.length - 1);
      if (clamped !== prev) previousIndexRef.current = clamped;
      return clamped;
    });
    setScrollProgressIndex((current) => Math.min(current, stableMediaItems.length - 1));
  }, [stableMediaItems.length]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!width || stableMediaItems.length < 2) return;
      const nextProgress = Math.max(
        0,
        Math.min(stableMediaItems.length - 1, event.nativeEvent.contentOffset.x / width),
      );
      setScrollProgressIndex((current) => (Math.abs(current - nextProgress) < 0.03 ? current : nextProgress));
    },
    [stableMediaItems.length, width],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const measuredIndex = Math.max(
        0,
        Math.min(stableMediaItems.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
      );
      const previousIndex = previousIndexRef.current;
      const jumpDistance = Math.abs(measuredIndex - previousIndex);
      const nextIndex =
        jumpDistance > 1
          ? Math.max(0, Math.min(stableMediaItems.length - 1, previousIndex + Math.sign(measuredIndex - previousIndex)))
          : measuredIndex;

      if (nextIndex !== measuredIndex) {
        carouselRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      }

      previousIndexRef.current = nextIndex;
      setScrollProgressIndex(nextIndex);
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
        <FeedMediaSlide media={null} imageIndex={0} onPress={onContentPress} />
      </View>
    );
  }

  if (!hasMultipleItems) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <FeedMediaSlide media={stableMediaItems[0] ?? null} imageIndex={0} onPress={onContentPress} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <FlatList
        ref={carouselRef}
        horizontal
        pagingEnabled
        data={carouselItems}
        keyExtractor={(item, index) => `${item.id}:${index}`}
        renderItem={({ item, index }) => (
          <View style={[styles.pageImage, { width }]}>
            <FeedMediaSlide media={item} imageIndex={index} onPress={onContentPress} />
          </View>
        )}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        initialScrollIndex={safeActiveIndex > 0 ? safeActiveIndex : undefined}
        directionalLockEnabled
        nestedScrollEnabled
        bounces={false}
        decelerationRate="fast"
        disableIntervalMomentum
        windowSize={5}
        initialNumToRender={Math.min(2, carouselItems.length)}
        maxToRenderPerBatch={3}
        removeClippedSubviews={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollToIndexFailed={({ index }) => {
          requestAnimationFrame(() => {
            carouselRef.current?.scrollToOffset({ offset: index * width, animated: false });
          });
        }}
      />

      <View style={styles.dotRow} pointerEvents="none">
        {stableMediaItems.map((_, index) => (
          <View
            key={`${stableMediaItems[index]?.id ?? index}-${index}`}
            style={[
              styles.dot,
              {
                backgroundColor: theme.colors.textInverse,
                opacity: 0.38 + Math.max(0, 1 - Math.min(1, Math.abs(scrollProgressIndex - index))) * 0.62,
                width: 6 + Math.max(0, 1 - Math.min(1, Math.abs(scrollProgressIndex - index))) * 12,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pageImage: {
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
  dotActive: {
    width: 18,
  },
});
