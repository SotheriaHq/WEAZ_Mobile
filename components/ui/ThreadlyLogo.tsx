import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { LOGO_ACCESSIBILITY_LABEL } from '@/src/config/productIdentity';

interface ThreadlyLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ThreadlyLogo({ size = 32, style }: ThreadlyLogoProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LOGO_ACCESSIBILITY_LABEL}
    >
      <Defs>
        <LinearGradient
          id="weaz-logo-gradient"
          x1="8"
          y1="3"
          x2="24"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fff1a8" />
          <Stop offset="0.36" stopColor="#d8b24a" />
          <Stop offset="0.72" stopColor="#f8dc78" />
          <Stop offset="1" stopColor="#9f6419" />
        </LinearGradient>
      </Defs>
      <Path
        d="M17.2 4.8c2.1 0 3.7 1.7 3.7 3.7s-1.6 3.7-3.7 3.7-3.7-1.7-3.7-3.7 1.6-3.7 3.7-3.7Z"
        fill="url(#weaz-logo-gradient)"
      />
      <Path
        d="M13.9 12.4 18.5 17.8l-1.1 7.7c-.4 2.2-.1 4.5.9 6.6l.9 1.9c-3.4-3.7-5.1-7.5-5-11.6l-4.2.6 3.9-10.6Z"
        fill="url(#weaz-logo-gradient)"
        transform="translate(0 -2.5) scale(1 0.92)"
      />
      <Path
        d="M18.7 12.4 24 19.1l-1.6 6.9h-6.7l1.2-7.8 1.8-5.8Z"
        fill="url(#weaz-logo-gradient)"
        transform="translate(0 -2.3) scale(1 0.93)"
      />
      <Path
        d="M14.1 11.3 19.8 17.9"
        stroke="#fff6bd"
        strokeWidth={0.7}
        strokeLinecap="round"
        opacity={0.76}
      />
    </Svg>
  );
}

export default ThreadlyLogo;
