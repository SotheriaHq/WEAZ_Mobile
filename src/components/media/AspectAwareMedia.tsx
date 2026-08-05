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
/**
 * Smallest container change worth re-measuring against, in dp.
 *
 * Yoga re-emits `onLayout` with sub-dp differences for a box that has not
 * actually moved — on the reported device the same runway page reported
 * 937.1428833 / 937.1427002 / 937.1430664 dp in a single scroll. Accepting each
 * one re-rendered the media, and with `transition` set that re-render is a
 * cross-fade: the image visibly twitched before settling. The resolved strategy
 * depends only on the container's *aspect*, which sub-dp noise cannot move, so
 * anything under half a dp is dropped.
 */
const LAYOUT_NOISE_EPSILON_DP = 0.5;
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
  const [hasRevealed, setHasRevealed] = useState(false);
  const warnedInvalidDimensionsRef = useRef(false);
  /**
   * Once a source has a known aspect + a measured container, freeze the fit.
   * Yoga re-layout and post-load dimension refinement were flipping
   * letter-solid ↔ edge and re-running ExpoImage's cross-fade — the runway
   * "shake before it balances" report. Identity is recyclingKey when present
   * so FlatList cell reuse starts clean.
   */
  const lockedStrategyRef = useRef<{ identity: string; strategy: AspectAwareMediaStrategy } | null>(null);
  const lastLoggedStrategyRef = useRef<string | null>(null);
  const imageSource = useMemo(() => normalizeSource(source), [source]);
  const normalizedPlaceholderSource = useMemo(
    () => normalizeSource(placeholderSource),
    [placeholderSource],
  );
  const sourceIdentity = recyclingKey ?? imageSource?.uri ?? '';
  const containerBackground = dominantColor || SOLID_DARK_SURFACE;
  const resolvedImageWidth = imageWidth ?? loadedSize?.width ?? null;
  const resolvedImageHeight = imageHeight ?? loadedSize?.height ?? null;
  const resolvedAspectRatio =
    imageAspectRatio ??
    (isPositiveFinite(resolvedImageWidth) && isPositiveFinite(resolvedImageHeight)
      ? resolvedImageWidth / resolvedImageHeight
      : null);

  const resolvedStrategy = resolveMediaStrategy({
    containerWidth: containerSize?.width ?? 0,
    containerHeight: containerSize?.height ?? 0,
    imageWidth: resolvedImageWidth,
    imageHeight: resolvedImageHeight,
    imageAspectRatio: resolvedAspectRatio,
    override: strategyOverride,
  });

  // Lock only after aspect is known. Unknown → letter-solid is a temporary
  // first paint; locking it would permanently letterbox tall media that only
  // reports size in onLoad (MarketCommerceViewer designs are the common case).
  // Do NOT key the lock on strategyOverride alone — FeedImage always passes
  // one, even while aspect is still null.
  const canLockStrategy = resolvedAspectRatio != null;

  let strategy = resolvedStrategy;
  if (canLockStrategy) {
    const locked = lockedStrategyRef.current;
    if (!locked || locked.identity !== sourceIdentity) {
      lockedStrategyRef.current = { identity: sourceIdentity, strategy: resolvedStrategy };
      strategy = resolvedStrategy;
    } else {
      strategy = locked.strategy;
    }
  } else if (lockedStrategyRef.current?.identity !== sourceIdentity) {
    lockedStrategyRef.current = null;
  }

  // One reveal fade only. After the first successful load, further prop churn
  // (strategy lock, parent re-render, sub-dp layout) must not re-cross-fade.
  const effectiveTransition = hasRevealed ? 0 : transition;

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

  // Dev-only media diagnostics. Log only when the *decided* fit changes — the
  // previous effect re-fired on every parent render and flooded Metro while
  // making strategy thrash look worse than it was.
  useEffect(() => {
    if (!__DEV__) return;
    const viewportAspect =
      containerSize && containerSize.height > 0 ? containerSize.width / containerSize.height : null;
    const usesBackdrop =
      strategy === 'contain-blur' || strategy === 'letter-blur' || strategy === 'letter-soft';
    const signature = [
      diagnosticsLabel ?? 'AspectAwareMedia',
      sourceIdentity,
      strategy,
      resolvedImageWidth ?? 'x',
      resolvedImageHeight ?? 'x',
      containerSize?.width != null ? Math.round(containerSize.width) : 'x',
      containerSize?.height != null ? Math.round(containerSize.height) : 'x',
    ].join('|');
    if (lastLoggedStrategyRef.current === signature) return;
    lastLoggedStrategyRef.current = signature;
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
      locked: canLockStrategy,
    });
  }, [
    canLockStrategy,
    containerSize,
    diagnosticsLabel,
    imageAspectRatio,
    imageWidth,
    loadedSize,
    resolvedAspectRatio,
    resolvedImageHeight,
    resolvedImageWidth,
    sourceIdentity,
    strategy,
  ]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) return;

    setContainerSize((current) => {
      if (
        current &&
        Math.abs(current.width - width) < LAYOUT_NOISE_EPSILON_DP &&
        Math.abs(current.height - height) < LAYOUT_NOISE_EPSILON_DP
      ) {
        return current;
      }
      return { width, height };
    });
  }, []);

  const handleLoad = useCallback(
    (event: any) => {
      const nextSize = getLoadedSize(event);
      if (nextSize) {
        // Skip state when the parent already supplied dimensions — writing the
        // same size back forces a re-render (and used to re-run strategy).
        setLoadedSize((current) => {
          if (
            isPositiveFinite(imageWidth) &&
            isPositiveFinite(imageHeight)
          ) {
            return current;
          }
          if (
            current &&
            current.width === nextSize.width &&
            current.height === nextSize.height
          ) {
            return current;
          }
          return nextSize;
        });
      }
      setHasRevealed(true);
      onLoad?.(event);
    },
    [imageHeight, imageWidth, onLoad],
  );

  const previousSourceIdentityRef = useRef(sourceIdentity);
  useEffect(() => {
    // Only reset on a real identity change — running on first mount would race
    // the first onLoad and re-enable the cross-fade after the image had already
    // painted, which reintroduced the shake on recycled cells.
    if (previousSourceIdentityRef.current === sourceIdentity) return;
    previousSourceIdentityRef.current = sourceIdentity;
    setHasRevealed(false);
  }, [sourceIdentity]);

  const placeholder = blurhash ? { blurhash } : normalizedPlaceholderSource ?? undefined;
  const foreground = imageSource ? (
    <ExpoImage
      source={imageSource}
      placeholder={placeholder}
      style={[styles.foregroundImage, imageStyle]}
      contentFit={strategy === 'edge' ? 'cover' : 'contain'}
      placeholderContentFit={strategy === 'edge' ? 'cover' : 'contain'}
      cachePolicy={cachePolicy}
      transition={effectiveTransition}
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
