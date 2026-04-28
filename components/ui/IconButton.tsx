import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

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
    variant === 'solid' ? theme.colors.border : theme.colors.border;

  return (
    <Pressable
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
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: pressed ? [{ scale: 0.96 }] : [],
        },
        style,
      ]}>
      <View style={styles.inner}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
