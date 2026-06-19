import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { resendVerificationEmail } from '@/src/api/AuthApi';
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

export function EmailVerificationNotice({
  userId,
  email,
  emailVerified,
  context = 'profile',
}: EmailVerificationNoticeProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const [sending, setSending] = useState(false);

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
