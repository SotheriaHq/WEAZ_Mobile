import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { resolveImageUri, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { mediaDevWarn } from '@/src/features/feed/utils/feedDiagnostics';

type FeedImageLoadState = 'idle' | 'resolving' | 'loading' | 'loaded' | 'failed';

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
}: FeedImageProps) {
  const { scheme, theme } = useTheme();
  const placeholderSurface = dominantColor || (scheme === 'dark' ? theme.colors.surface : theme.colors.surfaceAlt);
  const [loadState, setLoadState] = useState<FeedImageLoadState>('idle');
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
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

  useEffect(() => {
    setLoadState(hasSource ? 'resolving' : 'idle');
    setFailedUri(null);
    failedUriSetRef.current = new Set();
  }, [hasSource, id, sourceUrl, fileId, retryToken]);

  useEffect(() => {
    if (uri && uri !== failedUri) {
      setLoadState((current) => (current === 'loaded' ? 'loaded' : 'loading'));
    }
  }, [failedUri, uri]);

  const handleRetry = useCallback(() => {
    setFailedUri(null);
    failedUriSetRef.current = new Set();
    setLoadState(hasSource ? 'resolving' : 'idle');
    setRetryToken((current) => current + 1);
    void resolveImageUri({ src: sourceUrl, fileId, forceRefresh: true, debugContext });
  }, [debugContext, fileId, hasSource, sourceUrl]);

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
    return (
      <View style={[styles.root, { backgroundColor: placeholderSurface }, style]}>
        {lastSuccessfulUriRef.current ? (
          <ExpoImage
            source={{ uri: lastSuccessfulUriRef.current }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={`${id}:${lastSuccessfulUriRef.current}:stale`}
          />
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
      {loadState !== 'loaded' ? <FeedImagePlaceholder backgroundColor={placeholderSurface} /> : null}
      <ExpoImage
        source={{ uri: visibleUri }}
        placeholder={blurHash ? { blurhash: blurHash } : undefined}
        style={[StyleSheet.absoluteFillObject, { opacity: loadState === 'loaded' ? 1 : 0 }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`${id}:${visibleUri}`}
        transition={120}
        onLoad={() => {
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
