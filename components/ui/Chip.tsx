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

import Reanimated, {
  Easing as ReEasing,
  LinearTransition,
  ZoomIn,
  ZoomOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { AppText } from '@/components/ui/AppText';
import { LiquidGlassFill, type GlassRole } from '@/components/ui/LiquidGlassFill';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  swatchColor?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /**
   * The Runway's feed tabs were the `nav` variant; they are text tabs now
   * (`src/features/feed/components/RunwayFeedTab.tsx`), and so is nothing else.
   */
  variant?: 'default' | 'profile';
  /** Custom tag awaiting global admin approval — rendered with a distinct,
   *  warning-tinted "pending" treatment so it never reads as an approved tag. */
  pending?: boolean;
};

/**
 * `interpolateColor` reads `'transparent'` as transparent BLACK, so fading from
 * it muddies the colour on the way in. Fade from the same hue at zero alpha.
 */
function withZeroAlpha(color: string): string {
  // Both themes define these tokens as #RRGGBB, so the keyword is only a guard.
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : 'transparent';
}

const OPTION_SELECT_TIMING = { duration: 180, easing: ReEasing.out(ReEasing.cubic) };
const OPTION_PRESS_IN = { duration: 90, easing: ReEasing.out(ReEasing.quad) };
const OPTION_PRESS_OUT = { damping: 15, stiffness: 280, mass: 0.6 };

/**
 * The selectable option chip — every picker in design creation (style
 * details, cultural vibe, occasion, sizing, fit, measurements, tags) is a grid
 * of these.
 *
 * It replaced a chip that was flat in every state: pressing scaled it to 98%
 * and dimmed it to 86%, which nobody can see under a finger; selecting
 * snapped from an outline to a solid fill with nothing else to say what was
 * chosen. Now, all on the UI thread:
 *   rest     clear ground and a soft edge — an offer, not a plate
 *   press    tints lilac, the edge brightens, and it gives (95%) with a
 *            springy release, so the finger sees the chip answer
 *   select   the fill eases in, a ✓ pops in beside the label, and a soft
 *            purple glow lifts the chosen chip off the surface
 *   layout   neighbours glide when the check changes a chip's width
 */
function OptionChip({
  label,
  selected,
  onPress,
  style,
  disabled,
  readOnly,
}: Pick<Props, 'label' | 'selected' | 'onPress' | 'style' | 'disabled' | 'readOnly'>) {
  const { theme } = useTheme();
  const { primary } = theme.colors;
  const isInteractive = !readOnly && Boolean(onPress) && !disabled;
  const progress = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);
  const [pressed, setPressed] = React.useState(false);

  React.useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, OPTION_SELECT_TIMING);
  }, [progress, selected]);

  // The glass carries the fill now (neutral at rest, system purple when chosen);
  // the UI thread still owns the give under the finger and the selection glow.
  const animatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: progress.value * 0.28,
    transform: [{ scale: 1 - press.value * 0.05 }],
  }));
  const glassRole: GlassRole = disabled ? 'disabled' : selected ? 'brand' : 'control';
  const borderColor = disabled
    ? theme.colors.disabledBorder
    : selected
      ? primary
      : theme.colors.border;

  const chipContent = (
    <Reanimated.View
      style={[
        styles.base,
        styles.optionBase,
        styles.glassHost,
        {
          borderColor,
          shadowColor: primary,
          elevation: selected ? 3 : 0,
        },
        isInteractive ? animatedStyle : null,
        style,
      ]}
    >
      <LiquidGlassFill
        glassRole={glassRole}
        inset={2}
        borderRadius={tokens.radius.full}
        pressed={pressed && isInteractive}
      />
      <AppText
        variant="smallBold"
        tone={selected ? 'inverse' : disabled ? 'disabled' : 'default'}
        style={styles.optionLabel}
      >
        {label}
      </AppText>
    </Reanimated.View>
  );

  if (!isInteractive && !onPress) {
    return (
      <View style={styles.touchTarget}>
        {chipContent}
      </View>
    );
  }

  return (
    <Reanimated.View layout={LinearTransition.duration(160)} style={styles.touchTarget}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(1, OPTION_PRESS_IN);
          setPressed(true);
        }}
        onPressOut={() => {
          press.value = withSpring(0, OPTION_PRESS_OUT);
          setPressed(false);
        }}
        disabled={disabled || readOnly}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      >
        {chipContent}
      </Pressable>
    </Reanimated.View>
  );
}

