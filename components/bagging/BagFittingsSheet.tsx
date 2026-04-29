import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ProductBagStatus } from '@/src/api/StoreApi';

type BagProductInput = {
  id: string;
  name?: string;
};

type Props = {
  visible: boolean;
  product: BagProductInput | null;
  status: ProductBagStatus | null;
  onClose: () => void;
  onContinue?: () => void;
};

export default function BagFittingsSheet({ visible, product, status, onClose, onContinue }: Props) {
  const { theme } = useTheme();
  const missingMeasurements = useMemo(
    () => status?.custom.missingMeasurementKeys ?? [],
    [status?.custom.missingMeasurementKeys],
  );

  return (
    <AppBottomSheet
      visible={visible}
      title={`Finish fittings for ${product?.name || 'this item'}`}
      subtitle="We need a few measurements before this custom request can move forward."
      onClose={onClose}
      showCloseButton
      onDone={onContinue}
      doneLabel="Continue"
      scrollable
    >
      <View style={styles.group}>
        <View style={styles.section}>
          <AppText variant="subtitle">Missing measurements</AppText>
          <View style={styles.chipRow}>
            {missingMeasurements.length > 0 ? (
              missingMeasurements.map((measurement) => (
                <View key={measurement} style={[styles.chip, { backgroundColor: theme.colors.primarySoft }]}>
                  <AppText variant="caption" tone="primary">{measurement}</AppText>
                </View>
              ))
            ) : (
              <AppText variant="caption" tone="muted">No measurements are missing, but this custom request still needs the custom order step.</AppText>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="caption" tone="muted">
            {status?.ui.disabledReason || 'We will continue into the custom order flow after you close this sheet.'}
          </AppText>
        </View>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  chip: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
});
