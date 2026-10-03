/**
 * The single visual language for a buyer order's timeline.
 *
 * Schedule arithmetic belongs to the API: it owns the production and delivery
 * commitments captured when an order is accepted, plus every approved time
 * extension. This component only turns that server verdict into language and
 * a stateful surface. Keeping it shared ensures a row and its detail view can
 * never disagree about whether an order is late.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import type { BuyerOrderSchedule } from '@/src/api/BuyerOrdersApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type OrderScheduleBadgeVariant = 'row' | 'detail';

export type OrderCountdownPresentation = {
  label: string;
  tone: 'primary' | 'danger' | 'warning' | 'muted' | 'success';
  marker: string | null;
};

function dayLabel(days: number) {
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** The time left on an order, in shopper language rather than API tokens. */
export function formatOrderCountdown(
  schedule: BuyerOrderSchedule,
  variant: OrderScheduleBadgeVariant = 'row',
): OrderCountdownPresentation | null {
  switch (schedule.state) {
    case 'OVERDUE':
      return {
        label: `${dayLabel(Math.max(1, schedule.daysOverdue))} late`,
        tone: 'danger',
        // The required issue rectangle: immediate warning without adding a
        // second, redundant "issue" sentence to every delayed order.
        marker: '🟥',
      };
    case 'DUE_SOON': {
      const days = schedule.daysRemaining ?? 0;
      return {
        label: days <= 0 ? 'Due today' : `${dayLabel(days)} left`,
        tone: 'warning',
        marker: '⏳',
      };
    }
    case 'ON_TRACK': {
      const days = schedule.daysRemaining;
      if (days == null) return null;
      return { label: `${dayLabel(days)} left`, tone: 'primary', marker: null };
    }
    case 'DELIVERED':
      return variant === 'detail'
        ? { label: 'Delivered', tone: 'success', marker: null }
        : null;
    case 'CLOSED':
      return variant === 'detail'
        ? { label: 'Closed', tone: 'muted', marker: null }
        : null;
    default:
      return variant === 'detail'
        ? { label: 'Not scheduled', tone: 'muted', marker: null }
        : null;
  }
}

export function OrderScheduleBadge({
  schedule,
  variant = 'row',
}: {
  schedule: BuyerOrderSchedule;
  variant?: OrderScheduleBadgeVariant;
}) {
  const { theme } = useTheme();
  const countdown = formatOrderCountdown(schedule, variant);
  if (!countdown) return null;

  const content = (
    <>
      <View style={styles.labelRow}>
        {countdown.marker ? <AppText variant="small">{countdown.marker}</AppText> : null}
        <AppText variant="smallBold" tone={countdown.tone}>
          {countdown.label}
        </AppText>
      </View>
      {schedule.estimated ? (
        <AppText variant="captionRegular" tone="muted">
          {variant === 'detail' ? 'Estimated from this brand’s stated turnaround' : 'Estimated turnaround'}
        </AppText>
      ) : null}
      {schedule.extensionDaysGranted > 0 ? (
        <AppText variant="captionRegular" tone="muted">
          Includes {dayLabel(schedule.extensionDaysGranted)} approved extra time
        </AppText>
      ) : null}
    </>
  );

  // The soft purple gradient is intentionally reserved for a healthy time
  // signal. It carries the useful "on track" state across list and detail
  // screens without turning error and warning states into decorative colour.
  if (countdown.tone === 'primary') {
    return (
      <Card variant="tinted" padding="sm" style={styles.badge}>
        {content}
      </Card>
    );
  }

  const borderColor =
    countdown.tone === 'danger'
      ? theme.colors.danger
      : countdown.tone === 'warning'
        ? theme.colors.warning
        : theme.colors.border;

  return (
    <View
      style={[
        styles.badge,
        styles.plainBadge,
        { backgroundColor: theme.colors.surfaceAlt, borderColor },
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    gap: tokens.spacing.xs,
  },
  plainBadge: {
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.sm,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
});
