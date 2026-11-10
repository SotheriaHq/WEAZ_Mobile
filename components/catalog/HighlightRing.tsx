import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

/**
 * A brand-colour ring that blinks around the card a notification pointed at.
 *
 * "Your design was approved" opens the Catalogue's Public (or Private) shelf,
 * and this ring says which card the notice was about (owner, Nov 2026: "it
 * could just blink, you know, for a while until maybe I interact with the
 * screen or I navigate again"). The caller decides how long it lives; this
 * only draws it. It sits OVER the card as a sibling inside the card's own
 * wrapper, so adding or removing it never remounts the card or reloads its
 * image. Touches pass straight through. With Reduce Motion on, it holds
 * steady instead of blinking.
 */
export function HighlightRing({ radius = tokens.radius.lg }: { radius?: number }) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return undefined;
    }
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 650 }), withTiming(0.2, { duration: 650 })),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      style={[
        StyleSheet.absoluteFill,
        styles.ring,
        { borderColor: theme.colors.primary, borderRadius: radius },
        ringStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 3,
  },
});
