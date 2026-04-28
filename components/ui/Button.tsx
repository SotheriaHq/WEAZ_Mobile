import React from 'react';
import {
  ActivityIndicator,
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

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress?: () => void;
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
};

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
}: Props) {
  const { theme } = useTheme();
  const sz = sizeStyles(size);
  const isDisabled = disabled || loading;
  const scale = React.useRef(new Animated.Value(1)).current;

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

  const handlePressIn = React.useCallback(() => {
    if (!isDisabled) {
      animatePress(0.97, 90);
    }
  }, [animatePress, isDisabled]);

  const handlePressOut = React.useCallback(() => {
    animatePress(1, 140);
  }, [animatePress]);

  // ── Container style per variant (fully theme-adaptive) ──────────────────────
  const variantContainer: ViewStyle = (() => {
    const base: ViewStyle = {
      borderRadius: tokens.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      borderWidth: 1,
    };

    switch (variant) {
      case 'primary':
        return { ...base, backgroundColor: theme.colors.primary, borderColor: theme.colors.primary };
      case 'secondary':
        return { ...base, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border };
      case 'outline':
        return { ...base, backgroundColor: theme.colors.surface, borderColor: theme.colors.border };
      case 'ghost':
        return { ...base, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border };
      case 'danger':
        return { ...base, backgroundColor: theme.colors.danger, borderColor: theme.colors.danger };
      default:
        return base;
    }
  })();

  // ── Text color per variant ───────────────────────────────────────────────────
  const variantTone = (() => {
    switch (variant) {
      case 'secondary':
      case 'outline':
      case 'ghost':
        return 'secondary' as const;
      case 'primary':
        return 'inverse' as const;
      case 'danger':
      default:
        return 'inverse' as const;
    }
  })();

  return (
    <Animated.View style={[styles.scaleWrap, { transform: [{ scale }] }]}>
      <Pressable
        testID={testID}
        onPress={onPress}
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
            opacity: isDisabled ? 0.55 : 1,
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
                  opacity: loading ? 0 : 1,
                },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {title}
            </AppText>
            {loading ? (
              <View style={styles.loaderOverlay} pointerEvents="none">
                <ActivityIndicator
                  size="small"
                  color={variantTone === 'inverse' ? theme.colors.textInverse : theme.colors.text}
                />
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
    minWidth: 0,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    letterSpacing: 0,
    textTransform: 'none',
  },
});
