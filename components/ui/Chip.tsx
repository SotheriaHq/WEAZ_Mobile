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
              : isNav ? 'transparent' : selected ? theme.colors.primary : theme.colors.surfaceAlt,
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
              variant={isNav ? (selected ? 'bodyStrong' : 'bodyRegular') : 'smallBold'}
              tone={isNav ? (selected ? 'primary' : 'muted') : selected ? 'inverse' : 'secondary'}
              numberOfLines={1}
            >
              {label}
            </AppText>
            {isNav ? (
              <View
                style={[
                  styles.navUnderline,
                  {
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                  },
                ]}
              />
            ) : null}
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
    maxWidth: 180,
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
    minHeight: 40,
    paddingHorizontal: tokens.spacing.sm,
    borderWidth: 0,
    borderRadius: 0,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.full,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  navUnderline: {
    height: 2,
    minWidth: '100%',
    borderRadius: tokens.radius.full,
  },
});
