import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';

import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * The app's loading vocabulary. Every wait on native renders this.
 *
 * **An empty vessel in the shape of the mark, filling with the system colour.**
 * Like a phone charging while it is switched off: the outline of the thing, and
 * a level rising inside it. Not a ring orbiting one piece of the logo, and not
 * the OS spinner, which is what 48 call sites across 36 files were showing.
 *
 * Both layers are TINTED, which is the whole point. Painting the full-colour
 * artwork and uncovering it bottom-up reads as a picture downloading over a
 * slow connection — a dim logo is what a half-loaded image looks like, and
 * revealing it in strips is the progressive-JPEG effect. Tinting throws the
 * artwork away and keeps only its silhouette, so the empty state is a shape
 * holding nothing rather than a broken logo, and empty and full are the same
 * ink at two strengths across a hard edge.
 *
 * Driven on the UI thread, which matters more here than on web: a loader is on
 * screen precisely when JS is busy, and a JS-driven animation freezes at exactly
 * the moment it has a job to do. Only the clip window's height is animated, and
 * Reanimated keeps that off the JS thread.
 *
 * It is also immune to the InteractionManager trap `Skeleton.tsx` documents —
 * an `Animated.loop` from React Native's own API never finishes, so its handle
 * never clears and `useDeferredScreenWork` waits forever. Reanimated never
 * takes the handle.
 */

/** From the mark's own artwork (538 x 498). */
const MARK_ASPECT_RATIO = 538 / 498;

const MARK_LIGHT = require('@/assets/images/wiez-loader-mark-light.png');
const MARK_DARK = require('@/assets/images/wiez-loader-mark-dark.png');

/** The fill never empties completely — a mark at zero reads as a broken image. */
const MIN_FILL = 0.12;

type MuseLoaderProps = {
  /** Rendered height. Width follows the mark's aspect. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Announced to screen readers. */
  label?: string;
};

export function MuseLoader({ size = 32, style, label = 'Loading' }: MuseLoaderProps) {
  const { theme, scheme } = useTheme();
  const fill = useSharedValue(MIN_FILL);
  const reduceMotion = useReducedMotion();

  const width = useMemo(() => Math.round(size * MARK_ASPECT_RATIO), [size]);
  const source = scheme === 'dark' ? MARK_DARK : MARK_LIGHT;

  useEffect(() => {
    if (reduceMotion) {
      // Still moving, just not travelling: a frozen loader reads as a crash.
      fill.value = withRepeat(
        withTiming(0.72, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      return () => cancelAnimation(fill);
    }

    // Reversing rather than resetting: a fill that snaps back to empty pops at
    // the loop seam, and a loader repeats forever.
    fill.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(fill);
  }, [fill, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    height: size * fill.value,
  }));

  return (
    <View
      style={[{ width, height: size }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {/* The empty vessel: the whole silhouette, holding nothing. */}
      <Image
        source={source}
        style={[StyleSheet.absoluteFill, styles.track]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        tintColor={theme.colors.primary}
      />
      {/* The window grows from the bottom; the mark inside it stays put, so the
          level rises rather than the shape moving. */}
      <Animated.View style={[styles.window, fillStyle]}>
        <Image
          source={source}
          style={{ width, height: size }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          tintColor={theme.colors.primary}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    opacity: 0.2,
  },
  window: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
});

export default MuseLoader;
