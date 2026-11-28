import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import { tokens } from '@/src/styles/tokens';

/**
 * A pill in a chip row: a filter value, a navigation link or an applied
 * filter that can be removed.
 *
 * Borderless glass in every state (selection is brand-tinted glass, never an
 * outline), a 44pt touch target around a 36pt pill, and a fixed height so a
 * row of them never shifts when a count arrives. `Chip` serves the creation
 * pickers; it draws an outline and does not compare `onPress`, so it does not
 * fit rows whose handlers change with the current filters.
 */
export type FilterChipProps = {
  label: string;
  /** Shown after the label, e.g. a facet count. */
  count?: number | null;
  selected?: boolean;
  disabled?: boolean;
  /** `remove` adds the ✕ and announces the chip as removing a filter. */
  kind?: 'toggle' | 'link' | 'remove';
  onPress: () => void;
  accessibilityLabel?: string;
};

const REMOVE_MARK = String.fromCodePoint(0x2715);

export const FilterChip = React.memo(function FilterChip({
  label,
  count,
  selected = false,
  disabled = false,
  kind = 'toggle',
  onPress,
  accessibilityLabel,
}: FilterChipProps) {
  const glassRole = disabled ? 'disabled' : selected || kind === 'remove' ? 'brand' : 'control';
  const tone = disabled ? 'disabled' : selected || kind === 'remove' ? 'inverse' : 'default';
  const countText = typeof count === 'number' ? ` ${count}` : '';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={tokens.spacing.xs}
      style={({ pressed }) => [styles.target, pressed && !disabled ? styles.pressed : null]}
      accessibilityRole={kind === 'link' ? 'link' : 'button'}
      accessibilityState={kind === 'toggle' ? { selected, disabled } : { disabled }}
      accessibilityLabel={
        accessibilityLabel ??
        (kind === 'remove'
          ? `Remove ${label}`
          : `${label}${typeof count === 'number' ? `, ${count} ${count === 1 ? 'piece' : 'pieces'}` : ''}${disabled ? ', no pieces' : ''}`)
      }
    >
      <View style={styles.pill}>
        <LiquidGlassFill glassRole={glassRole} borderRadius={tokens.radius.full} />
        <AppText variant="smallBold" tone={tone} numberOfLines={1}>
          {label}
          {countText}
          {kind === 'remove' ? `  ${REMOVE_MARK}` : ''}
        </AppText>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  target: {
    minHeight: 44,
    justifyContent: 'center',
  },
  pill: {
    minHeight: 36,
    maxWidth: 260,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
});

export default FilterChip;
