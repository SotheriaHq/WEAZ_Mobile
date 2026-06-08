import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThreadlyLogo } from './ThreadlyLogo';
import { PRODUCT_NAME } from '@/src/config/productIdentity';

type ThreadlyLogoLoaderProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  showWordmark?: boolean;
  title?: string;
  message?: string;
  titleColor?: string;
  messageColor?: string;
};

export function ThreadlyLogoLoader({
  size = 72,
  style,
  showWordmark = false,
  title = PRODUCT_NAME,
  message = 'Loading your feed',
  titleColor = '#ffffff',
  messageColor = 'rgba(255,255,255,0.72)',
}: ThreadlyLogoLoaderProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 980,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 980,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.start();
    driftLoop.start();

    return () => {
      pulseLoop.stop();
      driftLoop.stop();
    };
  }, [drift, pulse]);

  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, -3],
  });

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.06],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.34],
  });

  const captionTranslateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [2, -2],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        {
          width: size,
          height: size,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.logoFrame}>
        <Animated.View
          style={[
            styles.logoGlow,
            {
              width: size * 1.28,
              height: size * 1.28,
              borderRadius: size,
              opacity: glowOpacity,
            },
          ]}
        />
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [{ scale }],
          }}
        >
          <ThreadlyLogo size={size} />
        </Animated.View>
      </View>
      {showWordmark ? (
        <Animated.View
          style={[
            styles.wordmarkWrap,
            {
              transform: [{ translateY: captionTranslateY }],
            },
          ]}
        >
          <Animated.Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.84}
            style={[styles.wordmarkTitle, { color: titleColor }]}
          >
            {title}
          </Animated.Text>
          <Animated.Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} style={[styles.wordmarkSubtitle, { color: messageColor }]}>
            {message}
          </Animated.Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(212,175,55,0.22)',
  },
  wordmarkWrap: {
    marginTop: 16,
    alignItems: 'center',
    gap: 4,
    minWidth: 180,
    maxWidth: 240,
  },
  wordmarkTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  wordmarkSubtitle: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ThreadlyLogoLoader;
