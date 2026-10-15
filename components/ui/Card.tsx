import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
export type CardVariant = 'surface' | 'elevated' | 'overlay' | 'tinted';

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
  const { theme } = useTheme();
  const paddingValue = tokens.spacing[padding];

  const baseStyle: ViewStyle = {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: paddingValue,
  };

  const variantStyle: ViewStyle =
    variant === 'elevated'
      ? {
          // Same fill as `surface`. The shadow is what makes it elevated.
          backgroundColor: theme.colors.surface,
          ...tokens.elevation.md,
        }
      : variant === 'overlay'
        ? {
            backgroundColor: theme.colors.surfaceOverlay,
          }
        : variant === 'tinted'
          ? {
              // The gradient paints the fill; this is what shows through the
              // corners while it lays out, and the colour anything measuring
              // the card reads.
              backgroundColor: theme.colors.surface,
              ...tokens.elevation.sm,
            }
          : {
              backgroundColor: theme.colors.surface,
            };

  const content =
    variant === 'tinted' ? (
      <>
        <LinearGradient
          colors={[...theme.colors.surfaceTintGradient]}
          // Top-to-bottom. A diagonal wash on a small tile reads as a mistake;
          // vertical just looks like the surface catching a little light.
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: tokens.radius.lg }]}
          pointerEvents="none"
        />
        {children}
      </>
    ) : (
      children
    );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          baseStyle,
          variantStyle,
          variant === 'tinted' && styles.clipped,
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
        variant === 'tinted' && styles.clipped,
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