function ChipComponent(props: Props) {
  const isOption =
    (props.variant ?? 'default') === 'default' &&
    !props.swatchColor &&
    !props.pending;
  return isOption ? <OptionChip {...props} /> : <LegacyChip {...props} />;
}

function LegacyChip({
  label,
  selected,
  onPress,
  style,
  swatchColor,
  disabled,
  readOnly,
  variant = 'default',
  pending = false,
}: Props) {
  const { theme } = useTheme();
  const isSwatch = Boolean(swatchColor);
  const scale = React.useRef(new Animated.Value(1)).current;
  const isProfile = variant === 'profile';
  const usePendingTreatment = pending && !isSwatch;
  const isInteractive = !readOnly && Boolean(onPress) && !disabled;

  const glassRole: GlassRole = disabled
    ? 'disabled'
    : usePendingTreatment
      ? 'warningSoft'
      : isSwatch
        ? selected
          ? 'brandSoft'
          : 'control'
        : selected
          ? 'brand'
          : 'control';

  const legacyBorderColor = disabled
    ? theme.colors.disabledBorder
    : selected
      ? theme.colors.primary
      : theme.colors.border;

  const textTone = usePendingTreatment
    ? ('warning' as const)
    : selected
      ? ('inverse' as const)
      : disabled
        ? ('disabled' as const)
        : ('default' as const);

  const animatePress = React.useCallback(
    (toValue: number, duration: number) => {
      Animated.timing(scale, {
        toValue,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }).start();
    },
    [scale],
  );

  const innerContent = (
    <>
      <LiquidGlassFill glassRole={glassRole} borderRadius={tokens.radius.full} />
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
          <AppText variant={isProfile ? 'captionBold' : 'smallBold'} tone={textTone}>
            {usePendingTreatment ? `${label} · pending` : label}
          </AppText>
        </View>
      )}
    </>
  );

  const containerStyle = [
    styles.base,
    isSwatch && styles.swatchBase,
    isProfile && styles.profileBase,
    styles.glassHost,
    {
      backgroundColor: 'transparent',
      borderColor: legacyBorderColor,
      borderWidth: 2,
    },
    style,
  ];

  if (!isInteractive && !onPress) {
    return (
      <View style={styles.touchTarget}>
        <View style={containerStyle}>
          {innerContent}
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.touchTarget, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animatePress(0.98, 70)}
        onPressOut={() => animatePress(1, 140)}
        disabled={disabled || readOnly}
        style={({ pressed }) => [
          ...containerStyle,
          { opacity: pressed && !disabled ? 0.86 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityState={{
          selected: Boolean(selected),
          disabled: Boolean(disabled),
        }}
      >
        {innerContent}
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
    previous.readOnly === next.readOnly &&
    previous.pending === next.pending &&
    previous.variant === next.variant &&
    previous.swatchColor === next.swatchColor &&
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
    minHeight: 36,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  swatchBase: {
    width: 36,
    paddingHorizontal: 0,
  },
  optionBase: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    // The glow under a selected chip; opacity is animated, the shape is fixed.
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
  },
  optionLabel: {
    flexShrink: 1,
  },
  /** Clips the glass fill to the pill. */
  glassHost: {
    overflow: 'hidden',
    position: 'relative',
  },
  profileBase: {
    minHeight: tokens.button.xs.height,
    maxWidth: 168,
    paddingHorizontal: tokens.spacing.sm,
    borderWidth: 2,
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
