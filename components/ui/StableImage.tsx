import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  type ImageResizeMode,
  type ImageStyle,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';

import { AspectAwareMedia } from '@/src/components/media/AspectAwareMedia';
import type { AspectAwareMediaStrategy } from '@/src/components/media/aspectAwareMediaStrategy';

type StableImageProps = {
  uri?: string | null;
  resizeMode?: ImageResizeMode;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
  fadeDuration?: number;
  onError?: () => void;
  aspectAware?: boolean;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAspectRatio?: number | null;
  blurhash?: string | null;
  dominantColor?: string | null;
  strategyOverride?: AspectAwareMediaStrategy | null;
};

const AnimatedExpoImage = Animated.createAnimatedComponent(ExpoImage);

function toContentFit(resizeMode: ImageResizeMode): ImageContentFit {
  if (resizeMode === 'stretch') return 'fill';
  if (resizeMode === 'center') return 'scale-down';
  if (resizeMode === 'repeat') return 'cover';
  return resizeMode;
}

export function StableImage({
  uri,
  resizeMode = 'cover',
  containerStyle,
  imageStyle,
  fallback,
  fadeDuration = 180,
  onError,
  aspectAware = false,
  imageWidth,
  imageHeight,
  imageAspectRatio,
  blurhash,
  dominantColor,
  strategyOverride,
}: StableImageProps) {
  const [displayUri, setDisplayUri] = React.useState<string | null>(uri ?? null);
  const [incomingUri, setIncomingUri] = React.useState<string | null>(null);
  const displayOpacity = useRef(new Animated.Value(uri ? 0 : 1)).current;
  const incomingOpacity = useRef(new Animated.Value(0)).current;
  const incomingUriRef = useRef<string | null>(null);
  const contentFit = toContentFit(resizeMode);

  useEffect(() => {
    incomingUriRef.current = incomingUri;
  }, [incomingUri]);

  useEffect(() => {
    const normalizedUri = uri ?? null;

    if (!normalizedUri) {
      setDisplayUri(null);
      setIncomingUri(null);
      displayOpacity.setValue(0);
      incomingOpacity.setValue(0);
      return;
    }

    if (!displayUri) {
      setDisplayUri(normalizedUri);
      displayOpacity.setValue(0);
      return;
    }

    if (normalizedUri === displayUri || normalizedUri === incomingUriRef.current) {
      return;
    }

    setIncomingUri(normalizedUri);
    incomingOpacity.setValue(0);
  }, [displayOpacity, displayUri, incomingOpacity, uri]);

  const handleDisplayLoad = useCallback(() => {
    if (incomingUriRef.current) return;
    Animated.timing(displayOpacity, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
    }).start();
  }, [displayOpacity, fadeDuration]);

  const handleIncomingLoad = useCallback(() => {
    const nextUri = incomingUriRef.current;
    if (!nextUri) return;

    Animated.timing(incomingOpacity, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setDisplayUri(nextUri);
      setIncomingUri(null);
      incomingUriRef.current = null;
      incomingOpacity.setValue(0);
      displayOpacity.setValue(1);
    });
  }, [displayOpacity, fadeDuration, incomingOpacity]);

  if (aspectAware) {
    const aspectStrategyOverride = strategyOverride ?? (resizeMode === 'cover' ? 'edge' : null);

    return (
      <View style={containerStyle}>
        {fallback}
        {uri ? (
          // Aspect-aware rendering intentionally skips the crossfade stack; all current call sites keep the default path.
          <AspectAwareMedia
            source={{ uri }}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            imageAspectRatio={imageAspectRatio}
            blurhash={blurhash}
            dominantColor={dominantColor}
            style={[styles.imageLayer, imageStyle as StyleProp<ViewStyle>]}
            imageStyle={imageStyle}
            strategyOverride={aspectStrategyOverride}
            recyclingKey={uri}
            onError={onError ? () => onError() : undefined}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {fallback}
      {displayUri ? (
        <AnimatedExpoImage
          source={{ uri: displayUri }}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={displayUri}
          onLoad={handleDisplayLoad}
          onError={onError}
          style={[styles.imageLayer, imageStyle, { opacity: displayOpacity }]}
        />
      ) : null}
      {incomingUri ? (
        <AnimatedExpoImage
          source={{ uri: incomingUri }}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={incomingUri}
          onLoad={handleIncomingLoad}
          onError={onError}
          style={[styles.imageLayer, imageStyle, { opacity: incomingOpacity }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imageLayer: {
    ...StyleSheet.absoluteFill,
  },
});

export default StableImage;
