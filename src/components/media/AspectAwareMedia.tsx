import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ImageStyle,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import {
  resolveMediaStrategy,
  type AspectAwareMediaStrategy,
} from './aspectAwareMediaStrategy';
import { tokens } from '@/src/styles/tokens';

type AspectAwareMediaSource = string | { uri?: string | null } | null | undefined;

export type AspectAwareMediaProps = {
  source: AspectAwareMediaSource;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAspectRatio?: number | null;
  blurhash?: string | null;
  dominantColor?: string | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  strategyOverride?: AspectAwareMediaStrategy | null;
  priority?: 'low' | 'normal' | 'high';
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  recyclingKey?: string;
  accessibilityLabel?: string;
  onLoad?: (event: any) => void;
  onError?: (event: any) => void;
  onPress?: () => void;
  testID?: string;
};

type MeasuredSize = {
  width: number;
  height: number;
};

const SOLID_DARK_SURFACE = tokens.themes.dark.colors.surface;
const BACKDROP_WASH_STRONG = tokens.themes.dark.colors.backdrop;
const BACKDROP_WASH_SOFT = tokens.themes.dark.colors.glassSurfaceSoft;

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeSource = (source: AspectAwareMediaSource): { uri: string } | null => {
  if (typeof source === 'string') {
    const uri = source.trim();
    return uri ? { uri } : null;
  }

  const uri = source?.uri?.trim();
  return uri ? { uri } : null;
};

const getLoadedSize = (event: any): MeasuredSize | null => {
  const width = event?.source?.width;
  const height = event?.source?.height;
  if (isPositiveFinite(width) && isPositiveFinite(height)) {
    return { width, height };
  }
  return null;
};

export function AspectAwareMedia({
  source,
  imageWidth,
  imageHeight,
  imageAspectRatio,
  blurhash,
  dominantColor,
  style,
  imageStyle,
  strategyOverride,
  priority = 'normal',
  cachePolicy = 'memory-disk',
  recyclingKey,
  accessibilityLabel,
  onLoad,
  onError,
  onPress,
  testID,
}: AspectAwareMediaProps) {
  const [containerSize, setContainerSize] = useState<MeasuredSize | null>(null);
  const [loadedSize, setLoadedSize] = useState<MeasuredSize | null>(null);
  const warnedInvalidDimensionsRef = useRef(false);
  const imageSource = useMemo(() => normalizeSource(source), [source]);
  const containerBackground = dominantColor || SOLID_DARK_SURFACE;
  const resolvedImageWidth = imageWidth ?? loadedSize?.width ?? null;
  const resolvedImageHeight = imageHeight ?? loadedSize?.height ?? null;
  const resolvedAspectRatio =
    imageAspectRatio ??
    (isPositiveFinite(resolvedImageWidth) && isPositiveFinite(resolvedImageHeight)
      ? resolvedImageWidth / resolvedImageHeight
      : null);

  const strategy = resolveMediaStrategy({
    containerWidth: containerSize?.width ?? 0,
    containerHeight: containerSize?.height ?? 0,
    imageWidth: resolvedImageWidth,
    imageHeight: resolvedImageHeight,
    imageAspectRatio: resolvedAspectRatio,
    override: strategyOverride,
  });

  useEffect(() => {
    if (!__DEV__ || warnedInvalidDimensionsRef.current) return;

    const hasInvalidImageDimensions =
      (imageWidth != null && !isPositiveFinite(imageWidth)) ||
      (imageHeight != null && !isPositiveFinite(imageHeight)) ||
      (imageAspectRatio != null && !isPositiveFinite(imageAspectRatio));

    if (hasInvalidImageDimensions) {
      warnedInvalidDimensionsRef.current = true;
      console.warn('[AspectAwareMedia] Ignoring invalid image dimensions.');
    }
  }, [imageAspectRatio, imageHeight, imageWidth]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) return;

    setContainerSize((current) => {
      if (current?.width === width && current.height === height) return current;
      return { width, height };
    });
  }, []);

  const handleLoad = useCallback(
    (event: any) => {
      const nextSize = getLoadedSize(event);
      if (nextSize) setLoadedSize(nextSize);
      onLoad?.(event);
    },
    [onLoad],
  );

  const placeholder = blurhash ? { blurhash } : undefined;
  const foreground = imageSource ? (
    <ExpoImage
      source={imageSource}
      placeholder={placeholder}
      style={[styles.foregroundImage, imageStyle]}
      contentFit={strategy === 'edge' ? 'cover' : 'contain'}
      cachePolicy={cachePolicy}
      priority={priority}
      recyclingKey={recyclingKey}
      accessibilityLabel={accessibilityLabel}
      onLoad={handleLoad}
      onError={onError}
    />
  ) : null;

  const blurredBackdrop =
    imageSource && (strategy === 'contain-blur' || strategy === 'letter-blur' || strategy === 'letter-soft') ? (
      <>
        <ExpoImage
          source={imageSource}
          placeholder={placeholder}
          style={[styles.backdropImage, strategy === 'letter-soft' ? styles.backdropSoft : styles.backdropStrong]}
          contentFit="cover"
          cachePolicy={cachePolicy}
          priority={priority}
          recyclingKey={recyclingKey ? `${recyclingKey}:backdrop` : undefined}
          blurRadius={strategy === 'letter-soft' ? 24 : 40}
        />
        <View style={[styles.backdropWash, strategy === 'letter-soft' ? styles.backdropWashSoft : null]} />
      </>
    ) : null;

  const mediaElement = (
    <View
      onLayout={handleLayout}
      style={[
        styles.root,
        { backgroundColor: containerBackground },
        style,
      ]}
      testID={onPress ? undefined : testID}
    >
      {blurredBackdrop}
      {foreground}
    </View>
  );

  if (!onPress) return mediaElement;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
    >
      {mediaElement}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  foregroundImage: {
    ...StyleSheet.absoluteFill,
  },
  backdropImage: {
    ...StyleSheet.absoluteFill,
    transform: [{ scale: 1.08 }],
  },
  backdropStrong: {
    opacity: 0.76,
  },
  backdropSoft: {
    opacity: 0.62,
    transform: [{ scale: 1.04 }],
  },
  backdropWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BACKDROP_WASH_STRONG,
  },
  backdropWashSoft: {
    backgroundColor: BACKDROP_WASH_SOFT,
  },
});
