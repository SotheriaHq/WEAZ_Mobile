import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { LiquidGlassFill, type GlassRole } from '@/components/ui/LiquidGlassFill';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { MuseLoader } from '@/components/ui/MuseLoader';

/**
 * Canonical WIEZ Button Variants
 * - primary   : High-contrast neutral action on Web; on Native preserved as brand/primary for backward compatibility.
 * - brand     : WIEZ interactive accent (violet). Brand-owned CTAs (follow, add to bag, subscribe).
 * - secondary : Tactile paper / neutral supporting action alongside primary (sunken Material & Surface Lab stone).
 * - outline   : Bordered low/medium emphasis action.
 * - ghost     : Borderless, minimal action in dense UI.
 * - danger    : Destructive action.
 * - link      : Textual navigation action.
 * - neumorphic : Compatibility alias for tactile secondary action.
 */
export type ButtonVariant =
  | 'primary'
  | 'brand'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'link'
  | 'neumorphic';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress?: () => void | Promise<unknown>;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
  /**
   * Opt out of the built-in single-fire guard for controls where distinct
   * rapid presses are a legitimate interaction (steppers, counters).
   */
  allowRapidPress?: boolean;
};

/**
 * Every Button is single-fire by default. Under dev/SIT latency a press can
 * take seconds to produce visible feedback, and users respond by pressing
 * again — which used to submit duplicate mutations and stack duplicate
 * screens. Two layers close that:
 *   1. If onPress returns a promise, the button goes busy (spinner + disabled)
 *      until it settles — automatic loading state for async handlers.
 *   2. Sync handlers (fire-and-forget `void doAsync()` wrappers, navigation)
 *      get a rapid-press window: presses inside it are ignored.
 */
const RAPID_PRESS_IGNORE_MS = 650;
const BUTTON_LAYOUT_KEYS = new Set([
  'flex', 'flexBasis', 'flexGrow', 'flexShrink', 'alignSelf', 'aspectRatio',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex',
  'display', 'direction', 'margin', 'marginTop', 'marginBottom', 'marginLeft',
  'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
]);

function splitButtonStyle(style: StyleProp<ViewStyle>) {
  const layout: Record<string, unknown> = {};
  const appearance: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    (BUTTON_LAYOUT_KEYS.has(key) ? layout : appearance)[key] = value;
  }
  return { layout: layout as ViewStyle, appearance: appearance as ViewStyle };
}

/**
 * Resolves the correct size dimensions and typography from the token system.
 * - md (44px) and lg (52px) enforce minimum iOS/Android tap-target compliance.
 * - Font size maps to bodyBold (16px) for md/lg, smallBold (14px) for xs/sm.
 */
