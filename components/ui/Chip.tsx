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

function ChipComponent({
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
                  ? // Unselected nav chips carry NO fill in either scheme. Dark
                    // mode used to give them a `controlSurface` plate, which is
                    // the boxed-edge look on the Runway; the selected pill is
                    // the only indicator these need.
                    selected
                    ? theme.colors.primarySoft
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
            // The nav underline is gone — the pill is the indicator now.
            borderBottomColor: 'transparent',
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

/**
 * Memoized because chips are always rendered as a grid.
 *
 * Selecting one chip re-rendered every chip in the sheet — forty-odd components
 * each re-resolving the theme and rebuilding a style array — before the tapped
 * one could repaint. That is the lag between pressing a chip and seeing it fill.
 * Only the chips whose props actually changed re-render now, which is the two
 * involved in a selection change.
 *
 * `onPress` is deliberately NOT compared: call sites build it inline, so
 * comparing it would defeat the memo entirely, and the handler is only read on
 * press (never during render) so a stale-by-one-render reference cannot show
 * the wrong state. Call sites that need identity stability should pass a
 * `useCallback`.
 */
export const Chip = React.memo(
  ChipComponent,
  (previous, next) =>
    previous.label === next.label &&
    previous.selected === next.selected &&
    previous.disabled === next.disabled &&
    previous.pending === next.pending &&
    previous.variant === next.variant &&
    previous.swatchColor === next.swatchColor &&
    previous.onDarkStage === next.onDarkStage &&
    previous.style === next.style,
);

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
  /**
   * Runway filter chips. Rounded pill, no plate.
   *
   * This was `borderRadius: 0` with a 2px bottom underline — a tab treatment.
   * On the Runway the chips float over photography, and in dark mode the
   * unselected ones also carried a `controlSurface` fill, so the row read as a
   * strip of square plates with hard edges pasted onto the image. Unselected is
   * now pure text and only the selected chip carries a soft rounded pill, which
   * is the same conclusion `stageNavBase` reached for the pinned-dark stage.
   */
  navBase: {
    minHeight: 38,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 0,
    borderBottomWidth: 0,
    borderRadius: tokens.radius.full,
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
