import React from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { AppText } from '@/components/ui/AppText';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  swatchColor?: string;
  disabled?: boolean;
  variant?: 'default' | 'nav';
};

export function Chip({ label, selected, onPress, style, swatchColor, disabled, variant = 'default' }: Props) {
  const { theme } = useTheme();
  const isSwatch = Boolean(swatchColor);
  const scale = React.useRef(new Animated.Value(1)).current;
  const isNav = variant === 'nav';

  const animatePress = React.useCallback(
    (toValue: number, duration: number) => {
      Animated.timing(scale, {
        toValue,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animatePress(0.96, 90)}
        onPressOut={() => animatePress(1, 140)}
        disabled={disabled}
        style={[
          styles.base,
          isSwatch && styles.swatchBase,
          isNav && styles.navBase,
          {
            backgroundColor: isSwatch
              ? selected ? theme.colors.primarySoft : 'transparent'
              : isNav
                ? selected ? theme.colors.primarySoft : 'transparent'
                : selected ? theme.colors.primary : theme.colors.surfaceAlt,
            borderColor: isNav ? 'transparent' : selected ? theme.colors.primary : theme.colors.border,
            opacity: disabled ? 0.48 : 1,
          },
          style,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: Boolean(selected) }}
      >
        {isSwatch ? (
          <View
            style={[
              styles.swatch,
              {
                backgroundColor: swatchColor,
              },
            ]}
          />
        ) : (
          <View style={styles.labelWrap}>
            <AppText
              variant="smallBold"
              tone={isNav ? (selected ? 'primary' : 'secondary') : selected ? 'inverse' : 'secondary'}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {label}
            </AppText>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: tokens.spacing.md,
    minHeight: 38,
    maxWidth: 220,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  swatchBase: {
    width: 36,
    paddingHorizontal: 0,
  },
  navBase: {
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 0,
    borderRadius: tokens.radius.full,
    flexShrink: 0,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.full,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    flexShrink: 0,
  },
});
