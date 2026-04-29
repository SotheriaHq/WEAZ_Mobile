import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { MobileStoreApi, type ProductBagStatus } from '@/src/api/StoreApi';
import { tokens } from '@/src/styles/tokens';

type BagProductInput = {
  id: string;
  name?: string;
};

type Props = {
  visible: boolean;
  product: BagProductInput | null;
  status: ProductBagStatus | null;
  onClose: () => void;
};

export default function BagSummarySheet({ visible, product, status, onClose }: Props) {
  const [standardCount, setStandardCount] = useState(0);
  const [customCount, setCustomCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [cart, customBag] = await Promise.all([
          MobileStoreApi.getCart(),
          MobileStoreApi.listCustomBag(),
        ]);
        if (!active) return;
        setStandardCount(cart.totalQuantity);
        setCustomCount(customBag.total);
      } catch {
        if (!active) return;
        setStandardCount(0);
        setCustomCount(0);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [visible]);

  return (
    <AppBottomSheet
      visible={visible}
      title={`${product?.name || 'This item'} is already in your bag`}
      subtitle={status?.ui.disabledReason || 'Here is the current bag summary.'}
      onClose={onClose}
      showCloseButton
      scrollable={false}
    >
      <View style={styles.group}>
        <View style={styles.row}>
          <AppText variant="bodyBold">Standard items</AppText>
          <AppText variant="body">{loading ? 'Loading...' : String(standardCount)}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="bodyBold">Custom requests</AppText>
          <AppText variant="body">{loading ? 'Loading...' : String(customCount)}</AppText>
        </View>
        <AppText variant="caption" tone="muted">
          Items are still saved in your bag. Close this sheet to keep browsing.
        </AppText>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: tokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.xs,
  },
});
