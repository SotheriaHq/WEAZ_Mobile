import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { resolveImageUri, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { mediaDevWarn } from '@/src/features/feed/utils/feedDiagnostics';

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
}: FeedImageProps) {
  const { scheme, theme } = useTheme();
  const placeholderSurface = dominantColor || (scheme === 'dark' ? theme.colors.surface : theme.colors.surfaceAlt);
  const [loaded, setLoaded] = useState(false);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const lastSuccessfulUriRef = useRef<string | null>(null);
  const sourceUrl = displayUrl || previewUrl || thumbnailUrl || null;
  const { uri, loading } = useResolvedImageAsset({
    src: sourceUrl,
    fileId,
    enabled: true,
    debugContext: {
      designId: id,
      fileId,
      sourceField: fileId ? 'feed.media.fileId' : 'feed.media.displayUrl',
    },
  });
  const visibleUri = uri && uri !== failedUri ? uri : lastSuccessfulUriRef.current;

  useEffect(() => {
    setLoaded(false);
    setFailedUri(null);
  }, [id, sourceUrl, fileId, retryToken]);

  useEffect(() => {
    if (uri && uri !== failedUri) {
      lastSuccessfulUriRef.current = uri;
    }
  }, [failedUri, uri]);

  const handleRetry = useCallback(() => {
    setFailedUri(null);
    setLoaded(false);
    setRetryToken((current) => current + 1);
    void resolveImageUri({ src: sourceUrl, fileId, forceRefresh: true });
  }, [fileId, sourceUrl]);

  if (!visibleUri || loading) {
    return (
      <View style={[styles.root, { backgroundColor: placeholderSurface }, style]}>
        <FeedImagePlaceholder backgroundColor={placeholderSurface} />
      </View>
    );
  }

  if (failedUri === visibleUri) {
    return (
      <Pressable
        onPress={handleRetry}
        style={[styles.root, styles.fallback, { backgroundColor: placeholderSurface }, style]}
        accessibilityRole="button"
        accessibilityLabel="Retry image preview"
      >
        <AppText variant="display">🖼️</AppText>
        <AppText variant="subtitle">Preview unavailable</AppText>
        <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.fallbackText}>
          {label || 'Tap to retry'}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: placeholderSurface }, style]}>
      {!loaded ? <FeedImagePlaceholder backgroundColor={placeholderSurface} /> : null}
      <ExpoImage
        source={{ uri: visibleUri }}
        placeholder={blurHash ? { blurhash: blurHash } : undefined}
        style={[StyleSheet.absoluteFillObject, { opacity: loaded ? 1 : 0 }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`${id}:${visibleUri}`}
        transition={120}
        onLoad={() => setLoaded(true)}
        onError={() => {
          mediaDevWarn('image-on-error', {
            mediaId: id,
            hasFileId: Boolean(fileId),
            sourceType: displayUrl ? 'display-url' : fileId ? 'protected-file-id' : 'missing-source',
          });
          if (visibleUri !== failedUri) {
            setFailedUri(visibleUri);
          }
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
