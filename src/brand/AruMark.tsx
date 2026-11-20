import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/brand/identity';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Statically analyzable relative paths for Metro bundler.
 * Retains Temporary Legacy Visual Assets per Product Owner Decision 1.2.
 */
const MARK_LIGHT = require('../../assets/images/wiez-mark-light.png');
const MARK_DARK = require('../../assets/images/wiez-mark-dark.png');

export type AruMarkProps = {
  /** Rendered edge length. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Omit when adjacent text already names the brand. */
  label?: string;
};

export function AruMark({ size = 132, style, label }: AruMarkProps) {
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
        transition={0}
      />
    </View>
  );
}

export const ARU_MARK_LABEL = LOGO_ACCESSIBILITY_LABEL;
export const WiezMark = AruMark;
export const WIEZ_MARK_LABEL = LOGO_ACCESSIBILITY_LABEL;

export default AruMark;
