import React, { memo } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { BagPulseIcon, type BagPulseStatus } from '@/components/ui/BagPulseIcon';
import { BAG_IT_LABEL } from '@/src/constants/bagging';
import {
  bagHeartbeatGlow,
  bagHeartbeatScale,
  useBagHeartbeat,
} from '@/src/features/bagging/bagHeartbeat';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type BagItButtonProps = {
  onPress?: () => void | Promise<unknown>;
  label?: string;
  /** A bag request is in flight. */
  busy?: boolean;
  /** No bag action is possible here (sold out, own product, brand account). */
  disabled?: boolean;
  /** Bag state for the mark: bagged before, in the bag now, and so on. */
  status?: BagPulseStatus;
  mode?: 'standard' | 'custom';
  accessibilityLabel?: string;
};

/**
 * The Bag It control, identical on every product card.
 *
 * One mark: the shopping-bags emoji on its plate (`BagPulseIcon`), the same
 * one the Shop tab has always shown. The BUTTON carries the heartbeat — scale
 * and a glow ring from the shared clock in `bagHeartbeat.ts` — whenever
 * bagging is possible, and goes still when it is not, so stillness itself
 * reads as "not available". `Button` supplies the single-fire guard, so a
 * double tap can never send two bag requests.
 */
export const BagItButton = memo(function BagItButton({
  onPress,
  label = BAG_IT_LABEL,
  busy = false,
  disabled = false,
  status,
  mode = 'standard',
  accessibilityLabel,
}: BagItButtonProps) {
  const { theme } = useTheme();
  const live = !disabled && !busy && Boolean(onPress);
  const beating = useBagHeartbeat(live);
  const markStatus: BagPulseStatus = disabled
    ? 'disabled'
    : busy
      ? 'bagging'
      : status ?? 'not_bagged';

  return (
    <Animated.View style={[styles.wrap, beating ? { transform: [{ scale: bagHeartbeatScale }] } : null]}>
      {beating ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { borderColor: theme.colors.primary, opacity: bagHeartbeatGlow }]}
        />
      ) : null}
      <Button
        title={label}
        size="md"
        variant="primary"
        fullWidth
        disabled={disabled || !onPress}
        loading={busy}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel ?? label}
        left={
          <BagPulseIcon
            status={markStatus}
            context="multi_card"
            mode={mode}
            size={26}
            animated={false}
          />
        }
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  glow: {
    position: 'absolute',
    top: -tokens.spacing.xs,
    right: -tokens.spacing.xs,
    bottom: -tokens.spacing.xs,
    left: -tokens.spacing.xs,
    borderRadius: tokens.radius.lg + tokens.spacing.xs,
    borderWidth: 2,
  },
});

export default BagItButton;
