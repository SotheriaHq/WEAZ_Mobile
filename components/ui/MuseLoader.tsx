import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import WiezOrb from '@/src/brand/WiezOrb';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

/**
 * The app's loading vocabulary. Every wait on native renders this.
 *
 * It replaced two things at once. `WiezLogoLoader` pulsed the old flat mark
 * behind a gold glow and was used in nine places; a bare `ActivityIndicator` —
 * the OS spinner, carrying no brand at all — was used in forty-eight, across
 * thirty-six files. The platform spinner was, in practice, this app's loader.
 *
 * Same shape as the web `MuseLoader`: the orb holds still and one arc turns
 * around it at constant speed. Driven on the UI thread, which matters more here
 * than on web — a loader is on screen precisely when JS is busy, and a
 * JS-driven spinner freezes at exactly the moment it has a job to do.
 */

const RING_VIEWBOX_RADIUS = 45;
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

/**
 * The ring has to thicken as it shrinks or it vanishes, and the arc has to
 * shorten or at 16px it reads as a closed circle rather than a spinner.
 */
function ringGeometry(size: number) {
  if (size <= 24) return { width: 11, dash: '148 142' };
  if (size <= 40) return { width: 9, dash: '158 132' };
  return { width: 7, dash: '168 122' };
}

type MuseLoaderProps = {
  /** Rendered edge length. Reads down to 16. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Announced to screen readers. */
  label?: string;
};

export function MuseLoader({ size = 32, style, label = 'Loading' }: MuseLoaderProps) {
  const { scheme } = useTheme();
  const spin = useSharedValue(0);
  const breath = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const ring = useMemo(() => ringGeometry(size), [size]);
  const ringColor = scheme === 'dark' ? tokens.colors.wiezRingDark : tokens.colors.wiezRingLight;

  useEffect(() => {
    if (reduceMotion) {
      // Still moving, just not spinning: a frozen loader reads as a crash.
      spin.value = 0;
      breath.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      return () => {
        cancelAnimation(breath);
      };
    }

    spin.value = withRepeat(
      withTiming(360, { duration: 1250, easing: Easing.linear }),
      -1,
      false,
    );
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.94, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(spin);
      cancelAnimation(breath);
    };
  }, [breath, reduceMotion, spin]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.78 + (breath.value - 0.94) * 3.6,
    transform: [{ scale: breath.value }],
  }));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <AnimatedSvg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={[StyleSheet.absoluteFill, ringStyle]}
        pointerEvents="none"
      >
        <Circle
          cx="50"
          cy="50"
          r={RING_VIEWBOX_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeLinecap="round"
          strokeWidth={ring.width}
          strokeDasharray={ring.dash}
        />
      </AnimatedSvg>
      <Animated.View style={orbStyle}>
        <WiezOrb size={Math.round(size * 0.58)} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MuseLoader;
