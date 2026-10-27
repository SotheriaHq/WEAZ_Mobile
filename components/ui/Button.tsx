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
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { MuseLoader } from '@/components/ui/MuseLoader';

/**
 * Canonical WIEZ Button Variants
 * - primary   : High-contrast neutral action on Web; on Native preserved as brand/primary for backward compatibility.
 * - brand     : WIEZ interactive accent (violet). Brand-owned CTAs (follow, add to bag, subscribe).
 * - secondary : Tactile paper / neutral supporting action alongside primary.
 * - outline   : Bordered low/medium emphasis action.
 * - ghost     : Borderless, minimal action in dense UI.
 * - danger    : Destructive action.
 * - link      : Textual navigation action.
 */
export type ButtonVariant = 'primary' | 'brand' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
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
  const pendingPressRef = React.useRef(false);
  const lastPressAtRef = React.useRef(0);
  const [pendingPress, setPendingPress] = React.useState(false);
  const isBusy = loading || pendingPress;
  const isDisabled = disabled || isBusy;
  const scale = React.useRef(new Animated.Value(1)).current;

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

  const handlePressIn = React.useCallback(() => {
    if (!isDisabled) {
      animatePress(0.96, 80);
    }
  }, [animatePress, isDisabled]);

  const handlePressOut = React.useCallback(() => {
    animatePress(1, 140);
  }, [animatePress]);

  /**
   * Disabled is a state of its own, not the enabled state turned down.
   *
   * Every variant used to keep its own fill and lean on `opacity: 0.55`, so a
   * disabled primary was brand purple at 55% — still the loudest, most
   * obviously pressable thing on the screen, and then it refused the press.
   * The Continue and Save buttons on the create flows spend most of their life
   * disabled, so that was the app's most common button reading as its most
   * inviting one. Disabled now drops to neutral chrome in both themes and the
   * brand colour is reserved for controls that will actually do something.
   *
   * `loading` is deliberately NOT this. A busy button is working on the press
   * it was given, so it keeps its colour and shows a spinner.
   */
  const isInert = Boolean(disabled) && !isBusy;

  // ── Container style per variant (fully theme-adaptive) ──────────────────────
  const variantContainer: ViewStyle = (() => {
    const base: ViewStyle = {
      borderRadius: tokens.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      borderWidth: 2,
    };

    if (isInert) {
      return {
        ...base,
        backgroundColor: variant === 'outline' || variant === 'ghost' || variant === 'link' ? 'transparent' : theme.colors.disabledSurface,
        borderColor: variant === 'ghost' || variant === 'link' ? 'transparent' : theme.colors.disabledBorder,
      };
    }

    switch (variant) {
      case 'brand':
        return {
          ...base,
          backgroundColor: theme.colors.actionBrand ?? theme.colors.primary,
          borderColor: theme.colors.actionBrand ?? theme.colors.primary,
        };
      case 'primary':
        // Native compatibility alias: primary maps to primary brand color
        return { ...base, backgroundColor: theme.colors.primary, borderColor: theme.colors.primary };
      case 'secondary':
        return {
          ...base,
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          borderTopColor: theme.colors.border,
          borderLeftColor: theme.colors.border,
          borderBottomColor: theme.colors.surface,
          borderRightColor: theme.colors.surface,
        };
      case 'outline':
        return { ...base, backgroundColor: theme.colors.surface, borderColor: theme.colors.border };
      case 'ghost':
        return { ...base, backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 };
      case 'link':
        return { ...base, backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 };
      case 'danger':
        return { ...base, backgroundColor: theme.colors.danger, borderColor: theme.colors.danger };
      default:
        return base;
    }
  })();

  // ── Text color per variant ───────────────────────────────────────────────────
  const variantTone = (() => {
    if (isInert) return 'disabled' as const;
    switch (variant) {
      case 'secondary':
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
    <Animated.View style={[styles.scaleWrap, { transform: [{ scale }] }]}>
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
            height: sz.height,
            paddingHorizontal: sz.paddingHorizontal,
            width: fullWidth ? '100%' : undefined,
            // Inert buttons carry their own neutral palette, so the blanket
            // fade is only for the busy state now.
            opacity: isInert ? 1 : isBusy ? 0.75 : 1,
          },
          style,
        ]}
      >
        <View style={styles.content}>
          {left}
          <View style={styles.labelSlot}>
            <AppText
              variant={sz.textVariant}
              tone={variantTone}
              style={[
                styles.text,
                {
                  opacity: isBusy ? 0 : 1,
                },
                textStyle,
              ]}
              numberOfLines={1}
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
  },
  container: {
    minWidth: 44,
    overflow: 'hidden',
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
  loaderOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    letterSpacing: 0,
    textTransform: 'none',
  },
});
