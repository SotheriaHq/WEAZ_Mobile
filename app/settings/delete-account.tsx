import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { deleteAccount } from '@/src/api/AuthApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

export default function DeleteAccountScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const { signOut } = useAuth();
  const [confirmationWord, setConfirmationWord] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    confirmationWord.trim().toUpperCase() === 'DELETE' &&
    currentPassword.length >= 8 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) {
      toast.error('Type DELETE and enter your current password.');
      return;
    }

    setSubmitting(true);
    try {
      await deleteAccount({
        confirmationWord,
        currentPassword,
      });
      await signOut();
      toast.success('Your account deletion request was completed.');
      router.replace('/(auth)/login' as never);
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

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <AppText variant="subtitle" tone="danger">This cannot be undone</AppText>
            <AppText variant="body" tone="muted">
              Deleting your account removes access to your profile, sessions, store tools, and user-controlled content. Some order, payment, security, dispute, and legal records may be retained where required.
            </AppText>
            <Button
              title="View account deletion policy"
              variant="secondary"
              onPress={() => router.push('/legal/account-deletion' as never)}
            />
          </Card>

          <Card style={styles.card}>
            <Input
              label="Type DELETE"
              value={confirmationWord}
              onChangeText={setConfirmationWord}
              autoCapitalize="characters"
              autoCorrect={false}
              helperText="This confirmation prevents accidental deletion."
            />
            <Input
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              helperText="Required by the current backend deletion flow."
            />
            <Button
              title={submitting ? 'Deleting...' : 'Delete account'}
              variant="danger"
              loading={submitting}
              disabled={!canSubmit}
              onPress={() => {
                void submit();
              }}
            />
          </Card>
        </ScrollView>
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
});
