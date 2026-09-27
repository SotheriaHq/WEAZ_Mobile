import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/brand/identity';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * The full WIEZ mark — the W, the muse and the orb.
 *
 * A raster rather than the vector, deliberately. The vector was 45 KB of
 * traced path data that `react-native-svg` re-parsed on every mount, and it
 * traced a logo the brand no longer uses. The file is square, so the box here
 * is square and `contain` keeps the artwork's own proportions inside it.
 *
 * Theme-paired rather than tinted: full-colour artwork has no tint that turns
 * a light-ground ramp into a dark-ground one.
 */

const MARK_LIGHT = require('@/assets/images/wiez-mark-light.png');
const MARK_DARK = require('@/assets/images/wiez-mark-dark.png');

type WiezMarkProps = {
  /** Rendered edge length. */
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
