import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/config/productIdentity';

const WEAZ_MARK_ASPECT_RATIO = 64 / 96;

interface ThreadlyLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ThreadlyLogo({ size = 32, style }: ThreadlyLogoProps) {
  const width = Math.round(size * WEAZ_MARK_ASPECT_RATIO);

  return (
    <Svg
      width={width}
      height={size}
      viewBox="0 0 64 96"
      fill="none"
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LOGO_ACCESSIBILITY_LABEL}
    >
      <Defs>
        <LinearGradient
          id="weaz-logo-gradient"
          x1="17"
          y1="7"
          x2="48"
          y2="91"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fff1a8" />
          <Stop offset="0.36" stopColor="#d8b24a" />
          <Stop offset="0.72" stopColor="#f8dc78" />
          <Stop offset="1" stopColor="#9f6419" />
        </LinearGradient>
      </Defs>
      <Path
        d="M35.2 8.2c5.2 0 9.2 4.1 9.2 9.3s-4 9.4-9.2 9.4-9.3-4.1-9.3-9.4 4.1-9.3 9.3-9.3Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M28.1 29.1 40.5 43.8 36.9 60c-2.3 10.1-.9 20 4.8 30.2C30.6 80.8 25 69.1 25.4 55.8l-9.2 1.5 11.9-28.2Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M40.9 29.1 51.9 45.4 46.8 63.1H31.6l5.1-19.1 4.2-14.9Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M28.4 27.7 41.7 43.2"
        stroke="#fff6bd"
        strokeWidth={1.45}
        strokeLinecap="round"
        opacity={0.78}
      />
    </Svg>
  );
}

export default ThreadlyLogo;
