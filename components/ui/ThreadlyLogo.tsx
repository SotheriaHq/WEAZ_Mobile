import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

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
      accessibilityLabel="Threadly logo"
    >
      <Defs>
        <LinearGradient
          id="threadly-logo-gradient"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#9333ea" />
          <Stop offset="0.5" stopColor="#d4af37" />
          <Stop offset="1" stopColor="#6b21a8" />
        </LinearGradient>
      </Defs>
      <Path
        d="M8 20C8 16.5 13 16.5 13 13C13 9.5 8 9.5 8 13"
        stroke="url(#threadly-logo-gradient)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24 12C24 15.5 19 15.5 19 19C19 22.5 24 22.5 24 19"
        stroke="url(#threadly-logo-gradient)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="16" cy="16" r="2.5" fill="url(#threadly-logo-gradient)" />
    </Svg>
  );
}

export default ThreadlyLogo;