import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { deleteAccount } from '@/src/api/AuthApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const WARNING_POINTS = [
  'Your profile, saved items, fittings, patches, and preferences will no longer be accessible.',
  'You will be signed out of every device and session immediately.',
  'Your email address and username are released from your identity and cannot be used to sign back in.',
  'Order, payment, dispute, security, and legal records are retained where the law requires — they are no longer linked to a usable account.',
  'Any orders still in progress will continue to completion; you will lose access to track or dispute them.',
];

export default function DeleteAccountScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const { signOut, user } = useAuth();
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 3 && currentPassword.length >= 8 && !submitting;

  const submit = async () => {
    if (!canSubmit) {
      toast.error('Enter your account email and current password.');
      return;
    }

    // Fast local pre-check; the backend re-verifies against the authenticated
    // account only and never looks up other users by this email.
    const accountEmail = (user?.email ?? '').trim().toLowerCase();
    if (accountEmail && email.trim().toLowerCase() !== accountEmail) {
      toast.error('The email you entered does not match this account.');
      return;
    }

    setSubmitting(true);
    try {
      await deleteAccount({
        email: email.trim(),
        currentPassword,
      });
      await signOut();
      toast.success('Your account has been deleted.');
      // Browse-first: the account is gone — land on the guest Runway, not auth.
      router.replace('/(tabs)' as never);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (error as { message?: string })?.message ||
        'Unable to delete account.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Delete account' }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <AppBackButton fallbackHref="/settings" />
          <View style={styles.headerCopy}>
            <AppText variant="title">Delete account</AppText>
            <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
              Permanent account removal
            </AppText>
          </View>
        </View>

        <KeyboardAwareFormScroll contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <AppText variant="subtitle" tone="danger">⚠️ This cannot be undone</AppText>
            <AppText variant="body" tone="muted">
              Deleting your account is permanent. Before you continue, make sure you understand what happens:
            </AppText>
            {WARNING_POINTS.map((point) => (
              <View key={point} style={styles.warningRow}>
                <AppText variant="small" tone="muted">•</AppText>
                <AppText variant="small" tone="muted" style={styles.warningCopy}>
                  {point}
                </AppText>
              </View>
            ))}
            <Button
              title="View account deletion policy"
              variant="secondary"
              onPress={() => drillDownPush('/legal/account-deletion' as never)}
            />
          </Card>

          {step === 'warning' ? (
            <Card style={styles.card}>
              <AppText variant="body" tone="muted">
                If you are sure, continue to the final confirmation step.
              </AppText>
              <Button
                title="I understand — continue"
                variant="danger"
                onPress={() => setStep('confirm')}
              />
              <Button
                title="Keep my account"
                variant="secondary"
                onPress={() => router.back()}
              />
            </Card>
          ) : (
            <Card style={styles.card}>
              <AppText variant="body" tone="muted">
                To confirm, enter the email address on this account and your current password.
              </AppText>
              <Input
                label="Account email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                helperText="Must match the email on this signed-in account."
              />
              <Input
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                helperText="Confirms it is really you making this request."
              />
              <Button
                title={submitting ? 'Deleting...' : 'Permanently delete my account'}
                variant="danger"
                loading={submitting}
                disabled={!canSubmit}
                onPress={() => {
                  void submit();
                }}
              />
              <Button
                title="Cancel"
                variant="secondary"
                disabled={submitting}
                onPress={() => {
                  setStep('warning');
                  setEmail('');
                  setCurrentPassword('');
                }}
              />
            </Card>
          )}
        </KeyboardAwareFormScroll>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    gap: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl2,
  },
  card: {
    gap: tokens.spacing.md,
  },
  warningRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  warningCopy: {
    flex: 1,
  },
});
