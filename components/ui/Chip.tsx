import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

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
  variant?: 'default' | 'nav' | 'profile';
  /** Custom tag awaiting global admin approval — rendered with a distinct,
   *  warning-tinted "pending" treatment so it never reads as an approved tag. */
  pending?: boolean;
};

export function Chip({
  label,
  selected,
  onPress,
  style,
  swatchColor,
  disabled,
  variant = 'default',
  pending = false,
}: Props) {
  const { theme } = useTheme();
  const isSwatch = Boolean(swatchColor);
  const scale = React.useRef(new Animated.Value(1)).current;
  const isNav = variant === 'nav';
  const isProfile = variant === 'profile';
  // Pending custom tags use a warning-tinted outline over a soft surface instead
  // of the solid selected fill, so "added but not yet globally approved" is legible.
  const usePendingTreatment = pending && !isNav && !isSwatch;

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
    <Animated.View style={[styles.touchTarget, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animatePress(0.98, 70)}
        onPressOut={() => animatePress(1, 140)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          isSwatch && styles.swatchBase,
          isNav && styles.navBase,
          isProfile && styles.profileBase,
          isNav && selected && styles.navSelected,
          isNav && !selected && styles.navInactive,
          {
            backgroundColor: isSwatch
              ? selected
                ? theme.colors.primarySoft
                : 'transparent'
              : isNav
                ? 'transparent'
                : usePendingTreatment
                  ? theme.colors.surfaceAlt
                  : selected
                    ? theme.colors.primary
                    : theme.colors.surfaceAlt,
            borderColor: isNav
              ? 'transparent'
              : usePendingTreatment
                ? theme.colors.warning
                : selected
                  ? theme.colors.primary
                  : theme.colors.border,
            borderBottomColor:
              isNav && selected ? theme.colors.primary : 'transparent',
            opacity: disabled ? 0.48 : pressed ? 0.86 : 1,
          },
          style,
        ]}
        accessibilityRole="button"
        accessibilityState={{
          selected: Boolean(selected),
          disabled: Boolean(disabled),
        }}
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
              variant={isNav || isProfile ? 'captionBold' : 'smallBold'}
              tone={
                isNav
                  ? selected
                    ? 'primary'
                    : 'default'
                  : usePendingTreatment
                    ? 'warning'
                    : selected
                      ? 'inverse'
                      : 'secondary'
              }
              numberOfLines={1}
            >
              {usePendingTreatment ? `${label} · pending` : label}
            </AppText>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
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
    minHeight: 38,
    paddingHorizontal: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
    paddingBottom: tokens.spacing.sm,
    borderWidth: 0,
    borderBottomWidth: 2,
    borderRadius: 0,
    flexShrink: 0,
  },
  navSelected: {
    paddingHorizontal: tokens.spacing.md,
  },
  navInactive: {
    backgroundColor: 'transparent',
  },
  profileBase: {
    minHeight: tokens.button.xs.height,
    maxWidth: 168,
    paddingHorizontal: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    flexShrink: 1,
    minWidth: 0,
  },
});
