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
  /**
   * Render for a surface that is dark in BOTH themes — the Runway stage.
   *
   * Without this the chip is themed by the app scheme while the stage behind it
   * is not: in light mode `nav` chips render transparent with near-black text
   * onto the deep-black matte and vanish entirely. Forcing the dark palette is
   * the same opt-out `RUNWAY_MATTE` and the transit `scrimColor` already use.
   */
  onDarkStage?: boolean;
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
  onDarkStage = false,
}: Props) {
  const { scheme: activeScheme, theme: activeTheme } = useTheme();
  const scheme = onDarkStage ? 'dark' : activeScheme;
  const theme = onDarkStage
    ? ({ ...activeTheme, colors: tokens.themes.dark.colors } as typeof activeTheme)
    : activeTheme;
  const isSwatch = Boolean(swatchColor);
  const scale = React.useRef(new Animated.Value(1)).current;
  const isNav = variant === 'nav';
  const isProfile = variant === 'profile';
  // Nav chips floating directly on the runway stage. The default dark-nav
  // treatment gives every chip a `controlSurface` fill with `borderRadius: 0`
  // and a 2px underline — square plates that read as pasted-on boxes against
  // the deep black. On the stage the chips are chrome, not cards: unselected is
  // pure text, and only the selected chip carries a soft rounded pill.
  const isStageNav = isNav && onDarkStage;
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
          isStageNav && styles.stageNavBase,
          {
            backgroundColor: isSwatch
              ? selected
                ? theme.colors.primarySoft
                : 'transparent'
              : isStageNav
                ? selected
                  ? theme.colors.controlSurfaceActive
                  : 'transparent'
                : isNav
                  ? scheme === 'dark'
                    ? selected
                      ? theme.colors.primarySoft
                      : theme.colors.controlSurface
                    : 'transparent'
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
              isNav && selected && !isStageNav ? theme.colors.primary : 'transparent',
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
              onDarkStage={onDarkStage}
              variant={isNav || isProfile ? 'captionBold' : 'smallBold'}
              tone={
                isStageNav
                  ? // Bright white = active, dimmed white = available. Accent
                    // purple on the black stage read as a third UI colour and
                    // needed the plate behind it to stay legible.
                    selected
                    ? 'default'
                    : 'secondary'
                  : isNav
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
  // Runway-stage nav chips: rounded, underline-free, symmetrical padding. The
  // square plate + tab underline is a header treatment; on a full-bleed photo
  // stage it needs to melt into the black instead of framing itself.
  stageNavBase: {
    borderRadius: tokens.radius.full,
    borderBottomWidth: 0,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 34,
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
