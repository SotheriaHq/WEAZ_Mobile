import { SecurityDevicesPanel } from '@/components/settings/SecurityDevicesPanel';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import {
  changePassword,
  confirmPhoneChange,
  requestEmailChange,
  requestPhoneChange,
} from '@/src/api/AuthApi';
import { useAuth } from '@/src/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import {
  SettingsHeader,
  SettingsPanel,
  SettingsSection,
  SettingsStateCard,
} from '@/components/settings/SettingsPrimitives';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { MuseLoader } from '@/components/ui/MuseLoader';

const passwordChecks = (password: string) => ({
  length: password.length >= 12,
  uppercase: /[A-Z]/.test(password),
  number: /\d/.test(password),
  special: /[^A-Za-z0-9]/.test(password),
});

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

export default function AccountSecuritySettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, user, validateToken, updateUser } = useAuth();
  /**
   * Which concern this screen was opened for.
   *
   * "Phone & email" and "Password & security" are different jobs, and both used
   * to land here showing the same four sections under the same heading —
   * identical destinations that made the two rows look like a bug. The screen
   * now shows only what the caller asked for and titles itself accordingly;
   * with no `focus` (deep link, back-stack) it still shows everything.
   */
  const { focus: focusParam } = useLocalSearchParams<{ focus?: string | string[] }>();
  const focus = Array.isArray(focusParam) ? focusParam[0] : focusParam;
  const showEmail = focus !== 'password';
  const showPassword = focus !== 'email';
  const showSessions = focus !== 'email';
  const screenTitle =
    focus === 'email'
      ? 'Phone & email'
      : focus === 'password'
        ? 'Password & security'
        : 'Account security';
  const screenSubtitle =
    focus === 'email'
      ? 'Login and contact details'
      : focus === 'password'
        ? 'Password and active sessions'
        : 'Email, password, and sessions';


  const [newEmail, setNewEmail] = useState('');
  const [confirmNewEmail, setConfirmNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailPending, setEmailPending] = useState<string | null>(null);

  // Phone change: request emails a 6-digit code, confirm applies it. Two-step,
  // so the screen tracks which step it is on rather than two separate forms.
  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const passwordPolicy = useMemo(() => passwordChecks(nextPassword), [nextPassword]);
  const passwordPolicyRows = useMemo<Array<[string, boolean]>>(
    () => [
      ['At least 12 characters', passwordPolicy.length],
      ['One uppercase letter', passwordPolicy.uppercase],
      ['One number', passwordPolicy.number],
      ['One special character', passwordPolicy.special],
    ],
    [passwordPolicy.length, passwordPolicy.number, passwordPolicy.special, passwordPolicy.uppercase],
  );
  const passwordReady =
    Object.values(passwordPolicy).every(Boolean) &&
    nextPassword === confirmPassword &&
    currentPassword.length > 0 &&
    !passwordBusy;

  const submitEmailChange = useCallback(async () => {
    const next = newEmail.trim().toLowerCase();
    const confirm = confirmNewEmail.trim().toLowerCase();
    if (!next || next !== confirm) {
      toast.error('Enter matching email addresses.');
      return;
    }
    if (!emailPassword) {
      toast.error('Enter your current password.');
      return;
    }

    setEmailBusy(true);
    try {
      const response = await requestEmailChange({
        newEmail: next,
        currentPassword: emailPassword,
      });
      setEmailPending(response.pendingEmail ?? next);
      setNewEmail('');
      setConfirmNewEmail('');
      setEmailPassword('');
      toast.success(response.message ?? 'Email change verification sent.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to request email change.'));
    } finally {
      setEmailBusy(false);
    }
  }, [confirmNewEmail, emailPassword, newEmail, toast]);

  const submitPhoneRequest = useCallback(async () => {
    const next = newPhone.trim();
    if (!next) {
      toast.error('Enter the new phone number.');
      return;
    }

    setPhoneBusy(true);
    try {
      const response = await requestPhoneChange(next);
      setPhoneCodeSent(true);
      setPhoneCode('');
      toast.success(response.message ?? 'We sent a 6-digit code to your email.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to start the phone change.'));
    } finally {
      setPhoneBusy(false);
    }
  }, [newPhone, toast]);

  const submitPhoneConfirm = useCallback(async () => {
    const code = phoneCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your email.');
      return;
    }

    setPhoneBusy(true);
    try {
      const response = await confirmPhoneChange(code);
      updateUser({ phoneNumber: response.phoneNumber ?? newPhone.trim() }, 'settings/account-security');
      setPhoneCodeSent(false);
      setNewPhone('');
      setPhoneCode('');
      toast.success(response.message ?? 'Phone number updated.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to confirm the phone change.'));
    } finally {
      setPhoneBusy(false);
    }
  }, [newPhone, phoneCode, toast, updateUser]);

  const submitPasswordChange = useCallback(async () => {
    if (!passwordReady) {
      toast.error('Complete the password requirements first.');
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await changePassword({
        currentPassword,
        newPassword: nextPassword,
      });
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      toast.success(response.message ?? 'Password changed.');
      await validateToken({ forceRefresh: true }).catch(() => false);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Unable to change password.'));
    } finally {
      setPasswordBusy(false);
    }
  }, [currentPassword, nextPassword, passwordReady, toast, validateToken]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title={screenTitle} subtitle={screenSubtitle} />
        <View style={styles.loadingWrap}>
          <MuseLoader size={20} />
        </View>
      </SafeAreaView>
    );
  }

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title={screenTitle} subtitle="Sign in required" />
        <View style={styles.content}>
          <SettingsStateCard
            title="Sign in required"
            body="Account security settings are available after sign in."
            actionTitle="Sign in"
            onAction={() => drillDownPush('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title={screenTitle} subtitle={screenSubtitle} />

      <KeyboardAwareFormScroll
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        {showEmail ? (
        <SettingsSection title="Email">
          <SettingsPanel>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineCopy}>
                <AppText variant="bodyBold">Current email</AppText>
                <AppText variant="captionRegular" tone="muted">
                  {user?.email ?? 'No email on file'}
                </AppText>
              </View>
              <View style={[styles.statusPill, { backgroundColor: theme.colors.primarySoft }]}>
                <AppText variant="captionBold" tone={user?.isEmailVerified ? 'primary' : 'warning'}>
                  {user?.isEmailVerified ? 'Verified' : 'Unverified'}
                </AppText>
              </View>
            </View>
            {emailPending ? (
              <View style={[styles.notice, { borderColor: theme.colors.warning, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="captionRegular" tone="muted">
                  Confirm the verification email sent to {emailPending}. The account email changes after confirmation.
                </AppText>
              </View>
            ) : null}
            <Input
              label="New email"
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="new@email.com"
            />
            <Input
              label="Confirm new email"
              value={confirmNewEmail}
              onChangeText={setConfirmNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="new@email.com"
            />
            <Input
              label="Current password"
              value={emailPassword}
              onChangeText={setEmailPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Required"
            />
            <Button
              title={emailBusy ? 'Sending...' : 'Request email change'}
              loading={emailBusy}
              disabled={emailBusy}
              onPress={() => void submitEmailChange()}
            />
          </SettingsPanel>
        </SettingsSection>
        ) : null}

        {/* Phone lives with email: both are "how we reach you", and this screen
            was reachable from a row labelled "Phone & email" that offered no
            way to change a phone at all. */}
        {showEmail ? (
        <SettingsSection title="Phone">
          <SettingsPanel>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineCopy}>
                <AppText variant="bodyBold">Current phone</AppText>
                <AppText variant="captionRegular" tone="muted">
                  {user?.phoneNumber ?? 'No phone number on file'}
                </AppText>
              </View>
            </View>

            {phoneCodeSent ? (
              <>
                <AppText variant="captionRegular" tone="muted">
                  We emailed a 6-digit code to {user?.email ?? 'your address'}. Enter
                  it to set {newPhone.trim()} as your number.
                </AppText>
                <Input
                  label="6-digit code"
                  value={phoneCode}
                  onChangeText={(value) => setPhoneCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="123456"
                  maxLength={6}
                />
                <Button
                  title={phoneBusy ? 'Confirming...' : 'Confirm new number'}
                  loading={phoneBusy}
                  disabled={phoneBusy || phoneCode.trim().length !== 6}
                  onPress={() => void submitPhoneConfirm()}
                />
                <Button
                  title="Use a different number"
                  variant="ghost"
                  size="sm"
                  disabled={phoneBusy}
                  onPress={() => {
                    setPhoneCodeSent(false);
                    setPhoneCode('');
                  }}
                />
              </>
            ) : (
              <>
                <Input
                  label="New phone number"
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="+234 800 000 0000"
                  helperText="We email a 6-digit code to confirm it is really you."
                />
                <Button
                  title={phoneBusy ? 'Sending...' : 'Send confirmation code'}
                  loading={phoneBusy}
                  disabled={phoneBusy || !newPhone.trim()}
                  onPress={() => void submitPhoneRequest()}
                />
              </>
            )}
          </SettingsPanel>
        </SettingsSection>
        ) : null}

        {showPassword ? (
        <SettingsSection title="Password">
          <SettingsPanel>
            <Input
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <Input
              label="New password"
              value={nextPassword}
              onChangeText={setNextPassword}
              secureTextEntry
              autoCapitalize="none"
              helperText="Use at least 12 characters with uppercase, number, and special character."
            />
            <View style={styles.policyList}>
              {passwordPolicyRows.map(([label, passed]) => (
                <AppText
                  key={String(label)}
                  variant="captionRegular"
                  tone={passed ? 'success' : 'muted'}
                >
                  {passed ? 'OK' : '--'} {label}
                </AppText>
              ))}
            </View>
            <Input
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <Button
              title={passwordBusy ? 'Changing...' : 'Change password'}
              loading={passwordBusy}
              disabled={!passwordReady}
              onPress={() => void submitPasswordChange()}
            />
          </SettingsPanel>
        </SettingsSection>
        ) : null}

        {showSessions ? (
        <SettingsSection title="Login sessions">
          <SecurityDevicesPanel key={user?.id} />
        </SettingsSection>
        ) : null}

        {showSessions ? (
        <MfaSettingsPanel key={user?.id} />
        ) : null}
      </KeyboardAwareFormScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.md,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  inlineCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusPill: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  notice: {
    borderWidth: 0,
    borderRadius: 0,
    padding: tokens.spacing.md,
  },
  policyList: {
    gap: tokens.spacing.xs,
  },
  sessionStack: {
    marginTop: tokens.spacing.xs,
  },
  sessionCard: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 2,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
});
import { MfaSettingsPanel } from '@/components/settings/MfaSettingsPanel';
