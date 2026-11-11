import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { WiezLiquidGlass } from '@/components/ui/WiezLiquidGlass';
import { SubscriptionApi, type UpgradeNotice } from '@/src/api/SubscriptionApi';
import { useAuth } from '@/src/auth/AuthContext';
import { getActiveBrandId, isBrandOwner } from '@/src/auth/brandAccess';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { drillDownPush } from '@/src/utils/mobileNavigation';

const CLOSE_GLASS_SIZE = { width: 32, height: 32 } as const;

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

  if (!current) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(current)}
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Dismiss background"
        />

        <View
          style={[
            styles.cardContainer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.glassBorder,
              ...tokens.elevation.lg,
            },
          ]}
        >
          {/* Subtle brand glow gradient at the top */}
          <LinearGradient
            colors={[...theme.colors.lightRayGradient]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.gradientHeader}
          />

          <View style={styles.topBar}>
            <View style={styles.badgePill}>
              <AppText variant="captionBold" tone="primary" style={styles.badgeText}>
                ✨ STUDIO UPGRADE
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close subscription notice"
              onPress={close}
              style={styles.closeButton}
              hitSlop={8}
            >
              <WiezLiquidGlass
                mode="lightweight"
                intensity="regular"
                borderRadius={16}
                initialSize={CLOSE_GLASS_SIZE}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
              <AppText variant="captionBold" tone="muted">
                ✕
              </AppText>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.primarySoft }]}>
              <AppText style={styles.iconEmoji}>💎</AppText>
            </View>

            <AppText variant="h2" style={styles.titleText}>
              {current.title}
            </AppText>

            <AppText variant="body" tone="muted" style={styles.messageText}>
              {current.message}
            </AppText>

            <View style={styles.actionGroup}>
              <Button
                title="View Subscription Plans"
                onPress={() => {
                  close();
                  drillDownPush('/settings/subscriptions' as never);
                }}
                fullWidth
              />
              <Button
                title="Maybe later"
                variant="outline"
                onPress={close}
                fullWidth
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.lg,
    backgroundColor: tokens.scrim(0.72),
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  gradientHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingTop: tokens.spacing.lg,
    zIndex: 2,
  },
  badgePill: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
  },
  badgeText: {
    letterSpacing: 1,
    
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    maxHeight: 520,
  },
  content: {
    paddingHorizontal: tokens.spacing.xl,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.spacing.xs,
  },
  iconEmoji: {
    fontSize: 32,
  },
  titleText: {
    textAlign: 'center',
    lineHeight: 28,
  },
  messageText: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: tokens.spacing.sm,
  },
  actionGroup: {
    width: '100%',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
  },
});
