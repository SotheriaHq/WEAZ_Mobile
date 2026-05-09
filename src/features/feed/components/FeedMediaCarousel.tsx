import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { scrollDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { FeedMediaSlide } from '@/src/features/feed/components/FeedMediaSlide';
import type { FeedCarouselMedia, FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

type FeedMediaCarouselProps = {
  mediaItems: FeedViewerMedia[];
  initialActiveIndex?: number;
  onActiveIndexChange: (nextIndex: number) => void;
};

export const FeedMediaCarousel = React.memo(function FeedMediaCarousel({
  mediaItems,
  initialActiveIndex = 0,
  onActiveIndexChange,
}: FeedMediaCarouselProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<FlatList<FeedCarouselMedia>>(null);
  const previousIndexRef = useRef(initialActiveIndex);
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
  const carouselItems = useMemo<FeedCarouselMedia[]>(
    () =>
      stableMediaItems.map((item) => ({
        ...item,
        virtualKey: item.id,
      })),
    [stableMediaItems],
  );

  useEffect(() => {
    if (!carouselRef.current || !stableMediaItems.length) return;
    carouselRef.current.scrollToIndex({ index: safeActiveIndex, animated: false });
  }, [safeActiveIndex, stableMediaItems.length, width]);

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
      scrollDevLog('horizontal-carousel-index', {
        collectionId: stableMediaItems[nextIndex]?.collectionId ?? null,
        mediaId: stableMediaItems[nextIndex]?.id ?? null,
        previousIndex,
        nextIndex,
        jumpDistance,
      });
      setActiveIndex(nextIndex);
      onActiveIndexChange(nextIndex);
    },
    [onActiveIndexChange, stableMediaItems, width],
  );

  if (!mediaItems.length) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <FeedMediaSlide media={null} imageIndex={0} />
      </View>
    );
  }

  if (!hasMultipleItems) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <FeedMediaSlide media={stableMediaItems[0] ?? null} imageIndex={0} />
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
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={[styles.pageImage, { width }]}>
            <FeedMediaSlide media={item} imageIndex={index} />
          </View>
        )}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        initialScrollIndex={safeActiveIndex > 0 ? safeActiveIndex : undefined}
        directionalLockEnabled
        nestedScrollEnabled
        bounces={false}
        decelerationRate="fast"
        disableIntervalMomentum
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews={Platform.OS === 'android'}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEnabled
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
              { backgroundColor: theme.colors.textMuted },
              index === safeActiveIndex && [styles.dotActive, { backgroundColor: theme.colors.textInverse }],
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pageImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
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
