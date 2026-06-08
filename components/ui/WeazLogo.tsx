import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/config/productIdentity';

const WEAZ_MARK_ASPECT_RATIO = 152 / 280;

interface WeazLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function WeazLogo({ size = 32, style }: WeazLogoProps) {
  const width = Math.round(size * WEAZ_MARK_ASPECT_RATIO);

  return (
    <Svg
      width={width}
      height={size}
      viewBox="180 96 152 280"
      fill="none"
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LOGO_ACCESSIBILITY_LABEL}
    >
      <Defs>
        <LinearGradient
          id="weaz-logo-gradient"
          x1="190"
          y1="82"
          x2="330"
          y2="362"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fff1a8" />
          <Stop offset="0.34" stopColor="#d8b24a" />
          <Stop offset="0.68" stopColor="#f8dc78" />
          <Stop offset="1" stopColor="#9f6419" />
        </LinearGradient>
      </Defs>
      <Path
        d="M257 104c14 0 25 11 25 25s-11 25-25 25-25-11-25-25 11-25 25-25Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M224 170 275 231l-15 64c-6 25-1 49 14 72-37-34-56-74-54-121l-42 6 46-82Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M277 170 323 238l-21 73h-63l21-79 17-62Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M225 165 281 230"
        stroke="#fff6bd"
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.75}
      />
    </Svg>
  );
}

export default WeazLogo;
