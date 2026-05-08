import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import type { ProductBagStatus } from '@/src/api/StoreApi';
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
  onUpdateFittings: () => void;
  onContinue: () => void;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export default function StaleFittingConfirmationSheet({
  visible,
  product,
  status,
  onClose,
  onUpdateFittings,
  onContinue,
}: Props) {
  const lastUpdated = useMemo(
    () => formatDate(status?.custom.measurementUpdatedAt),
    [status?.custom.measurementUpdatedAt],
  );
  const staleAfterDays = status?.custom.staleAfterDays ?? 14;

  return (
    <AppBottomSheet
      visible={visible}
      title="Review saved fittings"
      subtitle={`${product?.name || 'This item'} can use your saved measurements, but they may be outdated.`}
      onClose={onClose}
      showCloseButton
      scrollable={false}
      footer={
        <View style={styles.footer}>
          <Button title="Update fittings" onPress={onUpdateFittings} />
          <Button title="Continue with saved measurements" variant="secondary" onPress={onContinue} />
        </View>
      }
    >
      <View style={styles.group}>
        <AppText variant="body">
          Your fittings may be outdated. Update them for a better fit, or continue with your saved measurements.
        </AppText>
        <View style={styles.details}>
          {lastUpdated ? (
            <AppText variant="caption" tone="muted">
              Last updated: {lastUpdated}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="muted">
            Freshness window: {staleAfterDays} days
          </AppText>
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: tokens.spacing.md,
  },
  details: {
    gap: tokens.spacing.xs,
  },
  footer: {
    gap: tokens.spacing.sm,
  },
});

