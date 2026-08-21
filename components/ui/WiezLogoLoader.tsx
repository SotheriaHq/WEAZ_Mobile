import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { WiezLogo } from './WiezLogo';
import { tokens } from '@/src/styles/tokens';

/**
 * The animated WIEZ mark. This is the app's entire loading vocabulary.
 *
 * It used to carry an optional wordmark block — `showWordmark`, `title`,
 * `message`, `titleColor`, `messageColor` — rendering raw `Animated.Text` with
 * literal `fontSize`/`fontWeight`/`color`, which is exactly what Rules 22–24
 * forbid. Every one of the six call sites left `showWordmark` at its `false`
 * default, so none of it had ever painted a pixel. Removed rather than
 * tokenised: a loader that narrates is the thing we just spent a session taking
 * out of Studio, and dead code that violates the design system is the worst of
 * both.
 */
type WiezLogoLoaderProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function WiezLogoLoader({ size = 72, style }: WiezLogoLoaderProps) {
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
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 980,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
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
          isInteraction: false,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
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
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
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
          <WiezLogo size={size} />
        </Animated.View>
      </View>
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
    backgroundColor: tokens.colors.loaderGlow,
  },
});

export default WiezLogoLoader;
