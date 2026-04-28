import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';

type Props = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AppConfirmDialog({
  visible,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  confirmDisabled,
  children,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={description}
      onClose={loading ? () => undefined : onCancel}
      scrollable={false}
    >
      {children ? <View style={styles.content}>{children}</View> : null}
      <View style={styles.actions}>
        <Button title={cancelLabel} variant="outline" size="md" onPress={onCancel} disabled={loading} />
        <Button
          title={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          size="md"
          onPress={onConfirm}
          loading={loading}
          disabled={confirmDisabled || loading}
        />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: tokens.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
});

export default AppConfirmDialog;
