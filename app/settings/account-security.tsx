import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

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
    <Card padding="md" style={styles.sessionCard}>
      <View style={styles.sessionRow}>
        <View style={styles.sessionCopy}>
          <View style={styles.sessionTitleRow}>
            <AppText variant="bodyBold" numberOfLines={1}>
              {describeSessionDevice(session.userAgent)}
            </AppText>
            {session.isCurrentSession ? (
              <View style={[styles.currentPill, { backgroundColor: theme.colors.primarySoft }]}>
                <AppText variant="captionBold" tone="primary">
                  Current
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {session.ipAddressMasked ?? 'IP unavailable'}
            {session.location ? ` / ${session.location}` : ''}
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            Last used {formatDateTime(session.lastUsedAt)}
          </AppText>
        </View>
        {!session.isCurrentSession ? (
          <Button
            title={busy ? 'Revoking...' : 'Revoke'}
            size="sm"
            variant="outline"
            loading={busy}
            disabled={busy}
            onPress={() => onRevoke(session.id)}
          />
        ) : null}
      </View>
    </Card>
  );
}

export default function AccountSecuritySettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, user, validateToken } = useAuth();
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
        <SettingsHeader title="Account security" subtitle="Email, password, and sessions" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <SettingsHeader title="Account security" subtitle="Sign in required" />
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
      <SettingsHeader title="Account security" subtitle="Email, password, and sessions" />

      <KeyboardAwareFormScroll
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}
      >
        <SettingsSection title="Email">
          <Card padding="lg" style={styles.card}>
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
          </Card>
        </SettingsSection>

        <SettingsSection title="Password">
          <Card padding="lg" style={styles.card}>
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
          </Card>
        </SettingsSection>

        <SettingsSection title="Login sessions">
          <Card padding="lg" style={styles.card}>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineCopy}>
                <AppText variant="bodyBold">Active and recent sessions</AppText>
                <AppText variant="captionRegular" tone="muted">
                  Revoke sessions you do not recognize.
                </AppText>
              </View>
              <Button
                title={logoutOthersBusy ? 'Signing out...' : 'Sign out others'}
                size="sm"
                variant="outline"
                loading={logoutOthersBusy}
                disabled={logoutOthersBusy}
                onPress={confirmLogoutOthers}
              />
            </View>
          </Card>
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

        <SettingsSection title="Two-factor authentication">
          <Card padding="lg" style={styles.card}>
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
          </Card>
        </SettingsSection>
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
    gap: tokens.spacing.xs,
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
    gap: tokens.spacing.sm,
  },
  sessionCard: {
    gap: tokens.spacing.sm,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  currentPill: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
});
