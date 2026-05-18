import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';

type Props = {
  visible: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function DeleteReviewConfirmSheet({ visible, loading = false, onCancel, onConfirm }: Props) {
  return (
    <AppBottomSheet visible={visible} title="Delete review?" onClose={loading ? () => undefined : onCancel} showCloseButton scrollable={false}>
      <View style={styles.stack}>
        <AppText variant="body" tone="muted">
          Your review will be removed from public review lists and summaries. This does not affect your completed order.
        </AppText>
        <View style={styles.actions}>
          <Button title="Keep review" variant="secondary" onPress={onCancel} disabled={loading} />
          <Button title="Delete review" variant="danger" loading={loading} onPress={() => void onConfirm()} />
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: tokens.spacing.lg,
  },
  actions: {
    gap: tokens.spacing.sm,
  },
});
