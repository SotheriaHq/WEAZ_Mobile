import { useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { getMediaUrlIdentity, isRenewableMediaUrl } from '@/src/utils/mediaUrlPolicy';
import { getMediaSessionEpoch } from '@/src/utils/mediaUrlSession';
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
  /** Fires when an image has decoded, so a caller can drop its loading skeleton. */
  onLoad?: () => void;
  aspectAware?: boolean;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAspectRatio?: number | null;
  blurhash?: string | null;
  dominantColor?: string | null;
  strategyOverride?: AspectAwareMediaStrategy | null;
  /**
   * Stable cache identity for this picture (for example `fileId:variant`).
   * Optional: without it the image is cached by URL, as before. With it, a
   * re-signed URL for the same rendition is served from the memory/disk cache
   * instead of being downloaded again.
   */
  cacheKey?: string | null;
};

/** One painted picture: its address and the cache identity it was given with. */
type Layer = { uri: string; cacheKey: string | null };

const layerSource = (layer: Layer) =>
  layer.cacheKey ? { uri: layer.uri, cacheKey: layer.cacheKey } : { uri: layer.uri };

const AnimatedExpoImage = Animated.createAnimatedComponent(ExpoImage);

function toContentFit(resizeMode: ImageResizeMode): ImageContentFit {
  if (resizeMode === 'stretch') return 'fill';
  if (resizeMode === 'center') return 'scale-down';
  if (resizeMode === 'repeat') return 'cover';
  return resizeMode;
}

export function StableImage({
  uri: sourceUri,
  resizeMode = 'cover',
  containerStyle,
  imageStyle,
  fallback,
  fadeDuration = 180,
  onError,
  onLoad,
  aspectAware = false,
  imageWidth,
  imageHeight,
  imageAspectRatio,
  blurhash,
  dominantColor,
  strategyOverride,
  cacheKey = null,
}: StableImageProps) {
  const { uri, refreshUri } = useResolvedImageAsset({ src: sourceUri });
  const mounted = useRef(true);
  const active = useRef({ source: sourceUri, epoch: getMediaSessionEpoch() });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const retry = useRef({ identity: sourceUri ? getMediaUrlIdentity(sourceUri) : '', used: false });
  const identity = sourceUri ? getMediaUrlIdentity(sourceUri) : '';
  // Refs are written after commit, never during render: a render React throws
  // away must not leave its values behind. Image events only arrive after
  // commit, so they always see the props of the frame on screen.
  useLayoutEffect(() => {
    active.current = { source: sourceUri, epoch: getMediaSessionEpoch() };
    if (retry.current.identity !== identity) retry.current = { identity, used: false };
  });
  const handleImageError = useCallback(() => {
    if (isRenewableMediaUrl(uri) && !retry.current.used) {
      retry.current.used = true;
      const epoch = getMediaSessionEpoch();
      void refreshUri().then((next) => {
        if (!mounted.current || active.current.source !== sourceUri || active.current.epoch !== epoch || epoch !== getMediaSessionEpoch()) return;
        if (!next || next === uri) onError?.();
      });
      return;
    }
    onError?.();
  }, [onError, refreshUri, sourceUri, uri]);
  // Each layer keeps the cache identity it was given with, so a crossfade
  // between two renditions never files one picture under the other's key.
  const [display, setDisplay] = React.useState<Layer | null>(uri ? { uri, cacheKey } : null);
  const [incoming, setIncoming] = React.useState<Layer | null>(null);
  const displayUri = display?.uri ?? null;
  const displayOpacity = useRef(new Animated.Value(uri ? 0 : 1)).current;
  const incomingOpacity = useRef(new Animated.Value(0)).current;
  const incomingRef = useRef<Layer | null>(null);
  const contentFit = toContentFit(resizeMode);

  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  useEffect(() => {
    const normalizedUri = uri ?? null;

    if (!normalizedUri) {
      setDisplay(null);
      setIncoming(null);
      displayOpacity.setValue(0);
      incomingOpacity.setValue(0);
      return;
    }

    if (!displayUri) {
      setDisplay({ uri: normalizedUri, cacheKey });
      displayOpacity.setValue(0);
      return;
    }

    if (normalizedUri === displayUri || normalizedUri === incomingRef.current?.uri) {
      return;
    }

    setIncoming({ uri: normalizedUri, cacheKey });
    incomingOpacity.setValue(0);
  }, [cacheKey, displayOpacity, displayUri, incomingOpacity, uri]);

  const handleDisplayLoad = useCallback(() => {
    onLoad?.();
    if (incomingRef.current) return;
    Animated.timing(displayOpacity, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }, [displayOpacity, fadeDuration, onLoad]);

  const handleIncomingLoad = useCallback(() => {
    const next = incomingRef.current;
    if (!next) return;
    onLoad?.();

    Animated.timing(incomingOpacity, {
      toValue: 1,
      duration: fadeDuration,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setDisplay(next);
      setIncoming(null);
      incomingRef.current = null;
      incomingOpacity.setValue(0);
      displayOpacity.setValue(1);
    });
  }, [displayOpacity, fadeDuration, incomingOpacity, onLoad]);

  if (aspectAware) {
    const aspectStrategyOverride = strategyOverride ?? (resizeMode === 'cover' ? 'edge' : null);

    return (
      <View style={containerStyle}>
        {fallback}
        {uri ? (
          // Aspect-aware rendering intentionally skips the crossfade stack; all current call sites keep the default path.
          <AspectAwareMedia
            source={cacheKey ? { uri, cacheKey } : { uri }}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            imageAspectRatio={imageAspectRatio}
            blurhash={blurhash}
            dominantColor={dominantColor}
            style={[styles.imageLayer, imageStyle as StyleProp<ViewStyle>]}
            imageStyle={imageStyle}
            strategyOverride={aspectStrategyOverride}
            recyclingKey={uri}
            onError={handleImageError}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {fallback}
      {display ? (
        <AnimatedExpoImage
          source={layerSource(display)}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={display.uri}
          onLoad={handleDisplayLoad}
          onError={handleImageError}
          style={[styles.imageLayer, imageStyle, { opacity: displayOpacity }]}
        />
      ) : null}
      {incoming ? (
        <AnimatedExpoImage
          source={layerSource(incoming)}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={incoming.uri}
          onLoad={handleIncomingLoad}
          onError={handleImageError}
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
