import React, { memo } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { BagPulseIcon, type BagPulseStatus } from '@/components/ui/BagPulseIcon';
import { BAG_IT_LABEL } from '@/src/constants/bagging';
import { bagHeartbeatScale, useBagHeartbeat } from '@/src/features/bagging/bagHeartbeat';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type BagItButtonProps = {
  onPress?: () => void | Promise<unknown>;
  label?: string;
  /** A bag request is in flight. */
  busy?: boolean;
  /** No bag action is possible here (sold out, own product, brand account). */
  disabled?: boolean;
  /** Kept for callers; the mark is always the same bag emoji. */
  status?: BagPulseStatus;
  mode?: 'standard' | 'custom';
  accessibilityLabel?: string;
};

/**
 * The Bag It control on every product card: compact, quiet, alive.
 *
 * - Half-size and sized to its label, sitting inside the card's price row
 *   rather than as a full-width bar standing out of the card.
 * - A soft brand tint, not the solid brand fill — on a dark screen the solid
 *   purple was the brightest thing on the card, brighter than the product.
 * - One mark: the bare shopping-bags emoji. The plate behind it changed colour
 *   with bag state, so the mark looked different from card to card.
 * - The heartbeat is the shared clock (`bagHeartbeat.ts`) as a gentle scale
 *   only. A ring used to flash around the button on each beat; it read as a
 *   border appearing and disappearing, so it is gone.
 *
 * `Button` supplies the single-fire guard, so a double tap never bags twice.
 */
export const BagItButton = memo(function BagItButton({
  onPress,
  label = BAG_IT_LABEL,
  busy = false,
  disabled = false,
  mode = 'standard',
  accessibilityLabel,
}: BagItButtonProps) {
  const { theme } = useTheme();
  const live = !disabled && !busy && Boolean(onPress);
  const beating = useBagHeartbeat(live);

  return (
    <Animated.View style={beating ? { transform: [{ scale: bagHeartbeatScale }] } : null}>
      <Button
        title={label}
        size="xs"
        variant="ghost"
        disabled={disabled || !onPress}
        loading={busy}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel ?? label}
        style={[styles.pill, { backgroundColor: theme.colors.primarySoft }]}
        left={
          <BagPulseIcon
            status={disabled ? 'disabled' : 'not_bagged'}
            context="multi_card"
            mode={mode}
            size={18}
            surface="bare"
            animated={false}
          />
        }
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pill: {
    // Sizes to its label (one line) and sits at the end of the price row.
    alignSelf: 'flex-end',
    minWidth: 0,
    /*
      A FIXED height, not just a minimum.

      Button's inner pressable has `flexGrow: 1`. Inside the Catalogue's
      Shop pager, Yoga measured the pill against the pager's height as the
      space available, so the pill grew to it; the page then measured taller,
      the pager (sized from that measurement) grew, and the pill grew again —
      a loop that reached 4,499,230px on device (2026-11-09) and made the
      Shop tab scroll forever past two cards, with each price centred
      millions of pixels down.
    */
    height: tokens.button.xs.height,
    borderWidth: 0,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
  },
});

export default BagItButton;
