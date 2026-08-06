import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { StableImage } from '@/components/ui/StableImage';
import {
  MobileStoreApi,
  type CartState,
  type CustomBagState,
} from '@/src/api/StoreApi';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { formatMarketPrice } from '@/src/features/market/marketUtils';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navPerf } from '@/src/utils/navPerf';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function BagLineRow({
  thumbnail,
  title,
  brandName,
  meta,
  warning,
  price,
  action,
}: {
  thumbnail: string | null;
  title: string;
  brandName: string | null;
  meta: string;
  warning?: string | null;
  price: string | null;
  action?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.lineRow,
        { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
      ]}
    >
      {thumbnail ? (
        <StableImage uri={thumbnail} containerStyle={styles.lineThumb} imageStyle={styles.lineThumb} />
      ) : (
        <View style={[styles.lineThumb, styles.lineThumbFallback, { backgroundColor: theme.colors.surface }]}>
          <AppText variant="bodyBold">🛍️</AppText>
        </View>
      )}
      <View style={styles.lineCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{title}</AppText>
        {brandName ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>{brandName}</AppText>
        ) : null}
        <AppText variant="caption" tone="muted" numberOfLines={1}>{meta}</AppText>
        {warning ? (
          <AppText variant="caption" tone="secondary" numberOfLines={2}>{warning}</AppText>
        ) : null}
        {action ? <View style={styles.lineAction}>{action}</View> : null}
      </View>
      {price ? <AppText variant="bodyBold">{price}</AppText> : null}
    </View>
  );
}

