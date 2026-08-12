import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import {
  changePassword,
  listSecuritySessions,
  logoutOtherSecuritySessions,
  requestEmailChange,
  revokeSecuritySession,
  type SecuritySession,
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

const passwordChecks = (password: string) => ({
  length: password.length >= 12,
  uppercase: /[A-Z]/.test(password),
  number: /\d/.test(password),
  special: /[^A-Za-z0-9]/.test(password),
});

function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeSessionDevice(userAgent: string | null) {
  const normalized = String(userAgent ?? '').toLowerCase();
  if (!normalized) return 'Unknown device';

  const browser = normalized.includes('okhttp/')
    ? 'Android app'
    : normalized.includes('chrome/')
      ? 'Chrome'
      : normalized.includes('edg/')
        ? 'Edge'
        : normalized.includes('safari/') && !normalized.includes('chrome/')
          ? 'Safari'
          : normalized.includes('firefox/')
            ? 'Firefox'
            : 'Device';

  const os = normalized.includes('android') || normalized.includes('okhttp/')
    ? 'Android'
    : normalized.includes('iphone') || normalized.includes('ipad')
      ? 'iOS'
      : normalized.includes('windows')
        ? 'Windows'
        : normalized.includes('mac os') || normalized.includes('macintosh')
          ? 'macOS'
          : normalized.includes('linux')
            ? 'Linux'
            : '';

  return os ? `${browser} on ${os}` : browser;
}

function extractErrorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  const candidates = [data?.message, data?.data?.message, data?.error, (error as any)?.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function SessionRow({
  session,
  busy,
  onRevoke,
}: {
  session: SecuritySession;
  busy: boolean;
  onRevoke: (sessionId: string) => void;
}) {
  const { theme } = useTheme();

  return (
    // Device, time, status — one line each, no card. A session is a list entry;
    // the three-line, bordered, IP-carrying block it used to be gave every row
    // the visual weight of a section and told the user nothing they could act
    // on. Masked IP and location are dropped: neither survives a `numberOfLines`
    // budget, and neither helps anyone decide whether to revoke.
    <View style={[styles.sessionCard, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.sessionCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {describeSessionDevice(session.userAgent)}
        </AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {formatDateTime(session.lastUsedAt)}
        </AppText>
      </View>
      {session.isCurrentSession ? (
        <AppText variant="captionBold" tone="primary">
          Current
        </AppText>
      ) : (
        <Button
          title={busy ? 'Revoking...' : 'Revoke'}
          size="xs"
          variant="outline"
          loading={busy}
          disabled={busy}
          onPress={() => onRevoke(session.id)}
        />
      )}
    </View>
  );
}

export default function AccountSecuritySettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, user, validateToken } = useAuth();
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

  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [logoutOthersBusy, setLogoutOthersBusy] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [confirmNewEmail, setConfirmNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailPending, setEmailPending] = useState<string | null>(null);

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

  const loadSessions = useCallback(async () => {
    if (status !== 'authenticated') {
      setSessions([]);
      setSessionsLoading(false);
      return;
    }

    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const nextSessions = await listSecuritySessions();
      setSessions(Array.isArray(nextSessions) ? nextSessions : []);
    } catch (error) {
      setSessionsError(extractErrorMessage(error, 'Unable to load login sessions.'));
    } finally {
      setSessionsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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

  const revokeSession = useCallback(
    (sessionId: string) => {
      setSessionBusyId(sessionId);
      void revokeSecuritySession(sessionId)
        .then(() => {
          setSessions((current) => current.filter((session) => session.id !== sessionId));
          toast.success('Session revoked.');
        })
        .catch((error) => {
          toast.error(extractErrorMessage(error, 'Unable to revoke that session.'));
        })
        .finally(() => setSessionBusyId(null));
    },
    [toast],
  );

  const confirmLogoutOthers = useCallback(() => {
    Alert.alert(
      'Sign out other sessions?',
      'This keeps your current session active and revokes other active login sessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out others',
          style: 'destructive',
          onPress: () => {
            setLogoutOthersBusy(true);
            void logoutOtherSecuritySessions()
              .then((result) => {
                toast.success(`${result.revokedCount ?? 0} session${result.revokedCount === 1 ? '' : 's'} revoked.`);
                void loadSessions();
              })
              .catch((error) => {
                toast.error(extractErrorMessage(error, 'Unable to revoke other sessions.'));
              })
              .finally(() => setLogoutOthersBusy(false));
          },
        },
      ],
    );
  }, [loadSessions, toast]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title={screenTitle} subtitle={screenSubtitle} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.primary} />
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
          <SettingsPanel divided={false}>
            <View style={styles.inlineHeader}>
              <AppText variant="captionRegular" tone="muted" style={styles.inlineCopy}>
                Revoke anything you do not recognise.
              </AppText>
              <Button
                title={logoutOthersBusy ? 'Signing out...' : 'Sign out others'}
                size="sm"
                variant="outline"
                loading={logoutOthersBusy}
                disabled={logoutOthersBusy}
                onPress={confirmLogoutOthers}
              />
            </View>
          </SettingsPanel>
          {sessionsLoading ? (
            <SettingsStateCard title="Loading sessions" loading />
          ) : sessionsError ? (
            <SettingsStateCard
              title="Could not load sessions"
              body={sessionsError}
              actionTitle="Retry"
              onAction={() => void loadSessions()}
            />
          ) : sessions.length === 0 ? (
            <SettingsStateCard title="No sessions found" body="Your current login session will appear here after the backend records it." />
          ) : (
            <View style={styles.sessionStack}>
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  busy={sessionBusyId === session.id}
                  onRevoke={revokeSession}
                />
              ))}
            </View>
          )}
        </SettingsSection>
        ) : null}

        {showSessions ? (
        <SettingsSection title="Two-factor authentication">
          <SettingsPanel>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineCopy}>
                <AppText variant="bodyBold">2FA is not available yet</AppText>
                <AppText variant="captionRegular" tone="muted">
                  The backend does not expose QR-code, recovery-code, or passkey setup endpoints in this workspace yet.
                </AppText>
              </View>
              <View style={[styles.statusPill, { backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="captionBold" tone="muted">
                  Disabled
                </AppText>
              </View>
            </View>
          </SettingsPanel>
        </SettingsSection>
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
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
});
