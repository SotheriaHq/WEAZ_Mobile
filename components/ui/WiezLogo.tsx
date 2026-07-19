import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/config/productIdentity';
import { useTheme } from '@/src/theme/ThemeProvider';

// New WIEZ monogram mark (tight-cropped): width / height of the deep-dark art.
// `size` is the rendered height; width follows this ratio.
const WIEZ_MARK_ASPECT_RATIO = 783 / 504;

const LOGO_SOURCE = require('@/assets/images/wiez-logo-mark.png');

interface WiezLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Override the mark color. Defaults to the theme text color so the deep-dark
   * art reads correctly on the day theme and flips to light on the night theme.
   */
  color?: string;
}

export function WiezLogo({ size = 32, style, color }: WiezLogoProps) {
  const { theme } = useTheme();
  const width = Math.round(size * WIEZ_MARK_ASPECT_RATIO);
  const tintColor = color ?? theme.colors.text;

  return (
    <View
      style={[{ width, height: size }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LOGO_ACCESSIBILITY_LABEL}
    >
      <Image
        source={LOGO_SOURCE}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        tintColor={tintColor}
        cachePolicy="memory-disk"
      />
    </View>
  );
}

export default WiezLogo;
