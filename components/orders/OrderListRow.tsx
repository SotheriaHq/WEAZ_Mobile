/**
 * One order, as a row of a list — not as a card.
 *
 * Both order surfaces (the profile Orders tab and the full `/orders` history)
 * drew their own version of this, and both drew it as a bordered, rounded card
 * in a stack of bordered, rounded cards. Ten rounded rectangles down a phone
 * screen is ten outlines competing with the content inside them; a list reads
 * faster when the only rule between two entries is the one that separates them.
 * So: no box, no radius on the row, one hairline underneath.
 *
 * The cover carries the weight instead. An order is a garment, and the row was
 * showing an emoji where the garment should be — see `BuyerOrdersApi`, where
 * the list payload's flat `sourcePrimaryMediaUrl` was being read as a nested
 * `source.primaryMediaUrl` and always came back empty.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import type { BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { formatMoney } from '@/src/utils/money';

export type OrderStatusTone = 'success' | 'danger' | 'warning' | 'neutral';

export function getOrderStatusTone(status: string): OrderStatusTone {
  const upper = status.toUpperCase();
  if (upper.includes('COMPLET') || upper.includes('DELIVERED')) return 'success';
  if (
    upper.includes('DISPUT') ||
    upper.includes('CANCEL') ||
    upper.includes('REJECT') ||
    upper.includes('REFUND')
  ) {
    return 'danger';
  }
  if (
    upper.includes('PENDING') ||
    upper.includes('PROCESS') ||
    upper.includes('TRANSIT') ||
    upper.includes('READY')
  ) {
    return 'warning';
  }
  return 'neutral';
}

/** `PENDING_BRAND_ACCEPTANCE` is a database value, not something to read. */
export function humanizeOrderStatus(status: string): string {
  const cleaned = status.replace(/_/g, ' ').trim().toLowerCase();
  if (!cleaned) return 'Unknown';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * A custom order has no line items — its count is how many measurements were
 * taken. Calling those "items" said the shopper had bought six of something.
 */
export function orderCountLabel(order: BuyerOrderSummary): string | null {
  const count = order.itemCount;
  if (!Number.isFinite(count) || count <= 0) return null;
  if (order.kind === 'CUSTOM') {
    return `${count} measurement${count === 1 ? '' : 's'}`;
  }
  return `${count} item${count === 1 ? '' : 's'}`;
}

export function formatOrderDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const OrderListRow = memo(function OrderListRow({
  order,
  onPress,
  onPressIn,
  /** The last row owns no rule — a list should not end in a line to nowhere. */
  last = false,
  variant = 'rule',
}: {
  order: BuyerOrderSummary;
  onPress: () => void;
  onPressIn?: () => void;
  last?: boolean;
  /**
   * `rule` — rows separated by a hairline, no radius. Right for `/orders`,
   *   where the list is long and ten rounded rectangles down a phone is ten
   *   outlines competing with what is inside them.
   * `card` — a stacked, raised card per order. Right for the profile, where
   *   the preview is a handful of orders among other kinds of content and each
   *   one needs an edge of its own to read as a separate thing.
   */
  variant?: 'rule' | 'card';
}) {
  const { theme } = useTheme();
  const isCard = variant === 'card';
  const statusTone = getOrderStatusTone(order.status);
  // The dot is a View, so it takes the colour directly; the label takes the
  // matching AppText tone, which is where colour belongs on type.
  const dotColor =
    statusTone === 'success'
      ? theme.colors.success
      : statusTone === 'danger'
        ? theme.colors.danger
        : statusTone === 'warning'
          ? theme.colors.warning
          : theme.colors.textMuted;
  const textTone = statusTone === 'neutral' ? 'muted' : statusTone;
  const countLabel = orderCountLabel(order);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      accessibilityRole="button"
      accessibilityLabel={`Open ${order.title}, ${humanizeOrderStatus(order.status)}`}
      style={({ pressed }) => [
        styles.row,
        isCard
          ? [
              styles.cardRow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                ...tokens.elevation.sm,
              },
            ]
          : !last
            ? {
                borderBottomColor: theme.colors.border,
                borderBottomWidth: StyleSheet.hairlineWidth,
              }
            : null,
        pressed ? { backgroundColor: theme.colors.surfaceAlt } : null,
      ]}
    >
      <View style={[styles.cover, { backgroundColor: theme.colors.surfaceAlt }]}>
        <StableImage
          uri={order.thumbnail ?? undefined}
          containerStyle={styles.coverFill}
          imageStyle={styles.coverFill}
          resizeMode="cover"
          fallback={
            <View style={[styles.coverFill, styles.coverFallback]}>
              <AppText variant="subtitle">{order.kind === 'STANDARD' ? '🧵' : '✂️'}</AppText>
            </View>
          }
        />
        {/* The kind reads off the cover, so the row needs no pill for it. */}
        <View style={[styles.kindTag, { backgroundColor: theme.colors.backdropStrong }]}>
          <AppText variant="small" tone="inverse" numberOfLines={1}>
            {order.kind === 'STANDARD' ? 'Standard' : 'Custom'}
          </AppText>
        </View>
      </View>

      <View style={styles.copy}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {order.title}
        </AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {order.brandName}
        </AppText>
        <View style={styles.statusLine}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <AppText variant="small" tone={textTone} numberOfLines={1}>
            {humanizeOrderStatus(order.status)}
          </AppText>
          <AppText variant="small" tone="muted" numberOfLines={1}>
            · {formatOrderDate(order.createdAt)}
          </AppText>
        </View>
      </View>

      <View style={styles.amount}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {formatMoney(order.amount, order.currency)}
        </AppText>
        {countLabel ? (
          <AppText variant="small" tone="muted" numberOfLines={1}>
            {countLabel}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cardRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  cover: {
    width: 52,
    height: 66,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
  coverFill: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  amount: {
    alignItems: 'flex-end',
    gap: 2,
  },
});

export default OrderListRow;