export default function MyBagSheet({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const { count, loading, refreshGlobalBagCount } = useBagCount();
  const [linesLoading, setLinesLoading] = useState(false);
  const [cart, setCart] = useState<CartState | null>(null);
  const [customBag, setCustomBag] = useState<CustomBagState | null>(null);
  const [relockingSessionId, setRelockingSessionId] = useState<string | null>(null);
  const [relockError, setRelockError] = useState<string | null>(null);
  const hasItems = count.combinedCount > 0;

  const loadLines = useCallback(async () => {
    setLinesLoading(true);
    try {
      const [cartResult, customResult] = await Promise.allSettled([
        MobileStoreApi.getCart(),
        MobileStoreApi.listCustomBag(),
      ]);
      if (cartResult.status === 'fulfilled') setCart(cartResult.value);
      if (customResult.status === 'fulfilled') setCustomBag(customResult.value);
    } finally {
      setLinesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void loadLines();
    if (!visible) setRelockError(null);
  }, [visible, loadLines]);

  const handleRelock = useCallback(
    async (sessionId: string) => {
      setRelockingSessionId(sessionId);
      setRelockError(null);
      try {
        const updated = await MobileStoreApi.relockCustomBagLine(sessionId);
        if (updated) {
          setCustomBag((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.sessionId === sessionId ? updated : item,
                  ),
                }
              : current,
          );
        } else {
          await loadLines();
        }
      } catch (error) {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setRelockError(
          message === 'MANUAL_QUOTE_REQUIRED'
            ? 'This request needs a manual quote — reopen it to continue.'
            : message || 'Unable to refresh this price lock. Try again.',
        );
      } finally {
        setRelockingSessionId(null);
      }
    },
    [loadLines],
  );

  const standardItems = cart?.items ?? [];
  const customItems = customBag?.items ?? [];
  const showLineSkeleton = linesLoading && standardItems.length === 0 && customItems.length === 0;

  return (
    <AppBottomSheet
      visible={visible}
      title="My Bag"
      subtitle="Your saved standard items and custom requests are shown together."
      onClose={onClose}
      showCloseButton
      footer={
        <View style={styles.footer}>
          {hasItems ? (
            <Button
              title="Checkout"
              fullWidth
              testID="mobile-checkout-cta"
              onPress={() => {
                onClose();
                navPerf.tap('bag→checkout');
                navPerf.navigationCalled();
                drillDownPush('/checkout' as never);
              }}
            />
          ) : null}
          <View style={styles.footerRow}>
            <Button
              title="Refresh"
              variant="secondary"
              style={styles.footerRowButton}
              onPress={() => {
                void refreshGlobalBagCount({ forceRefresh: true });
                void loadLines();
              }}
            />
            <Button
              title={hasItems ? 'Done' : 'Close'}
              variant={hasItems ? 'outline' : 'primary'}
              style={styles.footerRowButton}
              onPress={onClose}
            />
          </View>
          {hasItems ? (
            <AppText variant="caption" tone="muted">
              Payment opens through the secure provider and is verified by WIEZ before orders update.
            </AppText>
          ) : null}
        </View>
      }
    >
      <View style={styles.group}>
        {showLineSkeleton ? (
          <AppText variant="body" tone="muted">Loading your bag…</AppText>
        ) : null}

        {standardItems.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="bodyBold">Standard items · {loading ? '…' : count.standardQuantity}</AppText>
            <View style={styles.sectionList}>
              {standardItems.map((item) => {
                const metaParts = [`Qty ${item.quantity}`];
                if (item.selectedSize) metaParts.push(`Size ${item.selectedSize}`);
                if (item.selectedColor) metaParts.push(item.selectedColor);
                return (
                  <BagLineRow
                    key={item.id}
                    thumbnail={item.thumbnail}
                    title={item.name ?? 'Store item'}
                    brandName={item.brandName}
                    meta={metaParts.join(' · ')}
                    price={formatMarketPrice(item.itemTotal ?? item.unitPrice, cart?.currency)}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {customItems.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="bodyBold">Custom requests · {loading ? '…' : count.customLineCount}</AppText>
            {relockError ? (
              <AppText variant="caption" tone="secondary">⚠️ {relockError}</AppText>
            ) : null}
            <View style={styles.sectionList}>
              {customItems.map((item) => {
                const metaParts = ['Qty 1'];
                if (item.measurementCount > 0) {
                  metaParts.push(`${item.measurementCount} measurement${item.measurementCount === 1 ? '' : 's'}`);
                }
                if (item.rushSelected) metaParts.push('Rush');
                const showRelock = item.isPriceLockExpired && item.canRelockPrice;
                return (
                  <BagLineRow
                    key={item.sessionId}
                    thumbnail={item.sourcePrimaryMediaUrl}
                    title={item.sourceTitle ?? 'Custom request'}
                    brandName={item.sourceBrandName}
                    meta={metaParts.join(' · ')}
                    warning={
                      item.isPriceLockExpired
                        ? showRelock
                          ? '⏳ Price lock expired.'
                          : '⏳ Price lock expired — reopen this request to relock pricing.'
                        : null
                    }
                    price={formatMarketPrice(item.grandTotal, item.currency)}
                    action={
                      showRelock ? (
                        <Button
                          title={relockingSessionId === item.sessionId ? 'Relocking…' : '🔒 Relock price'}
                          size="xs"
                          variant="secondary"
                          loading={relockingSessionId === item.sessionId}
                          disabled={relockingSessionId !== null}
                          onPress={() => void handleRelock(item.sessionId)}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {hasItems ? (
          <View style={[styles.totalRow, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Total bag count</AppText>
            <AppText variant="bodyBold">{loading ? '…' : String(count.combinedCount)}</AppText>
          </View>
        ) : (
          <AppText variant="caption" tone="muted">
            Your bag is empty. Add a product or custom design request to save it for checkout.
          </AppText>
        )}

        <Button
          title="View all orders"
          variant="outline"
          onPress={() => {
            onClose();
            drillDownPush('/orders' as never);
          }}
        />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: tokens.spacing.lg,
  },
  section: {
    gap: tokens.spacing.sm,
  },
  sectionList: {
    gap: tokens.spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.sm,
  },
  lineThumb: {
    width: 52,
    height: 52,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  lineThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  lineAction: {
    alignSelf: 'flex-start',
    marginTop: tokens.spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.md,
  },
  footer: {
    gap: tokens.spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  footerRowButton: {
    flex: 1,
  },
});
