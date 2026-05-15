import React, { useCallback } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { tokens } from '@/src/styles/tokens';

type AppQrSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  qrValue?: string | null;
  displayUrl?: string | null;
  shareMessage?: string;
  onClose: () => void;
};

export function AppQrSheet({
  visible,
  title,
  subtitle,
  qrValue,
  displayUrl,
  shareMessage,
  onClose,
}: AppQrSheetProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const value = qrValue?.trim() || '';
  const readableUrl = displayUrl?.trim() || value;

  const handleCopy = useCallback(async () => {
    if (!readableUrl) {
      toast.error('QR link is not available yet.');
      return;
    }

    await Clipboard.setStringAsync(readableUrl);
    toast.success('Link copied.');
  }, [readableUrl, toast]);

  const handleShare = useCallback(async () => {
    if (!readableUrl) {
      toast.error('QR link is not available yet.');
      return;
    }

    await Share.share({
      message: shareMessage || readableUrl,
      url: readableUrl,
    });
  }, [readableUrl, shareMessage, toast]);

  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      showCloseButton
    >
      {value ? (
        <View style={styles.content}>
          <View
            style={[
              styles.qrFrame,
              {
                backgroundColor: tokens.themes.light.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <QRCode
              value={value}
              size={220}
              color={tokens.themes.light.colors.text}
              backgroundColor={tokens.themes.light.colors.surface}
              quietZone={10}
            />
          </View>

          <View
            style={[
              styles.urlBox,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText variant="captionBold" tone="muted">
              Public link
            </AppText>
            <AppText variant="captionRegular" numberOfLines={3}>
              {readableUrl}
            </AppText>
          </View>

          <View style={styles.actions}>
            <Button title="Copy link" variant="secondary" size="sm" onPress={handleCopy} style={styles.actionButton} />
            <Button title="Share link" variant="primary" size="sm" onPress={handleShare} style={styles.actionButton} />
          </View>
        </View>
      ) : (
        <View style={[styles.emptyState, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <AppText variant="subtitle">QR code unavailable</AppText>
          <AppText variant="body" tone="muted">
            This brand profile link has not loaded yet. Pull to refresh and try again.
          </AppText>
        </View>
      )}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: tokens.spacing.lg,
  },
  qrFrame: {
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.elevation.sm,
  },
  urlBox: {
    width: '100%',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  emptyState: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
});

export default AppQrSheet;
