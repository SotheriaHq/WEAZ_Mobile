import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { tokens } from '@/src/styles/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function MyBagSheet({ visible, onClose }: Props) {
  const { count, loading, refreshGlobalBagCount } = useBagCount();
  const hasItems = count.combinedCount > 0;

  return (
    <AppBottomSheet
      visible={visible}
      title="My Bag"
      subtitle="Your saved standard items and custom requests are shown together."
      onClose={onClose}
      showCloseButton
      scrollable={false}
      footer={
        <View style={styles.footer}>
          <Button
            title="Refresh"
            variant="secondary"
            onPress={() => {
              void refreshGlobalBagCount({ forceRefresh: true });
            }}
          />
          <Button
            title={hasItems ? 'Done' : 'Close'}
            onPress={() => {
              onClose();
            }}
          />
        </View>
      }
    >
      <View style={styles.group}>
        <View style={styles.row}>
          <AppText variant="bodyBold">Standard items</AppText>
          <AppText variant="body">{loading ? 'Loading...' : String(count.standardQuantity)}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="bodyBold">Custom requests</AppText>
          <AppText variant="body">{loading ? 'Loading...' : String(count.customLineCount)}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="bodyBold">Total bag count</AppText>
          <AppText variant="bodyBold">{loading ? 'Loading...' : String(count.combinedCount)}</AppText>
        </View>
        {hasItems ? (
          <View style={styles.checkoutGate}>
            <Button
              title="Checkout"
              fullWidth
              testID="mobile-checkout-cta"
              onPress={() => {
                onClose();
                router.push('/checkout' as never);
              }}
            />
            <AppText variant="caption" tone="muted">
              Payment opens through the secure provider and is verified by WEAZ before orders update.
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" tone="muted">
            Your bag is empty. Add a product or custom design request to save it for checkout.
          </AppText>
        )}
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
  footer: {
    gap: tokens.spacing.sm,
  },
  checkoutGate: {
    gap: tokens.spacing.sm,
  },
});