function sizeStyles(size: ButtonSize) {
  const dim = tokens.button[size];
  const textVariant: 'bodyBold' | 'caption' = size === 'md' || size === 'lg' ? 'bodyBold' : 'caption';
  return {
    height: dim.height,
    paddingHorizontal: dim.paddingHorizontal,
    textVariant,
  };
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  fullWidth,
  variant = 'primary',
  size = 'md',
  left,
  right,
  style,
  textStyle,
  testID,
  accessibilityLabel,
  allowRapidPress,
}: Props) {
  const { theme } = useTheme();
  const sz = sizeStyles(size);
  const { layout, appearance } = splitButtonStyle(style);
  /*
    A button that sizes itself to its label must keep that label on one line.

    Labels are allowed to wrap so a button given a width (a `flex: 1` pair, a
    full-width action) can fit a long title. But a button aligned to one side of
    a column with no width of its own — "Forgot password?", "Back to sign in" —
    has no width to wrap INTO: on Android the shrinkable, wrapping label was
    measured against almost nothing, the button grew to well over a screen tall
    with its label centred off-screen, and every control below it was pushed out
    of reach while the invisible button swallowed taps on the "empty" space.
    Here the label neither shrinks nor wraps, so the button is exactly as wide
    as its text and one line tall.
  */
  const sizesToLabel =
    !fullWidth &&
    layout.width === undefined &&
    layout.flex === undefined &&
    layout.flexGrow === undefined &&
    layout.flexBasis === undefined &&
    (layout.alignSelf === 'flex-start' ||
      layout.alignSelf === 'flex-end' ||
      layout.alignSelf === 'center' ||
      layout.alignSelf === 'baseline');
  const pendingPressRef = React.useRef(false);
  const lastPressAtRef = React.useRef(0);
  const [pendingPress, setPendingPress] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const isBusy = loading || pendingPress;
  const isDisabled = disabled || isBusy;

  const scale = React.useRef(new Animated.Value(1)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;

  const handlePress = React.useCallback(() => {
    if (!onPress) return;
    if (pendingPressRef.current) return;
    const now = Date.now();
    if (!allowRapidPress && now - lastPressAtRef.current < RAPID_PRESS_IGNORE_MS) return;
    lastPressAtRef.current = now;
    const result = onPress() as unknown;
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      pendingPressRef.current = true;
      setPendingPress(true);
      const settle = () => {
        pendingPressRef.current = false;
        setPendingPress(false);
      };
      (result as PromiseLike<unknown>).then(settle, settle);
    }
  }, [allowRapidPress, onPress]);

  const handlePressIn = React.useCallback(() => {
    if (!isDisabled) {
      setIsPressed(true);
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.98,
          duration: 80,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(translateY, {
          toValue: 1.5,
          duration: 80,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]).start();
    }
  }, [isDisabled, scale, translateY]);

  const handlePressOut = React.useCallback(() => {
    setIsPressed(false);
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]).start();
  }, [scale, translateY]);

  const isInert = Boolean(disabled) && !isBusy;
  const effectiveVariant = variant === 'neumorphic' ? 'secondary' : variant;
  const isTextOnly = effectiveVariant === 'link';

  /*
    Strong Lens glass for every button (owner decision, 15 Nov 2026): primary
    and danger are system-coloured glass at high tint so white labels keep their
    contrast; secondary/outline are neutral glass; ghost is barely-there glass;
    link stays text. The 2px border is kept (transparent) so no button changes
    size, and the glass bleeds under it.
  */
  const glassRole: GlassRole | null = isTextOnly
    ? null
    : isInert
      ? effectiveVariant === 'ghost' || effectiveVariant === 'outline'
        ? 'ghost'
        : 'disabled'
      : effectiveVariant === 'brand' || effectiveVariant === 'primary'
        ? 'brand'
        : effectiveVariant === 'danger'
          ? 'danger'
          : effectiveVariant === 'ghost'
            ? 'ghost'
            : 'control';
  const borderWidth = effectiveVariant === 'ghost' || isTextOnly ? 0 : 2;
  const variantBorderColor = (() => {
    if (effectiveVariant === 'ghost' || isTextOnly) return 'transparent';
    if (isInert) return theme.colors.disabledBorder;
    if (effectiveVariant === 'outline' || effectiveVariant === 'secondary') {
      return theme.colors.border;
    }
    return 'transparent';
  })();
  const variantContainer: ViewStyle = {
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    borderWidth,
    borderColor: variantBorderColor,
    backgroundColor: 'transparent',
  };

  const variantTone = (() => {
    if (isInert) return 'disabled' as const;
    switch (variant) {
      case 'secondary':
      case 'neumorphic':
      case 'outline':
      case 'ghost':
        return 'secondary' as const;
      case 'link':
        return 'primary' as const;
      case 'brand':
      case 'primary':
      case 'danger':
      default:
        return 'inverse' as const;
    }
  })();

  return (
    <Animated.View style={[
      styles.scaleWrap,
      { minHeight: sz.height, width: fullWidth ? '100%' : undefined },
      layout,
      { transform: [{ scale }, { translateY }] },
    ]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: isDisabled, busy: isBusy }}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.container,
          variantContainer,
          {
            minHeight: sz.height,
            paddingVertical: tokens.spacing.sm,
            paddingHorizontal: sz.paddingHorizontal,
            width: fullWidth ? '100%' : undefined,
            opacity: isInert ? 1 : isBusy ? 0.75 : 1,
          },
          appearance,
        ]}
      >
        {glassRole ? (
          <LiquidGlassFill
            glassRole={glassRole}
            inset={borderWidth}
            borderRadius={tokens.radius.lg}
            pressed={isPressed && !isInert}
          />
        ) : null}
        <View style={[styles.content, sizesToLabel && styles.noShrink]}>
          {left}
          <View style={[styles.labelSlot, sizesToLabel && styles.noShrink]}>
            <AppText
              variant={sz.textVariant}
              tone={variantTone}
              numberOfLines={sizesToLabel ? 1 : undefined}
              style={[
                styles.text,
                {
                  opacity: isBusy ? 0 : 1,
                },
                textStyle,
              ]}
            >
              {title}
            </AppText>
            {isBusy ? (
              <View style={styles.loaderOverlay} pointerEvents="none">
                <MuseLoader size={20} />
              </View>
            ) : null}
          </View>
          {right}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scaleWrap: {
    alignSelf: 'stretch',
    minWidth: 44,
  },
  container: {
    flexGrow: 1,
    minWidth: 44,
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    flexShrink: 1,
  },
  labelSlot: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    minWidth: 20,
  },
  /** For buttons that size to their label: measure the label at its full width. */
  noShrink: {
    flexShrink: 0,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
    letterSpacing: 0,
    textTransform: 'none',
  },
});
