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

type AspectAwareMediaSource =
  | string
  | { uri?: string | null; cacheKey?: string | null }
  | null
  | undefined;

export type AspectAwareMediaProps = {
  source: AspectAwareMediaSource;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAspectRatio?: number | null;
  blurhash?: string | null;
  placeholderSource?: AspectAwareMediaSource;
  dominantColor?: string | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  strategyOverride?: AspectAwareMediaStrategy | null;
  priority?: 'low' | 'normal' | 'high';
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  transition?: number;
  recyclingKey?: string;
  accessibilityLabel?: string;
  /** Dev-only label identifying the calling surface in media diagnostics. */
  diagnosticsLabel?: string;
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
// Phase 10: ambient backdrops must stay light and image-reflective — never a dark
// blanket. The blurred same-image copy sits at low opacity over the dominant-color
// matte; the wash is only a faint legibility scrim. Square and landscape use
// deliberately DIFFERENT values so the two never read as the same treatment:
//   • landscape (letter-blur): blur 16, image opacity 0.55  — stronger ambient
//   • square    (letter-soft): blur 10, image opacity 0.32  — subtle ambient
const BACKDROP_WASH_STRONG = 'rgba(0, 0, 0, 0.1)';
const BACKDROP_WASH_SOFT = 'rgba(0, 0, 0, 0.12)';
const BACKDROP_BLUR_STRONG = 16;
const BACKDROP_BLUR_SOFT = 10;

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeSource = (source: AspectAwareMediaSource): { uri: string; cacheKey?: string } | null => {
  if (typeof source === 'string') {
    const uri = source.trim();
    return uri ? { uri } : null;
  }

  const uri = source?.uri?.trim();
  const cacheKey = source?.cacheKey?.trim();
  return uri ? { uri, ...(cacheKey ? { cacheKey } : {}) } : null;
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
  placeholderSource,
  dominantColor,
  style,
  imageStyle,
  strategyOverride,
  priority = 'normal',
  cachePolicy = 'memory-disk',
  transition = 160,
  recyclingKey,
  accessibilityLabel,
  diagnosticsLabel,
  onLoad,
  onError,
  onPress,
  testID,
}: AspectAwareMediaProps) {
  const [containerSize, setContainerSize] = useState<MeasuredSize | null>(null);
  const [loadedSize, setLoadedSize] = useState<MeasuredSize | null>(null);
  const warnedInvalidDimensionsRef = useRef(false);
  const imageSource = useMemo(() => normalizeSource(source), [source]);
  const normalizedPlaceholderSource = useMemo(
    () => normalizeSource(placeholderSource),
    [placeholderSource],
  );
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

  // Dev-only media diagnostics: surface, media + viewport geometry, the resolved
  // class, foreground fit, backdrop mode, blur amount, and whether the dimensions
  // were inferred only after onLoad. Mirrors the runway image-fit-policy logs.
  useEffect(() => {
    if (!__DEV__) return;
    const viewportAspect =
      containerSize && containerSize.height > 0 ? containerSize.width / containerSize.height : null;
    const usesBackdrop =
      strategy === 'contain-blur' || strategy === 'letter-blur' || strategy === 'letter-soft';
    console.debug('[AspectAwareMedia] strategy', {
      source: diagnosticsLabel ?? 'AspectAwareMedia',
      mediaWidth: resolvedImageWidth,
      mediaHeight: resolvedImageHeight,
      mediaAspect: resolvedAspectRatio,
      viewportWidth: containerSize?.width ?? null,
      viewportHeight: containerSize?.height ?? null,
      viewportAspect,
      strategy,
      foregroundContentFit: strategy === 'edge' ? 'cover' : 'contain',
      backdropMode: usesBackdrop ? (strategy === 'letter-soft' ? 'soft-blur' : 'blur') : 'matte',
      blurAmount: usesBackdrop ? (strategy === 'letter-soft' ? BACKDROP_BLUR_SOFT : BACKDROP_BLUR_STRONG) : 0,
      dimensionsInferredPostLoad: imageAspectRatio == null && imageWidth == null && loadedSize != null,
    });
  }, [
    containerSize,
    diagnosticsLabel,
    imageAspectRatio,
    imageWidth,
    loadedSize,
    resolvedAspectRatio,
    resolvedImageHeight,
    resolvedImageWidth,
    strategy,
  ]);

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

  const placeholder = blurhash ? { blurhash } : normalizedPlaceholderSource ?? undefined;
  const foreground = imageSource ? (
    <ExpoImage
      source={imageSource}
      placeholder={placeholder}
      style={[styles.foregroundImage, imageStyle]}
      contentFit={strategy === 'edge' ? 'cover' : 'contain'}
      placeholderContentFit={strategy === 'edge' ? 'cover' : 'contain'}
      cachePolicy={cachePolicy}
      transition={transition}
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
          placeholderContentFit="cover"
          cachePolicy={cachePolicy}
          transition={transition}
          priority={priority}
          recyclingKey={recyclingKey ? `${recyclingKey}:backdrop` : undefined}
          blurRadius={strategy === 'letter-soft' ? BACKDROP_BLUR_SOFT : BACKDROP_BLUR_STRONG}
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
    transform: [{ scale: 1.15 }],
  },
  backdropStrong: {
    // Landscape ambient: image-reflective, semi-transparent over the dominant matte.
    opacity: 0.55,
  },
  backdropSoft: {
    // Square ambient: noticeably lighter than landscape — subtle, never a gutter veil.
    opacity: 0.32,
    transform: [{ scale: 1.08 }],
  },
  backdropWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BACKDROP_WASH_STRONG,
  },
  backdropWashSoft: {
    backgroundColor: BACKDROP_WASH_SOFT,
  },
});
