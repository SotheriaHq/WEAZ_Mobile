import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/brand/identity';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * The full WIEZ mark — the W, the muse and the orb.
 *
 * Not for chrome: the figure's face stops reading below roughly 96px, so tab
 * bars and headers use `WiezOrb`. This is for the splash hold, auth heroes and
 * empty states.
 *
 * A raster rather than the vector, deliberately. The mark is 290 KB of path
 * data, and `react-native-svg` parses that on every mount — on a screen that
 * exists to say "we are still working", that is the wrong thing to spend a
 * frame budget on. It only ever renders at splash scale, where the difference
 * is invisible.
 *
 * Theme-paired rather than tinted: full-colour artwork has no tint that turns
 * a light-ground ramp into a dark-ground one.
 */

const MARK_LIGHT = require('@/assets/images/wiez-mark-light.png');
const MARK_DARK = require('@/assets/images/wiez-mark-dark.png');

type WiezMarkProps = {
  /** Rendered edge length. Below ~96 use `WiezOrb` instead. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Omit when adjacent text already names the brand. */
  label?: string;
};

export function WiezMark({ size = 132, style, label }: WiezMarkProps) {
  const { scheme } = useTheme();

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Image
        source={scheme === 'dark' ? MARK_DARK : MARK_LIGHT}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        cachePolicy="memory-disk"
        // On screen during the splash hold, so it must not fade in late.
        transition={0}
      />
    </View>
  );
}

export const WIEZ_MARK_LABEL = LOGO_ACCESSIBILITY_LABEL;

export default WiezMark;
