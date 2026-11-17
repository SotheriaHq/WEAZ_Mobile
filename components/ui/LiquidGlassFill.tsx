import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { WiezLiquidGlass, type WiezLiquidGlassProps } from '@/components/ui/WiezLiquidGlass';
import { tokens, type ThemeScheme } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Glass roles: the single map from "what this control is" to how its Strong
 * Lens glass is tinted. Every button, chip, tab and tag resolves its glass
 * through here, so the whole app changes together.
 *
 * - control     neutral glass for secondary/outline buttons, chips, tabs, tags
 * - ghost       barely-there glass for dense, minimal controls
 * - brand       system purple glass at high tint (primary CTAs; white text)
 * - brandSoft   system purple glass at low tint (selected/active states)
 * - danger      destructive glass at high tint (white text)
 * - warningSoft pending / caution states
 * - stage       dark media chrome over photography/video in both themes
 * - stageGhost  faint dark glass for unselected chips over video (Runway)
 * - disabled    inert controls
 */
export type GlassRole =
  | 'control'
  | 'ghost'
  | 'ink'
  | 'brand'
  | 'brandSoft'
  | 'danger'
  | 'warningSoft'
  | 'stage'
  | 'stageGhost'
  | 'disabled';

type ThemeColors = ReturnType<typeof useTheme>['theme']['colors'];

export interface GlassRoleProps {
  tintColor?: string;
  fallbackTintAlpha: number;
  tintMode: ThemeScheme | 'auto';
}

export function glassRoleProps(role: GlassRole, colors: ThemeColors, scheme: ThemeScheme): GlassRoleProps {
  const t = tokens.liquidGlass.fallbackTint;
  const dark = scheme === 'dark';
  switch (role) {
    case 'ink':
      return { tintColor: colors.actionPrimary, fallbackTintAlpha: t.tintedStrong, tintMode: 'auto' };
    case 'brand':
      return { tintColor: colors.primary, fallbackTintAlpha: t.tintedStrong, tintMode: 'auto' };
    case 'brandSoft':
      return { tintColor: colors.primary, fallbackTintAlpha: t.tintedSoft, tintMode: 'auto' };
    case 'danger':
      return { tintColor: colors.button.surface.danger, fallbackTintAlpha: t.tintedStrong, tintMode: 'auto' };
    case 'warningSoft':
      return { tintColor: colors.warning, fallbackTintAlpha: t.tintedSoft, tintMode: 'auto' };
    case 'stage':
      return { fallbackTintAlpha: t.stageChrome, tintMode: 'dark' };
    case 'stageGhost':
      return { fallbackTintAlpha: t.ghostDark, tintMode: 'dark' };
    // Light theme: neutral glass is a faint INK tint, not white. White glass on
    // a white page disappears (the "Share does not look like a button" report);
    // a soft grey pill reads as a control while staying borderless.
    case 'ghost':
      return dark
        ? { fallbackTintAlpha: t.ghostDark, tintMode: 'auto' }
        : { tintColor: colors.text, fallbackTintAlpha: t.ghostLightInk, tintMode: 'auto' };
    case 'disabled':
      return { tintColor: colors.disabledSurface, fallbackTintAlpha: t.tintedStrong, tintMode: 'auto' };
    case 'control':
    default:
      return dark
        ? { fallbackTintAlpha: t.controlDark, tintMode: 'auto' }
        : { tintColor: colors.text, fallbackTintAlpha: t.controlLightInk, tintMode: 'auto' };
  }
}

export type LiquidGlassFillProps = Omit<
  WiezLiquidGlassProps,
  'children' | 'style' | 'tintColor' | 'fallbackTintAlpha' | 'tintMode' | 'role'
> & {
  /** Which glass this is (not the accessibility role; hosts own their a11y). */
  glassRole: GlassRole;
  /**
   * Bleed under the host's border (its `borderWidth`), so the glass fills the
   * whole rounded box while the host keeps its exact layout size.
   */
  inset?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Absolutely-filled Strong Lens glass for any pressable. Render it as the first
 * child of a control whose box has `overflow: 'hidden'` and a border radius,
 * make the control's own fill and border transparent, and the control becomes
 * the same glass as the rest of the app with no layout change.
 */
export const LiquidGlassFill = React.memo(function LiquidGlassFill({
  glassRole,
  inset = 0,
  style,
  mode = 'lightweight',
  ...rest
}: LiquidGlassFillProps) {
  const { theme, scheme } = useTheme();
  const roleProps = glassRoleProps(glassRole, theme.colors, scheme);
  return (
    <WiezLiquidGlass
      mode={mode}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...roleProps}
      {...rest}
      style={[styles.fill, inset ? { top: -inset, left: -inset, right: -inset, bottom: -inset } : null, style]}
    />
  );
});

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});

export default LiquidGlassFill;
