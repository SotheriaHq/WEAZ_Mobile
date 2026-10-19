import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SubscriptionApi, type UpgradeNotice } from '@/src/api/SubscriptionApi';
import { useAuth } from '@/src/auth/AuthContext';
import { getActiveBrandId, isBrandOwner } from '@/src/auth/brandAccess';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { drillDownPush } from '@/src/utils/mobileNavigation';

export function SubscriptionNotice() {
  const { user, status } = useAuth();
  const { theme } = useTheme();
  const pathname = usePathname();
  const brandId = getActiveBrandId(user);
  const owner = Boolean(brandId && isBrandOwner(user, brandId));
  const identity = `${user?.id || ''}:${brandId || ''}`;
  const [notice, setNotice] = useState<{
    identity: string;
    value: UpgradeNotice;
  } | null>(null);
  const request = useRef<{
    key: string;
    promise: ReturnType<typeof SubscriptionApi.claimNotice>;
  } | null>(null);
  const shown = useRef(new Map<string, number>());
  const studio = pathname.startsWith('/studio');
  const blocked =
    /\/(?:login|signup|verify|forgot-password|reset-password|legal|accept-invite|account-reactivation)(?:\/|$)/.test(
      pathname,
    );
  useEffect(() => {
    if (
      !owner ||
      blocked ||
      !brandId ||
      status !== 'authenticated' ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/checkout') ||
      pathname.includes('payment') ||
      pathname.includes('verify')
    )
      return;
    const key = `${identity}:${studio ? 'studio' : 'login'}`;
    if ((shown.current.get(key) ?? 0) > Date.now()) return;
    if (request.current?.key !== key)
      request.current = { key, promise: SubscriptionApi.claimNotice(brandId) };
    let active = true;
    void request.current.promise
      .then((result) => {
        if (request.current?.key === key) request.current = null;
        if (active) {
          shown.current.set(
            key,
            Date.now() + (result.notice ? 24 * 60 * 60_000 : 15_000),
          );
          if (result.notice) setNotice({ identity, value: result.notice });
        }
      })
      .catch(() => {
        if (request.current?.key === key) request.current = null;
      });
    return () => {
      active = false;
    };
  }, [owner, brandId, status, identity, studio, pathname, blocked]);
  const current =
    notice?.identity === identity && owner && !blocked ? notice.value : null;
  function close() {
    setNotice(null);
    if (brandId)
      void SubscriptionApi.dismissNotice(brandId).catch(() => undefined);
  }
  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(current)}
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <ScrollView
          style={{ maxHeight: '90%', backgroundColor: theme.colors.surface }}
          contentContainerStyle={styles.panel}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close subscription notice"
            onPress={close}
            style={styles.close}
          >
            <AppText variant="bodyBold">✕</AppText>
          </Pressable>
          <AppText variant="h2">🧵 {current?.title}</AppText>
          <AppText variant="body">{current?.message}</AppText>
          <Button
            title="Upgrade"
            onPress={() => {
              close();
              drillDownPush('/settings/subscriptions' as never);
            }}
          />
          <Button title="Maybe later" variant="secondary" onPress={close} />
        </ScrollView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    backgroundColor: tokens.colors.scrim,
  },
  panel: { padding: tokens.spacing.xl, gap: tokens.spacing.lg },
  close: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});
