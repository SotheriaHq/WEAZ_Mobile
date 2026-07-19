import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AspectAwareMedia } from '@/src/components/media/AspectAwareMedia';
import {
  buildFeedImageCacheKey,
  resolveFeedImageSourcePolicy,
  type FeedImageSourceTier,
} from '@/src/features/feed/media/feedImageSourcePolicy';
import { resolveRunwayMediaStrategy } from '@/src/features/feed/media/runwayMediaStrategy';
import { feedMediaDevLog, mediaDevWarn } from '@/src/features/feed/utils/feedDiagnostics';
import { markRunwayFirstMediaVisible } from '@/src/features/feed/utils/runwayReadiness';
import { resolveImageUri, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

// The runway is an immersive media surface: the stage behind every image is
// deep black in BOTH themes (true-black dark token), so letterboxed content
// sits on an invisible stage instead of white/soft padding.
const RUNWAY_MATTE = tokens.themes.dark.colors.bg;
const RUNWAY_SHIMMER = tokens.themes.dark.colors.border;

type FeedImageLoadState = 'idle' | 'resolving' | 'loading' | 'loaded' | 'failed';
type FeedImageAspectClass = 'portrait' | 'square' | 'landscape' | 'unknown';

type FeedImageProps = {
  id: string;
  displayUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  fileId?: string | null;
  blurHash?: string | null;
  dominantColor?: string | null;
  label?: string | null;
  style?: StyleProp<ViewStyle>;
  sourceType?: string;
  imageIndex?: number;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  naturalWidth?: number | null;
  naturalHeight?: number | null;
  aspectRatio?: number | null;
  aspectClass?: FeedImageAspectClass;
  frostedBackdrop?: boolean;
  allowDetailUpgrade?: boolean;
};

type SourceSelection = {
  identity: string;
  tier: FeedImageSourceTier;
};

type SuccessfulSource = SourceSelection & {
  uri: string;
};

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function FeedImagePlaceholder({
  backgroundColor,
  shimmerColor,
}: {
  backgroundColor: string;
  shimmerColor: string;
}) {
  const shimmer = useRef(new Animated.Value(0.18)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 0.52,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.18,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: shimmer, backgroundColor: shimmerColor }]}
      />
    </View>
  );
}

