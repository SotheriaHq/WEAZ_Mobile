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
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
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
  const buttonTokens = theme.colors.button;

  // ── Container style per variant (theme-adaptive + tactile pressed states) ───
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
        backgroundColor:
          variant === 'outline' || variant === 'ghost' || variant === 'link'
            ? 'transparent'
            : buttonTokens.surface.disabled,
        borderColor:
          variant === 'ghost' || variant === 'link'
            ? 'transparent'
            : buttonTokens.border.disabled,
        borderWidth: variant === 'ghost' || variant === 'link' ? 0 : 2,
      };
    }

    const effectiveVariant = variant === 'neumorphic' ? 'secondary' : variant;

    switch (effectiveVariant) {
      case 'brand':
      case 'primary':
        // Native primary maps to brand color for backward compatibility
        return {
          ...base,
          backgroundColor: isPressed ? buttonTokens.surface.brandPressed : buttonTokens.surface.brand,
          borderColor: isPressed ? buttonTokens.surface.brandPressed : buttonTokens.surface.brand,
        };
      case 'secondary':
        return {
          ...base,
          backgroundColor: isPressed ? buttonTokens.surface.secondaryPressed : buttonTokens.surface.secondary,
          borderTopColor: isPressed ? buttonTokens.border.secondaryTopPressed : buttonTokens.border.secondaryTop,
          borderLeftColor: isPressed ? buttonTokens.border.secondaryTopPressed : buttonTokens.border.secondaryTop,
          borderBottomColor: isPressed ? buttonTokens.border.secondaryBottomPressed : buttonTokens.border.secondaryBottom,
          borderRightColor: isPressed ? buttonTokens.border.secondaryBottomPressed : buttonTokens.border.secondaryBottom,
        };
      case 'outline':
        return {
          ...base,
          backgroundColor: isPressed ? buttonTokens.surface.outlinePressed : buttonTokens.surface.outline,
          borderColor: isPressed ? buttonTokens.border.outlinePressed : buttonTokens.border.outline,
        };
      case 'ghost':
        return {
          ...base,
          backgroundColor: isPressed ? theme.colors.surfaceSubtle : 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'link':
        return {
          ...base,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'danger':
        return {
          ...base,
          backgroundColor: isPressed ? buttonTokens.surface.dangerPressed : buttonTokens.surface.danger,
          borderColor: isPressed ? buttonTokens.surface.dangerPressed : buttonTokens.surface.danger,
        };
      default:
        return base;
    }
  })();

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

  // ── Tactile Inset Depth Overlay (calibrated dual-tone depth emulation) ─────
  const isSecondary = variant === 'secondary' || variant === 'neumorphic';
  const showTactileOverlay =
    !isInert &&
    !isBusy &&
    (isSecondary ||
      (isPressed &&
        (variant === 'brand' || variant === 'primary' || variant === 'danger' || variant === 'outline')));

  const tactileOverlayColors: readonly [string, string, ...string[]] = (() => {
    if (isSecondary) {
      return isPressed
        ? buttonTokens.tactile.secondaryPressedOverlay
        : buttonTokens.tactile.secondaryRestOverlay;
    }
    if (variant === 'outline') {
      return buttonTokens.tactile.outlineOverlay;
    }
    return buttonTokens.tactile.primaryOverlay;
  })();

  return (
    <Animated.View style={[styles.scaleWrap, { transform: [{ scale }, { translateY }] }]}>
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
            opacity: isInert ? 1 : isBusy ? 0.75 : 1,
          },
          style,
        ]}
      >
        {showTactileOverlay && (
          <LinearGradient
            colors={tactileOverlayColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.tactileOverlay}
            pointerEvents="none"
          />
        )}
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
    position: 'relative',
  },
  tactileOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    borderTopLeftRadius: tokens.radius.lg - 2,
    borderTopRightRadius: tokens.radius.lg - 2,
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
