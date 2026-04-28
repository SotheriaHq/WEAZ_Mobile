import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type CardVariant = 'surface' | 'elevated' | 'overlay';

type Props = {
  variant?: CardVariant;
  padding?: keyof typeof tokens.spacing;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
} & Pick<PressableProps, 'onPress' | 'disabled' | 'testID'>;

export function Card({
  variant = 'surface',
  padding = 'lg',
  style,
  children,
  onPress,
  disabled,
  testID,
}: Props) {
  const { theme } = useTheme();
  const paddingValue = tokens.spacing[padding];

  const baseStyle: ViewStyle = {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: paddingValue,
  };

  const variantStyle: ViewStyle =
    variant === 'elevated'
      ? {
          backgroundColor: theme.colors.surfaceAlt,
          ...tokens.elevation.md,
        }
      : variant === 'overlay'
        ? {
            backgroundColor: theme.colors.surfaceOverlay,
          }
        : {
            backgroundColor: theme.colors.surface,
          };

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          baseStyle,
          variantStyle,
          pressed && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[baseStyle, variantStyle, disabled && styles.disabled, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  disabled: {
    opacity: 0.6,
  },
});

export default Card;
