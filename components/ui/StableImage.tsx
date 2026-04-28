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

type StableImageProps = {
  uri?: string | null;
  resizeMode?: ImageResizeMode;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
  fadeDuration?: number;
  onError?: () => void;
};

export function StableImage({
  uri,
  resizeMode = 'cover',
  containerStyle,
  imageStyle,
  fallback,
  fadeDuration = 180,
  onError,
}: StableImageProps) {
  const [displayUri, setDisplayUri] = React.useState<string | null>(uri ?? null);
  const [incomingUri, setIncomingUri] = React.useState<string | null>(null);
  const displayOpacity = useRef(new Animated.Value(uri ? 0 : 1)).current;
  const incomingOpacity = useRef(new Animated.Value(0)).current;
  const incomingUriRef = useRef<string | null>(null);

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

  return (
    <View style={containerStyle}>
      {fallback}
      {displayUri ? (
        <Animated.Image
          source={{ uri: displayUri }}
          resizeMode={resizeMode}
          onLoad={handleDisplayLoad}
          onError={onError}
          style={[styles.imageLayer, imageStyle, { opacity: displayOpacity }]}
        />
      ) : null}
      {incomingUri ? (
        <Animated.Image
          source={{ uri: incomingUri }}
          resizeMode={resizeMode}
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
    ...StyleSheet.absoluteFillObject,
  },
});

export default StableImage;
