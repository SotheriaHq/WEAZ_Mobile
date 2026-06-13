import React from 'react';
import { router } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton, type IconButtonVariant } from '@/components/ui/IconButton';
import { navPerf } from '@/src/utils/navPerf';

type Props = {
  onPress?: () => void;
  fallbackHref?: string;
  label?: string;
  emoji?: string;
  variant?: IconButtonVariant;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function AppBackButton({
  onPress,
  fallbackHref,
  label = 'Go back',
  emoji = '👈',
  variant = 'ghost',
  size = 44,
  style,
}: Props) {
  return (
    <IconButton
      size={size}
      variant={variant}
      style={style}
      onPress={() => {
        navPerf.tap('back');
        if (onPress) {
          onPress();
          return;
        }
        if (router.canGoBack()) {
          navPerf.navigationCalled();
          router.back();
          return;
        }
        if (fallbackHref) {
          navPerf.navigationCalled();
          router.replace(fallbackHref as any);
        }
      }}
      testID="app-back-button"
    >
      <AppText variant="subtitle" accessibilityLabel={label}>
        {emoji}
      </AppText>
    </IconButton>
  );
}

export default AppBackButton;
