import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmPasswordReset } from '@/src/api/AuthApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { tokens } from '@/src/styles/tokens';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { FloatingLabelInput } from '@/components/auth/FloatingLabelInput';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';

const PASSWORD_MIN_LENGTH = 12;

const firstParamValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const getPasswordResetErrorMessage = (error: unknown): string => {
  const responseData = (error as any)?.response?.data;
  const candidates = [
    responseData?.message,
    responseData?.data?.message,
    responseData?.error,
    (error as any)?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return 'Unable to reset password. The link may be invalid or expired.';
};

export default function ResetPasswordScreen() {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string | string[] }>();

  const token = useMemo(() => firstParamValue(params.token).trim(), [params.token]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordIsLongEnough = newPassword.length >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = Boolean(token) && passwordIsLongEnough && passwordsMatch && !submitting;

  const bgGradient = isDark
    ? (['#0f0a14', '#1a0a2e', '#0f0a14'] as const)
    : (['#f7f6f8', '#ede8f5', '#f0ecfa'] as const);

  const accentGradient = isDark
    ? (['#2B1742', '#1E293B', '#0F172A'] as const)
    : (['#EDE9FE', '#FEF3C7', '#F8FAFC'] as const);

  const clearErrors = () => {
    setNewPasswordError('');
    setConfirmPasswordError('');
    setSubmitError('');
  };

  const goToLogin = () => {
    router.replace('/login' as any);
  };

  const goToForgotPassword = () => {
    router.replace('/forgot-password' as any);
  };

  const onSubmit = async () => {
    clearErrors();

    if (!token) {
      setSubmitError('This reset link is missing a valid token. Request a new link to continue.');
      return;
    }

    if (!passwordIsLongEnough) {
      setNewPasswordError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    if (!passwordsMatch) {
      setConfirmPasswordError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated. Sign in with your new password.');
    } catch (error) {
      setSubmitError(getPasswordResetErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const renderMissingToken = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.stateBlock}>
        <AppText variant="title">Invalid reset link</AppText>
        <AppText variant="body" tone="muted">
          This reset link is missing a valid token. Request a new secure link before choosing a new password.
        </AppText>
        <Button
          title="Request new link"
          onPress={goToForgotPassword}
          size="lg"
          fullWidth
          style={styles.primaryButton}
          textStyle={styles.primaryButtonText}
          testID="reset-password-request-new-link"
        />
        <Button
          title="Back to login"
          variant="ghost"
          size="xs"
          onPress={goToLogin}
          style={styles.secondaryButton}
        />
      </View>
    </View>
  );

  const renderSuccess = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.stateBlock}>
        <AppText variant="title">Password updated</AppText>
        <AppText variant="body" tone="muted">
          Your password has been reset. Sign in again with the new password to continue.
        </AppText>
        <Button
          title="Go to login"
          onPress={goToLogin}
          size="lg"
          fullWidth
          style={styles.primaryButton}
          textStyle={styles.primaryButtonText}
          testID="reset-password-login"
        />
      </View>
    </View>
  );

  const renderForm = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.fieldsContainer}>
        <FloatingLabelInput
          label="New password"
          value={newPassword}
          onChangeText={(value) => {
            setNewPassword(value);
            clearErrors();
          }}
          isPassword
          error={newPasswordError}
          testID="reset-password-new-password-input"
        />
        <FloatingLabelInput
          label="Confirm password"
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            clearErrors();
          }}
          isPassword
          error={confirmPasswordError}
          testID="reset-password-confirm-password-input"
        />
      </View>

      <View style={styles.policyBlock}>
        <AppText
          variant="caption"
          tone={passwordIsLongEnough ? 'success' : 'muted'}
        >
          At least {PASSWORD_MIN_LENGTH} characters.
        </AppText>
        {confirmPassword.length > 0 ? (
          <AppText
            variant="caption"
            tone={passwordsMatch ? 'success' : 'danger'}
          >
            {passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}
          </AppText>
        ) : null}
      </View>

      {submitError ? (
        <View
          style={[
            styles.errorBox,
            { borderColor: theme.colors.danger, backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <AppText variant="caption" tone="danger">
            {submitError}
          </AppText>
        </View>
      ) : null}

      <Button
        title="Reset password"
        onPress={onSubmit}
        loading={submitting}
        disabled={!canSubmit}
        size="lg"
        fullWidth
        style={styles.primaryButton}
        textStyle={styles.primaryButtonText}
        testID="reset-password-submit"
      />

      <Button
        title="Back to login"
        variant="ghost"
        size="xs"
        onPress={goToLogin}
        style={styles.secondaryButton}
      />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <LinearGradient
        colors={bgGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={accentGradient}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAwareScrollView
        enableOnAndroid
        keyboardOpeningTime={0}
        enableAutomaticScroll
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 },
        ]}
      >
        <View style={styles.logoRow}>
          <Pressable
            onPress={goToLogin}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Back to login"
          >
            <ThreadlyLogo size={36} />
          </Pressable>
        </View>

        <View style={styles.spacer} />

        <View style={styles.headlineBlock}>
          <AppText variant="captionBold" tone="primary" style={styles.kicker}>
            PASSWORD RESET
          </AppText>
          <AppText variant="display">Choose a new password</AppText>
          <AppText variant="body" muted style={styles.subtitle}>
            Use the secure link from your email to finish resetting your Threadly account.
          </AppText>
        </View>

        <View style={styles.formPanel}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />
          <View style={[styles.formPanelBorder, { borderColor: theme.colors.border }]} />
          <View style={styles.gradientAccentLine} />
          {!token ? renderMissingToken() : success ? renderSuccess() : renderForm()}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'flex-end',
  },
  logoRow: {
    alignSelf: 'flex-start',
  },
  spacer: {
    minHeight: 120,
  },
  headlineBlock: {
    marginBottom: 20,
  },
  kicker: {
    marginBottom: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  subtitle: {
    marginTop: 8,
  },
  formPanel: {
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  formPanelBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
  },
  gradientAccentLine: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: '#D4AF37',
    opacity: 0.7,
    zIndex: 2,
  },
  formInner: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  fieldsContainer: {
    gap: tokens.spacing.md,
  },
  policyBlock: {
    marginTop: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  errorBox: {
    marginTop: tokens.spacing.lg,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  stateBlock: {
    gap: tokens.spacing.lg,
  },
  primaryButton: {
    marginTop: tokens.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonText: {
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    marginTop: tokens.spacing.sm,
    paddingHorizontal: 4,
  },
});
