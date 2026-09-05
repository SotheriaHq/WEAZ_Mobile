import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { verifyEmail } from '@/src/api/AuthApi';
import { useAuth } from '@/src/auth/AuthContext';
import { isBrandAccount } from '@/src/auth/brandAccess';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import WiezOrb from '@/src/brand/WiezOrb';
import { MuseLoader } from '@/components/ui/MuseLoader';

type VerifyEmailState = 'verifying' | 'success' | 'error';

const SUCCESS_REDIRECT_DELAY_MS = 1_200;

const firstParamValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const getVerifyEmailErrorMessage = (error: unknown): string => {
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

  return 'Unable to verify email. The link may be invalid or expired.';
};

export default function VerifyEmailScreen() {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { isAuthenticated, updateUser, user, validateToken } = useAuth();
  const verificationStartedRef = useRef(false);

  const token = useMemo(() => firstParamValue(params.token).trim(), [params.token]);

  const [state, setState] = useState<VerifyEmailState>('verifying');
  const [message, setMessage] = useState('Verifying your email address...');

  const bgGradient = isDark
    ? tokens.auth.screenGradientDark
    : tokens.auth.screenGradientLight;

  const accentGradient = isDark
    ? tokens.auth.cardGradientDark
    : tokens.auth.cardGradientLight;

  const goToLogin = () => {
    router.replace('/login' as any);
  };

  /**
   * Where a verified account belongs.
   *
   * `isBrandAccount` and not `hasActiveBrandMembership`: this screen is reached
   * moments after signup, when a brand has no store yet, and the capability
   * predicate is false for exactly that window. Using it sent a brand that had
   * just verified its email to the shopper profile.
   */
  const destinationAfterVerification = useMemo(
    () =>
      (!isAuthenticated
        ? '/login'
        : isBrandAccount(user)
          ? '/catalog'
          : '/(tabs)/me') as Href,
    [isAuthenticated, user],
  );

  useEffect(() => {
    if (!token) {
      verificationStartedRef.current = false;
      setState('error');
      setMessage('This verification link is missing a valid token. Request a new verification email before trying again.');
      return;
    }

    if (verificationStartedRef.current) return;
    verificationStartedRef.current = true;

    const verifyToken = async () => {
      setState('verifying');
      setMessage('Verifying your email address...');

      try {
        const response = await verifyEmail(token);
        if (isAuthenticated) {
          updateUser({ isEmailVerified: true });
          await validateToken({ forceRefresh: true }).catch(() => false);
        }
        setState('success');
        setMessage(response.message || 'Your email has been verified.');
        toast.success('Email verified.');
      } catch (error) {
        setState('error');
        setMessage(getVerifyEmailErrorMessage(error));
      }
    };

    void verifyToken();
  }, [isAuthenticated, token, toast, validateToken]);

  const renderMissingToken = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.stateBlock}>
        <AppText variant="title">Invalid verification link</AppText>
        <AppText variant="body" tone="muted">
          This email verification link is missing a valid token. Request a fresh link before continuing.
        </AppText>
        <Button
          title="Back to login"
          onPress={goToLogin}
          size="lg"
          fullWidth
          style={styles.primaryButton}
          textStyle={styles.primaryButtonText}
          testID="verify-email-login"
        />
      </View>
    </View>
  );

  const renderVerifying = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.stateBlock}>
        <MuseLoader size={20} />
        <AppText variant="title">Verifying email</AppText>
        <AppText variant="body" tone="muted">
          Keep this screen open while WIEZ confirms your email address.
        </AppText>
      </View>
    </View>
  );

  /**
   * Verification is the last step, not a checkpoint.
   *
   * The screen used to end on a "Go to profile" button, which asks the person
   * to confirm something they already confirmed by tapping the link in their
   * email. There is no decision to make here and no other destination, so the
   * app takes them there itself.
   *
   * The short pause is deliberate: the confirmation has to be readable, or the
   * screen flashes and the user cannot tell whether it worked.
   */
  useEffect(() => {
    if (state !== 'success') return;
    const timer = setTimeout(() => {
      router.replace(destinationAfterVerification);
    }, SUCCESS_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, destinationAfterVerification]);

  const renderSuccess = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.stateBlock}>
        <AppText variant="title">Email verified</AppText>
        <AppText variant="body" tone="muted">
          {message}
        </AppText>
        <View style={styles.successHandoff}>
          <MuseLoader size={20} />
          <AppText variant="caption" tone="muted">
            Taking you to your profile…
          </AppText>
        </View>
      </View>
    </View>
  );

  const renderError = () => (
    <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.stateBlock}>
        <AppText variant="title">Verification unavailable</AppText>
        <View
          style={[
            styles.errorBox,
            { borderColor: theme.colors.danger, backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <AppText variant="caption" tone="danger">
            {message}
          </AppText>
        </View>
        <Button
          title="Back to login"
          onPress={goToLogin}
          size="lg"
          fullWidth
          style={styles.primaryButton}
          textStyle={styles.primaryButtonText}
          testID="verify-email-login"
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <LinearGradient
        colors={bgGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={accentGradient}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAwareFormScroll
        bottomOffset={tokens.spacing['2xl']}
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
            <WiezOrb size={36} />
          </Pressable>
        </View>

        <View style={styles.spacer} />

        <View style={styles.headlineBlock}>
          <AppText variant="captionBold" tone="primary" style={styles.kicker}>
            EMAIL VERIFICATION
          </AppText>
          <AppText variant="display">Confirm your email</AppText>
          <AppText variant="body" muted style={styles.subtitle}>
            Use the secure link from your email to finish verifying your WIEZ account.
          </AppText>
        </View>

        <View style={styles.formPanel}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />
          <View style={[styles.formPanelBorder, { borderColor: theme.colors.border }]} />
          <View style={styles.gradientAccentLine} />
          {!token
            ? renderMissingToken()
            : state === 'success'
              ? renderSuccess()
              : state === 'error'
                ? renderError()
                : renderVerifying()}
        </View>
      </KeyboardAwareFormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  successHandoff: {
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
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
    marginBottom: 8,
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
    shadowColor: tokens.colors.shadow,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  formPanelBorder: {
    ...StyleSheet.absoluteFill,
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
    backgroundColor: tokens.auth.gold,
    opacity: 0.7,
    zIndex: 2,
  },
  formInner: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  stateBlock: {
    gap: tokens.spacing.lg,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  primaryButton: {
    marginTop: tokens.spacing.xl,
    shadowColor: tokens.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonText: {
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
});
