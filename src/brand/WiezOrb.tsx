import React, { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import {
  WIEZ_ORB_PATHS,
  WIEZ_ORB_TONES,
  WIEZ_ORB_VIEW_BOX,
  WIEZ_PATH_SCALE,
  WIEZ_RAMP_DARK,
  WIEZ_RAMP_LIGHT,
} from '@/src/brand/wiezOrbArtwork';
import { LOGO_ACCESSIBILITY_LABEL } from '@/src/brand/identity';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * The WIEZ orb — the sphere from the logo, and the app's whole small-scale
 * brand vocabulary. The chrome mark and the loader are the same artwork.
 *
 * It replaced an `expo-image` onto `wiez-logo-mark.png` with
 * `tintColor={theme.colors.text}` — a black serif "W" flattened to a single
 * colour, while the favicon, the app icon and every email carried a completely
 * different gold figure under nearly the same filename.
 *
 * CSS custom properties do not exist here, so the ramp is chosen from the theme
 * and passed down as fills. Same two ramps as the web build.
 */

type WiezOrbProps = {
  /** Rendered edge length. Legible down to 16. */
  size?: number;
  /** Name it when the orb is the only thing identifying the brand. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function WiezOrb({ size = 32, label, style }: WiezOrbProps) {
  const { scheme } = useTheme();
  const ramp = scheme === 'dark' ? WIEZ_RAMP_DARK : WIEZ_RAMP_LIGHT;

  // 60-odd path elements; rebuild them only when the ground actually changes.
  const paths = useMemo(
    () =>
      WIEZ_ORB_PATHS.map((d, index) => (
        <Path key={index} d={d} fill={ramp[WIEZ_ORB_TONES[index]]} />
      )),
    [ramp],
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox={WIEZ_ORB_VIEW_BOX}
      style={style}
      accessibilityRole={label ? 'image' : 'none'}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <G scale={WIEZ_PATH_SCALE}>{paths}</G>
    </Svg>
  );
}

export const WIEZ_ORB_LABEL = LOGO_ACCESSIBILITY_LABEL;

export default WiezOrb;
