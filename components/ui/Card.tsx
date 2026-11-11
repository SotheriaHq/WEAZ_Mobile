import React from 'react';
import { Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { WiezLiquidGlass } from '@/components/ui/WiezLiquidGlass';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * `elevated` and `surface` deliberately share one fill.
 *
 * `elevated` used to fill with `surfaceAlt` — a blue-grey — while `surface`
 * filled with white. Put two of them on a screen and the page reads as two
 * unrelated materials: "some containers have gray bg and some have the system
 * bg". Depth is a shadow's job, not a second background colour, so elevation is
 * now the ONLY thing separating the two and every card on a screen matches.
 *
 * `tinted` is the one exception, and it is deliberately almost invisible: a
 * barely-there wash of the brand purple for surfaces that would otherwise be
 * bare — metric tiles, summary panels. See `surfaceTintGradient`.
 */
export type CardVariant = 'surface' | 'elevated' | 'overlay' | 'tinted' | 'recessed' | 'bordered' | 'interactive' | 'liquidGlass';

type Props = {
  variant?: CardVariant;
  padding?: keyof typeof tokens.spacing;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
} & Pick<PressableProps, 'onPress' | 'disabled' | 'testID'>;

export function Card({
  variant = 'surface',
  padding = 'lg',
  style,
  children,
  onPress,
  disabled,
  testID,
}: Props) {
  const { scheme, theme } = useTheme();
  const isDark = scheme === 'dark';
  const paddingValue = tokens.spacing[padding];

  const baseStyle: ViewStyle = {
    borderRadius: tokens.radius.lg,
    borderWidth: 0,
    borderColor: theme.colors.border,
    padding: paddingValue,
  };

  const cardSurfaceColor = theme.colors.surfaceCard ?? theme.colors.surface;

  const variantStyle: ViewStyle =
    variant === 'elevated'
      ? {
          backgroundColor: cardSurfaceColor,
          borderWidth: 0,
          ...tokens.elevation.md,
        }
      : variant === 'overlay'
        ? {
            backgroundColor: theme.colors.surfaceOverlay,
            borderWidth: 0,
          }
        : variant === 'tinted'
          ? {
              backgroundColor: cardSurfaceColor,
              borderWidth: 0,
              ...tokens.elevation.sm,
            }
          : variant === 'liquidGlass'
            ? {
                backgroundColor: 'transparent',
                borderWidth: 0,
                ...(Platform.OS === 'android' ? { elevation: 0 } : tokens.elevation.md),
              }
          : variant === 'bordered'
            ? {
                backgroundColor: cardSurfaceColor,
                borderWidth: 0,
                borderColor: theme.colors.border,
              }
            : variant === 'interactive'
              ? {
                  backgroundColor: cardSurfaceColor,
                  borderWidth: 0,
                  borderColor: theme.colors.border,
                }
              : {
                  backgroundColor: variant === 'recessed' ? theme.colors.surfaceAlt : cardSurfaceColor,
                  borderWidth: 0,
                  borderColor: theme.colors.border,
                  ...tokens.elevation.sm,
                };

  const hasLightRay = isDark && (variant === 'surface' || variant === 'elevated' || variant === 'tinted');

  const content = (
    <>
      {variant === 'liquidGlass' ? (
        <WiezLiquidGlass
          mode="lightweight"
          intensity="prominent"
          tintAlpha={isDark ? 0.28 : 0.56}
          highlightIntensity={0.85}
          borderRadius={tokens.radius.lg}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {variant === 'tinted' ? (
        <LinearGradient
          colors={[...theme.colors.surfaceTintGradient]}
          locations={theme.colors.surfaceTintLocations}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: tokens.radius.lg }]}
          pointerEvents="none"
        />
      ) : null}
      {hasLightRay ? (
        <LinearGradient
          colors={[...theme.colors.lightRayGradient]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 0.8 }}
          style={[StyleSheet.absoluteFill, { borderRadius: tokens.radius.lg }]}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </>
  );

  if (onPress || variant === 'interactive') {
    return (
      <Pressable
        testID={testID}
        accessibilityRole={onPress ? 'button' : undefined}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          baseStyle,
          variantStyle,
          (variant === 'tinted' || variant === 'liquidGlass' || hasLightRay) && styles.clipped,
          pressed && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        baseStyle,
        variantStyle,
        (variant === 'tinted' || variant === 'liquidGlass' || hasLightRay) && styles.clipped,
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  // The gradient is absolutely positioned, so the card has to clip it or the
  // wash paints over its own rounded corners.
  clipped: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  disabled: {
    opacity: 0.6,
  },
});

export default Card;
