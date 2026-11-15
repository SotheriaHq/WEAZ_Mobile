import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import { QuickPressable } from '@/components/ui/QuickPressable';

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
  // Strong Lens glass: solid = neutral control glass, ghost = barely-there glass.
  // The 2px border is kept (transparent) on solid so its size is unchanged.
  const borderWidth = variant === 'solid' ? 2 : 0;

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
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: pressed ? [{ scale: 0.96 }] : [],
        },
        style,
      ]}>
      <LiquidGlassFill
        glassRole={variant === 'solid' ? 'control' : 'ghost'}
        inset={borderWidth}
        borderRadius={size / 2}
      />
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
