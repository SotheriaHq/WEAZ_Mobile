import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { resendVerificationEmail } from '@/src/api/AuthApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'threadly.email-verification-notice.dismissed-at.v1';

function getDismissalStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function maskEmail(email?: string | null) {
  const value = String(email ?? '').trim();
  if (!value || !value.includes('@')) return 'your inbox';
  const [local, domain] = value.split('@');
  const domainName = domain?.split('.')[0] ?? '';
  const domainSuffix = domain?.split('.').slice(1).join('.') ?? '';
  const maskedLocal =
    local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}***`;
  const maskedDomain =
    domainName.length <= 2
      ? `${domainName.slice(0, 1)}*`
      : `${domainName.slice(0, 2)}***`;

  return `${maskedLocal}@${maskedDomain}${domainSuffix ? `.${domainSuffix}` : ''}`;
}

type EmailVerificationNoticeProps = {
  userId?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  context?: 'profile' | 'catalog';
};

export function EmailVerificationNotice({
  userId,
  email,
  emailVerified,
  context = 'profile',
}: EmailVerificationNoticeProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const storageKey = useMemo(
    () => (userId ? getDismissalStorageKey(userId) : null),
    [userId],
  );

  useEffect(() => {
    let mounted = true;

    const loadDismissal = async () => {
      if (!storageKey || emailVerified === true) {
        if (storageKey && emailVerified === true) {
          void AsyncStorage.removeItem(storageKey);
        }
        if (mounted) {
          setDismissed(true);
          setLoading(false);
        }
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const dismissedAt = Number(raw ?? 0);
        const stillDismissed =
          Number.isFinite(dismissedAt) &&
          dismissedAt > 0 &&
          Date.now() - dismissedAt < DISMISS_TTL_MS;
        if (mounted) {
          setDismissed(stillDismissed);
        }
      } catch {
        if (mounted) {
          setDismissed(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadDismissal();

    return () => {
      mounted = false;
    };
  }, [emailVerified, storageKey]);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    if (!storageKey) return;
    try {
      await AsyncStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // Local dismissal must not block the profile or catalog surface.
    }
  }, [storageKey]);

  const handleResend = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      const response = await resendVerificationEmail();
      toast.success(
        response.message ||
          'Verification email sent. Check your inbox and spam folder.',
      );
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.data?.message ||
        'Unable to resend verification email right now.';
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [sending, toast]);

  if (!userId || emailVerified !== false || dismissed || loading) {
    return null;
  }

  const title =
    context === 'catalog'
      ? 'Verify email to publish and create'
      : 'Verify your email';

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.warning,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="Email verification required"
    >
      <View style={styles.copy}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="captionRegular" tone="muted" style={styles.body}>
          Open the verification link sent to {maskEmail(email)}. Resend it if
          the first message did not arrive.
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button
          title={sending ? 'Sending...' : 'Resend email'}
          size="sm"
          onPress={handleResend}
          loading={sending}
          disabled={sending}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleDismiss}
          style={({ pressed }) => [styles.dismiss, pressed ? styles.pressed : null]}
        >
          <AppText variant="captionBold" tone="muted">
            Dismiss
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  copy: {
    gap: tokens.spacing.xs,
  },
  body: {
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  dismiss: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  pressed: {
    opacity: 0.72,
  },
});

export default EmailVerificationNotice;
