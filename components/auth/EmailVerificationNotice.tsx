import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { resendVerificationEmail } from '@/src/api/AuthApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

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

/**
 * How often to re-check while the notice is on screen.
 *
 * Only ever runs for an UNVERIFIED user with this banner mounted, so the ceiling
 * is one lightweight profile read every 15s for the short window between
 * signing up and confirming — and it stops the moment the flag flips, because
 * the component unmounts itself.
 */
const VERIFICATION_POLL_MS = 15_000;

export function EmailVerificationNotice({
  userId,
  email,
  emailVerified,
  context = 'profile',
}: EmailVerificationNoticeProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const { validateToken } = useAuth();
  const [sending, setSending] = useState(false);

  /**
   * The banner checks its own premise.
   *
   * `isEmailVerified` comes from the cached auth profile, which is read with a
   * stale time — so a user who confirmed their email in a browser came back to
   * a mobile app still insisting they had not, with no way to correct it from
   * inside the app. Verification happens OUTSIDE this process by definition
   * (a link, in a mail client, possibly on another device), so the app cannot
   * treat its cached copy as authoritative while it is claiming someone is
   * unverified.
   *
   * Three triggers, all forcing past the cache: on mount, whenever the app
   * returns to the foreground (the overwhelmingly common path — leave, tap the
   * link, come back), and on a slow poll for the other-device case. No manual
   * "check status" button, because the user should never have to tell the app
   * to notice something it can see for itself.
   */
  const refreshingRef = useRef(false);
  const shouldWatch = Boolean(userId) && emailVerified === false;

  useEffect(() => {
    if (!shouldWatch) return;

    const refresh = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      void validateToken({ forceRefresh: true })
        .catch(() => false)
        .finally(() => {
          refreshingRef.current = false;
        });
    };

    refresh();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    const interval = setInterval(refresh, VERIFICATION_POLL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [shouldWatch, validateToken]);

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

  if (!userId || emailVerified !== false) {
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
          Open the verification link sent to {maskEmail(email)} — this notice
          clears itself the moment you do. Resend it if the first message did
          not arrive.
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
});

export default EmailVerificationNotice;
