import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { resolveImageUri, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { feedMediaDevLog, mediaDevWarn } from '@/src/features/feed/utils/feedDiagnostics';

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
  contentFit?: ImageContentFit;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  naturalWidth?: number | null;
  naturalHeight?: number | null;
  aspectRatio?: number | null;
  aspectClass?: FeedImageAspectClass;
  frostedBackdrop?: boolean;
};

const classifyAspectRatio = (aspectRatio?: number | null): FeedImageAspectClass => {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return 'unknown';
  if (aspectRatio > 1.08) return 'landscape';
  if (aspectRatio < 0.92) return 'portrait';
  return 'square';
};

function FeedImagePlaceholder({ backgroundColor }: { backgroundColor: string }) {
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 0.72,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.35,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: shimmer, backgroundColor }]} />
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
  contentFit = 'contain',
  viewportWidth,
  viewportHeight,
  naturalWidth,
  naturalHeight,
  aspectRatio,
  aspectClass,
  frostedBackdrop = true,
}: FeedImageProps) {
  const { scheme, theme } = useTheme();
  const placeholderSurface = dominantColor || (scheme === 'dark' ? theme.colors.surface : theme.colors.surfaceAlt);
  const [loadState, setLoadState] = useState<FeedImageLoadState>('idle');
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [loadedNaturalSize, setLoadedNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const lastSuccessfulUriRef = useRef<string | null>(null);
  const failedUriSetRef = useRef<Set<string>>(new Set());
  const sourceUrl = displayUrl || previewUrl || thumbnailUrl || null;
  const hasSource = Boolean(sourceUrl || fileId);
  const debugContext = useMemo(
    () => ({
      designId: id,
      fileId,
      mediaIndex: imageIndex,
      sourceField: sourceType ?? (fileId ? 'feed.media.fileId' : 'feed.media.displayUrl'),
    }),
    [fileId, id, imageIndex, sourceType],
  );
  const { uri, loading } = useResolvedImageAsset({
    src: sourceUrl,
    fileId,
    enabled: hasSource,
    debugContext,
  });
  const visibleUri = uri && uri !== failedUri ? uri : lastSuccessfulUriRef.current;
  const hostname = useMemo(() => {
    const candidate = visibleUri ?? uri ?? sourceUrl;
    if (!candidate) return null;
    try {
      return new URL(candidate).hostname;
    } catch {
      return null;
    }
  }, [sourceUrl, uri, visibleUri]);
  const measuredAspectRatio =
    aspectRatio ??
    (naturalWidth && naturalHeight ? naturalWidth / naturalHeight : null) ??
    (loadedNaturalSize ? loadedNaturalSize.width / loadedNaturalSize.height : null);
  const resolvedAspectClass = aspectClass ?? classifyAspectRatio(measuredAspectRatio);
  const useFrostedBackdrop = frostedBackdrop && contentFit === 'contain';

  useEffect(() => {
    setLoadState(hasSource ? 'resolving' : 'idle');
    setFailedUri(null);
    setLoadedNaturalSize(null);
    failedUriSetRef.current = new Set();
  }, [hasSource, id, sourceUrl, fileId, retryToken]);

  useEffect(() => {
    if (uri && uri !== failedUri) {
      setLoadState((current) => (current === 'loaded' ? 'loaded' : 'loading'));
    }
  }, [failedUri, uri]);

  useEffect(() => {
    if (!__DEV__) return;
    feedMediaDevLog('image-fit-policy', {
      mediaId: id,
      mediaIndex: imageIndex ?? null,
      viewportWidth: viewportWidth ?? null,
      viewportHeight: viewportHeight ?? null,
      naturalWidth: naturalWidth ?? loadedNaturalSize?.width ?? null,
      naturalHeight: naturalHeight ?? loadedNaturalSize?.height ?? null,
      aspectRatio: measuredAspectRatio ?? null,
      aspectClass: resolvedAspectClass,
      contentFit,
      frostedBackdrop: useFrostedBackdrop,
    });
  }, [
    aspectClass,
    contentFit,
    id,
    imageIndex,
    loadedNaturalSize?.height,
    loadedNaturalSize?.width,
    measuredAspectRatio,
    naturalHeight,
    naturalWidth,
    resolvedAspectClass,
    useFrostedBackdrop,
    viewportHeight,
    viewportWidth,
  ]);

  const handleRetry = useCallback(() => {
    setFailedUri(null);
    failedUriSetRef.current = new Set();
    setLoadState(hasSource ? 'resolving' : 'idle');
    setRetryToken((current) => current + 1);
    void resolveImageUri({ src: sourceUrl, fileId, forceRefresh: true, debugContext });
  }, [debugContext, fileId, hasSource, sourceUrl]);

  const renderFrostedBackdrop = (sourceUri: string) =>
    useFrostedBackdrop ? (
      <>
        <ExpoImage
          source={{ uri: sourceUri }}
          style={styles.backdropImage}
          contentFit="cover"
          blurRadius={28}
          cachePolicy="memory-disk"
          recyclingKey={`${id}:${sourceUri}:frosted-backdrop`}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.backdropWash,
            {
              backgroundColor:
                scheme === 'dark'
                  ? 'rgba(0, 0, 0, 0.28)'
                  : 'rgba(255, 255, 255, 0.18)',
            },
          ]}
        />
      </>
    ) : null;

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

  if (!hasSource) {
    return renderFallback('No media source available');
  }

  if (loading || loadState === 'resolving') {
    const staleUri = lastSuccessfulUriRef.current;
    return (
      <View style={[styles.root, { backgroundColor: placeholderSurface }, style]}>
        {staleUri ? (
          <>
            {renderFrostedBackdrop(staleUri)}
            <ExpoImage
              source={{ uri: staleUri }}
              style={StyleSheet.absoluteFillObject}
              contentFit={contentFit}
              cachePolicy="memory-disk"
              recyclingKey={`${id}:${staleUri}:stale`}
            />
          </>
        ) : (
          <FeedImagePlaceholder backgroundColor={placeholderSurface} />
        )}
      </View>
    );
  }

  if (!visibleUri || loadState === 'failed' || failedUri === visibleUri) {
    return renderFallback('Tap to retry');
  }

  return (
    <View style={[styles.root, { backgroundColor: placeholderSurface }, style]}>
      {renderFrostedBackdrop(visibleUri)}
      {loadState !== 'loaded' ? <FeedImagePlaceholder backgroundColor={placeholderSurface} /> : null}
      <ExpoImage
        source={{ uri: visibleUri }}
        placeholder={blurHash ? { blurhash: blurHash } : undefined}
        style={[StyleSheet.absoluteFillObject, { opacity: loadState === 'loaded' ? 1 : 0 }]}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={`${id}:${visibleUri}`}
        transition={120}
        onLoad={(event) => {
          const nextWidth = event.source?.width;
          const nextHeight = event.source?.height;
          if (typeof nextWidth === 'number' && typeof nextHeight === 'number' && nextWidth > 0 && nextHeight > 0) {
            setLoadedNaturalSize({ width: nextWidth, height: nextHeight });
          }
          lastSuccessfulUriRef.current = visibleUri;
          setLoadState('loaded');
        }}
        onError={(event) => {
          if (failedUriSetRef.current.has(visibleUri)) return;
          failedUriSetRef.current.add(visibleUri);
          mediaDevWarn('image-on-error', {
            mediaId: id,
            sourceType: sourceType ?? (displayUrl ? 'display-url' : fileId ? 'protected-file-id' : 'missing-source'),
            hasFileId: Boolean(fileId),
            hostname,
            error: typeof event?.error === 'string' ? event.error : 'image-load-error',
          });
          setFailedUri(visibleUri);
          setLoadState(lastSuccessfulUriRef.current && lastSuccessfulUriRef.current !== visibleUri ? 'loading' : 'failed');
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.74,
    transform: [{ scale: 1.08 }],
  },
  backdropWash: {
    opacity: 0.82,
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
