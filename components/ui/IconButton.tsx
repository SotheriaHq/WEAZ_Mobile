import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { QuickPressable } from '@/components/ui/QuickPressable';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export type IconButtonVariant = 'solid' | 'ghost';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  size?: number;
  variant?: IconButtonVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function IconButton({
  children,
  onPress,
  disabled,
  size = 40,
  variant = 'ghost',
  style,
  testID,
}: Props) {
  const { theme } = useTheme();

  const backgroundColor =
    variant === 'solid' ? theme.colors.surfaceAlt : 'transparent';

  const borderColor =
    variant === 'solid' ? theme.colors.border : 'transparent';

  // Acts while the finger is down (see QuickPressable): 👈 and every header
  // icon used to wait for the finger to lift.
  return (
    <QuickPressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderColor,
          borderWidth: variant === 'solid' ? StyleSheet.hairlineWidth : 0,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: pressed ? [{ scale: 0.96 }] : [],
        },
        style,
      ]}>
      <View style={styles.inner}>{children}</View>
    </QuickPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