export const FeedImage = React.memo(function FeedImage({
  id,
  displayUrl,
  thumbnailUrl,
  previewUrl,
  fileId,
  blurHash,
  dominantColor,
  label,
  style,
  sourceType,
  imageIndex,
  viewportWidth,
  viewportHeight,
  naturalWidth,
  naturalHeight,
  aspectRatio,
  aspectClass,
  frostedBackdrop = true,
  allowDetailUpgrade = true,
}: FeedImageProps) {
  const { theme } = useTheme();
  const placeholderSurface = dominantColor || theme.colors.surfaceAlt;
  const sourcePolicy = useMemo(
    () => resolveFeedImageSourcePolicy({ displayUrl, previewUrl, thumbnailUrl }),
    [displayUrl, previewUrl, thumbnailUrl],
  );
  const sourceIdentity = `${id}|${fileId ?? ''}|${sourcePolicy.initialUrl ?? ''}|${sourcePolicy.detailUrl ?? ''}`;
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>({
    identity: sourceIdentity,
    tier: sourcePolicy.initialTier,
  });
  const [successfulSource, setSuccessfulSource] = useState<SuccessfulSource | null>(null);
  const [loadState, setLoadState] = useState<FeedImageLoadState>('idle');
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [loadedNaturalSize, setLoadedNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const failedUriSetRef = useRef<Set<string>>(new Set());

  const activeTier = sourceSelection.identity === sourceIdentity
    ? sourceSelection.tier
    : sourcePolicy.initialTier;
  const sourceUrl = activeTier === 'detail' ? sourcePolicy.detailUrl : sourcePolicy.initialUrl;
  const hasSource = Boolean(sourceUrl || fileId);
  const resolutionFileId = sourceUrl ? null : fileId;
  const debugContext = useMemo(
    () => ({
      designId: id,
      fileId,
      mediaIndex: imageIndex,
      sourceField: sourceType ?? (fileId ? 'feed.media.fileId' : 'feed.media.displayUrl'),
    }),
    [fileId, id, imageIndex, sourceType],
  );
  const { uri } = useResolvedImageAsset({
    src: sourceUrl,
    fileId: resolutionFileId,
    enabled: hasSource,
    allowSignedFallback: false,
    debugContext,
  });
  const currentUri = sourceUrl ? (uri === sourceUrl ? uri : null) : uri;
  const visibleSuccessfulSource = successfulSource?.identity === sourceIdentity ? successfulSource : null;
  const measuredAspectRatio =
    (isPositiveFinite(aspectRatio) ? aspectRatio : null) ??
    (isPositiveFinite(naturalWidth) && isPositiveFinite(naturalHeight) ? naturalWidth / naturalHeight : null) ??
    (loadedNaturalSize ? loadedNaturalSize.width / loadedNaturalSize.height : null);
  const resolvedImageWidth = isPositiveFinite(naturalWidth) ? naturalWidth : loadedNaturalSize?.width ?? null;
  const resolvedImageHeight = isPositiveFinite(naturalHeight) ? naturalHeight : loadedNaturalSize?.height ?? null;
  const strategyResult = useMemo(
    () => resolveRunwayMediaStrategy({
      viewportWidth,
      viewportHeight,
      imageWidth: resolvedImageWidth,
      imageHeight: resolvedImageHeight,
      imageAspectRatio: measuredAspectRatio,
    }),
    [measuredAspectRatio, resolvedImageHeight, resolvedImageWidth, viewportHeight, viewportWidth],
  );
  const currentImageSource = useMemo(
    () => currentUri
      ? {
          uri: currentUri,
          cacheKey: buildFeedImageCacheKey({ fileId, url: currentUri, tier: activeTier }),
        }
      : null,
    [activeTier, currentUri, fileId],
  );
  const successfulImageSource = useMemo(
    () => visibleSuccessfulSource
      ? {
          uri: visibleSuccessfulSource.uri,
          cacheKey: buildFeedImageCacheKey({
            fileId,
            url: visibleSuccessfulSource.uri,
            tier: visibleSuccessfulSource.tier,
          }),
        }
      : null,
    [fileId, visibleSuccessfulSource],
  );
  const metadataPlaceholderUrl = sourcePolicy.placeholderUrl;
  const placeholderSource = useMemo(
    () => visibleSuccessfulSource && visibleSuccessfulSource.uri !== currentUri
      ? successfulImageSource ?? undefined
      : metadataPlaceholderUrl
        ? {
            uri: metadataPlaceholderUrl,
            cacheKey: buildFeedImageCacheKey({ fileId, url: metadataPlaceholderUrl, tier: 'thumbnail' }),
          }
        : undefined,
    [currentUri, fileId, metadataPlaceholderUrl, successfulImageSource, visibleSuccessfulSource],
  );
  const placeholderKind = blurHash
    ? 'blurhash'
    : placeholderSource
      ? visibleSuccessfulSource
        ? visibleSuccessfulSource.tier
        : 'thumbnail'
      : dominantColor
        ? 'dominant-color'
        : 'theme-shimmer';

  useEffect(() => {
    setSourceSelection({ identity: sourceIdentity, tier: sourcePolicy.initialTier });
    setSuccessfulSource(null);
    setLoadState(hasSource ? 'resolving' : 'idle');
    setFailedUri(null);
    setLoadedNaturalSize(null);
    failedUriSetRef.current = new Set();
  }, [hasSource, sourceIdentity, sourcePolicy.initialTier]);

  useEffect(() => {
    if (!hasSource) {
      setLoadState('idle');
      return;
    }
    setFailedUri(null);
    setLoadState(currentUri ? 'loading' : 'resolving');
  }, [activeTier, currentUri, hasSource, retryToken, sourceIdentity, sourceUrl]);

  useEffect(() => {
    if (
      !allowDetailUpgrade ||
      !sourcePolicy.hasDetailUpgrade ||
      activeTier === 'detail' ||
      !visibleSuccessfulSource
    ) {
      return;
    }
    setSourceSelection({ identity: sourceIdentity, tier: 'detail' });
  }, [activeTier, allowDetailUpgrade, sourceIdentity, sourcePolicy.hasDetailUpgrade, visibleSuccessfulSource]);

  useEffect(() => {
    if (!__DEV__) return;
    feedMediaDevLog('image-fit-policy', {
      itemId: id,
      mediaIndex: imageIndex ?? null,
      reportedWidth: naturalWidth ?? null,
      reportedHeight: naturalHeight ?? null,
      reportedAspect: aspectRatio ?? null,
      inferredWidth: loadedNaturalSize?.width ?? null,
      inferredHeight: loadedNaturalSize?.height ?? null,
      inferredAspect: loadedNaturalSize ? loadedNaturalSize.width / loadedNaturalSize.height : null,
      resolvedAspect: strategyResult.imageAspectRatio,
      aspectClass: aspectClass ?? strategyResult.imageClass,
      strategy: strategyResult.strategy,
      coverCropFraction: strategyResult.coverCropFraction,
      cropTolerance: 0.12,
      placeholderSource: placeholderKind,
      currentSourceTier: activeTier,
      finalSourceTier: sourcePolicy.hasDetailUpgrade ? 'detail' : sourcePolicy.initialTier,
      allowDetailUpgrade,
      frostedBackdrop,
    });
  }, [
    activeTier,
    allowDetailUpgrade,
    aspectClass,
    aspectRatio,
    frostedBackdrop,
    id,
    imageIndex,
    loadedNaturalSize,
    naturalHeight,
    naturalWidth,
    placeholderKind,
    sourcePolicy.hasDetailUpgrade,
    sourcePolicy.initialTier,
    strategyResult,
  ]);

  const handleRetry = useCallback(() => {
    setFailedUri(null);
    failedUriSetRef.current = new Set();
    setLoadState(hasSource ? 'resolving' : 'idle');
    setRetryToken((current) => current + 1);
    void resolveImageUri({
      src: sourceUrl,
      fileId: resolutionFileId,
      forceRefresh: true,
      allowSignedFallback: false,
      debugContext,
    });
  }, [debugContext, hasSource, resolutionFileId, sourceUrl]);

  const renderFallback = (copy: string) => (
    <Pressable
      onPress={handleRetry}
      disabled={!hasSource}
      style={[styles.root, styles.fallback, { backgroundColor: placeholderSurface }, style]}
      accessibilityRole={hasSource ? 'button' : undefined}
      accessibilityLabel={hasSource ? 'Retry image preview' : 'Image preview unavailable'}
    >
      <AppText variant="display">Image</AppText>
      <AppText variant="subtitle">Preview unavailable</AppText>
      <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.fallbackText}>
        {label || copy}
      </AppText>
    </Pressable>
  );

  if (!hasSource) return renderFallback('No media source available');
  if (loadState === 'failed' && !visibleSuccessfulSource) return renderFallback('Tap to retry');

  return (
    <View style={[styles.root, { backgroundColor: RUNWAY_MATTE }, style]}>
      {!visibleSuccessfulSource ? (
        <FeedImagePlaceholder
          backgroundColor={RUNWAY_MATTE}
          shimmerColor={RUNWAY_SHIMMER}
        />
      ) : null}

      {visibleSuccessfulSource && successfulImageSource && visibleSuccessfulSource.uri !== currentUri ? (
        <AspectAwareMedia
          source={successfulImageSource}
          blurhash={blurHash}
          dominantColor={RUNWAY_MATTE}
          imageWidth={resolvedImageWidth}
          imageHeight={resolvedImageHeight}
          imageAspectRatio={strategyResult.imageAspectRatio}
          style={StyleSheet.absoluteFill}
          strategyOverride={strategyResult.strategy}
          recyclingKey={`${id}:${visibleSuccessfulSource.tier}:stale`}
          transition={0}
          accessibilityLabel={label ?? 'Feed image'}
          diagnosticsLabel="RunwayFeedImage:preview"
        />
      ) : null}

      {currentUri && currentImageSource && currentUri !== failedUri ? (
        <AspectAwareMedia
          source={currentImageSource}
          placeholderSource={placeholderSource}
          blurhash={blurHash}
          dominantColor={RUNWAY_MATTE}
          imageWidth={resolvedImageWidth}
          imageHeight={resolvedImageHeight}
          imageAspectRatio={strategyResult.imageAspectRatio}
          style={StyleSheet.absoluteFill}
          strategyOverride={strategyResult.strategy}
          recyclingKey={`${id}:${activeTier}:${retryToken}`}
          // Detail upgrades swap over an identical-layout preview already on
          // screen: transition 0 reads as an instant sharpen. A fade here
          // cross-faded the whole image right after it appeared — one of the
          // per-page "double blink" sources.
          transition={activeTier === 'detail' ? 0 : 120}
          accessibilityLabel={label ?? 'Feed image'}
          diagnosticsLabel="RunwayFeedImage"
          onLoad={(event) => {
            const nextWidth = event.source?.width;
            const nextHeight = event.source?.height;
            if (isPositiveFinite(nextWidth) && isPositiveFinite(nextHeight)) {
              setLoadedNaturalSize({ width: nextWidth, height: nextHeight });
            }
            setSuccessfulSource({ identity: sourceIdentity, uri: currentUri, tier: activeTier });
            setLoadState('loaded');
            if (allowDetailUpgrade) {
              markRunwayFirstMediaVisible({ mediaId: id, sourceTier: activeTier });
            }
            if (allowDetailUpgrade && sourcePolicy.hasDetailUpgrade && activeTier !== 'detail') {
              requestAnimationFrame(() => {
                setSourceSelection({ identity: sourceIdentity, tier: 'detail' });
              });
            }
          }}
          onError={(event) => {
            if (failedUriSetRef.current.has(currentUri)) return;
            failedUriSetRef.current.add(currentUri);
            mediaDevWarn('image-on-error', {
              mediaId: id,
              sourceType: sourceType ?? (displayUrl ? 'display-url' : fileId ? 'protected-file-id' : 'missing-source'),
              sourceTier: activeTier,
              hasFileId: Boolean(fileId),
              error: typeof event?.error === 'string' ? event.error : 'image-load-error',
            });
            setFailedUri(currentUri);
            if (sourcePolicy.hasDetailUpgrade && activeTier !== 'detail') {
              setSourceSelection({ identity: sourceIdentity, tier: 'detail' });
              return;
            }
            setLoadState(visibleSuccessfulSource ? 'loaded' : 'failed');
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fallbackText: {
    marginTop: 6,
    textAlign: 'center',
  },
});
