import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingLabelInput } from '@/components/auth/FloatingLabelInput';
import { GoogleMark } from '@/components/auth/GoogleMark';
import { PrimaryAuthButton } from '@/components/auth/PrimaryAuthButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useGoogleIdTokenRequest } from '@/src/auth/useGoogleIdTokenRequest';
import {
  confirmEmailLoginCode,
  getLoginOptions,
  requestEmailLoginCode,
  setupPassword as setupAccountPassword,
  type LoginOptionsResponse,
} from '@/src/api/AuthApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const INVISIBLE_AUTH_SPACING_REGEX =
  /[\u00A0\u1680\u180E\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_SETUP_PURPOSE = 'PASSWORD_SETUP' as const;
const STAGGER_LOGO = 0;
const STAGGER_HEADLINE = 80;
const STAGGER_FORM = 200;

type LoginStep =
  | 'email'
  | 'password'
  | 'google-only'
  | 'generic'
  | 'code'
  | 'password-setup'
  | 'setup-success';

function stripInvisibleAuthSpacing(value: string): string {
  return String(value ?? '').normalize('NFKC').replace(INVISIBLE_AUTH_SPACING_REGEX, '');
}

function getErrorMessage(error: unknown, fallback: string): string {
  const candidates = [
    (error as any)?.response?.data?.message,
    (error as any)?.response?.data?.error,
    (error as any)?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function isCredentialFailure(error: unknown) {
  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes('invalid') ||
    message.includes('credential') ||
    message.includes('password') ||
    message.includes('unauthorized') ||
    message.includes('not found')
  );
}

export default function LoginScreen() {
  const { theme } = useTheme();
  const { signIn, signInWithGoogle, status, user } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ reason?: string; next?: string }>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>('email');
  const [loginOptions, setLoginOptions] = useState<LoginOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [flowError, setFlowError] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);
  const [passwordSetupToken, setPasswordSetupToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSetupLoading, setPasswordSetupLoading] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [credentialFailures, setCredentialFailures] = useState<{ email: string; count: number }>({
    email: '',
    count: 0,
  });

  const googleTokenRequest = useGoogleIdTokenRequest({
    loginHint: stripInvisibleAuthSpacing(email).trim() || undefined,
  });

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineSlide = useRef(new Animated.Value(24)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(36)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        delay: STAGGER_LOGO,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headlineOpacity, {
        toValue: 1,
        duration: 500,
        delay: STAGGER_HEADLINE,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headlineSlide, {
        toValue: 0,
        duration: 500,
        delay: STAGGER_HEADLINE,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 500,
        delay: STAGGER_FORM,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formSlide, {
        toValue: 0,
        duration: 500,
        delay: STAGGER_FORM,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [formOpacity, formSlide, headlineOpacity, headlineSlide, logoOpacity]);

  const nextPath = useMemo(() => {
    const next = typeof params.next === 'string' ? params.next : undefined;
    return next || '/(tabs)/me';
  }, [params.next]);

  useEffect(() => {
    if (pendingNavigation && status === 'authenticated' && user) {
      const next = typeof params.next === 'string' ? params.next : undefined;
      const shouldForceBrandCatalog =
        hasActiveBrandMembership(user) &&
        (!next || next === '/(tabs)/me' || next.startsWith('/(tabs)/me?'));

      if (shouldForceBrandCatalog) {
        router.replace('/catalog' as any);
      } else if (next) {
        router.replace(next as any);
      } else {
        router.replace(nextPath as any);
      }
      setPendingNavigation(false);
    }
  }, [pendingNavigation, status, user, params.next, nextPath]);

  const normalizedEmail = stripInvisibleAuthSpacing(email).trim().toLowerCase();
  const showAuthRequired = params.reason === 'auth_required';
  const canRequestPasswordSetup = Boolean(loginOptions?.methods.passwordSetupAvailable);
  const showGoogleAction =
    loginStep === 'email' ||
    loginStep === 'google-only' ||
    Boolean(loginOptions?.methods.google);
  const showSignupHint =
    credentialFailures.email === normalizedEmail && credentialFailures.count >= 3;

  const recordCredentialFailure = () => {
    setCredentialFailures((current) =>
      current.email === normalizedEmail
        ? { email: normalizedEmail, count: current.count + 1 }
        : { email: normalizedEmail, count: 1 },
    );
  };

  const resetProgressiveFlow = () => {
    setLoginStep('email');
    setLoginOptions(null);
    setPassword('');
    setPasswordError('');
    setFlowError('');
    setEmailCode('');
    setPasswordSetupToken('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const continueWithEmail = async () => {
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailError('Enter a valid email address.');
      return;
    }

    setEmailError('');
    setPasswordError('');
    setFlowError('');
    setOptionsLoading(true);
    try {
      const options = await getLoginOptions(normalizedEmail);
      setLoginOptions(options);
      if (options.methods.password) {
        setLoginStep('password');
      } else if (options.methods.google || options.methods.passwordSetupAvailable) {
        setLoginStep('google-only');
      } else {
        recordCredentialFailure();
        toast.error('Invalid credentials');
        setLoginStep('email');
      }
    } catch (error) {
      if (isCredentialFailure(error)) {
        recordCredentialFailure();
        toast.error('Invalid credentials');
      } else {
        setFlowError(getErrorMessage(error, 'Unable to check sign-in options. Try again.'));
      }
    } finally {
      setOptionsLoading(false);
    }
  };

  const submitPasswordLogin = async () => {
    const normalizedPassword = stripInvisibleAuthSpacing(password);
    let hasError = false;

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailError('Enter a valid email address.');
      hasError = true;
    } else {
      setEmailError('');
    }

    if (!normalizedPassword.trim()) {
      setPasswordError('Password is required.');
      hasError = true;
    } else {
      setPasswordError('');
    }

    if (hasError) return;

    setSubmitting(true);
    try {
      await signIn({ email: normalizedEmail, password: normalizedPassword });
      toast.success('Welcome back!');
      setPendingNavigation(true);
    } catch (error) {
      recordCredentialFailure();
      toast.error('Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFlowError('');
    setGoogleLoading(true);
    try {
      const idToken = await googleTokenRequest.requestGoogleIdToken();
      await signInWithGoogle({ idToken });
      toast.success('Welcome back!');
      setPendingNavigation(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Google sign-in could not be completed.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const requestPasswordSetupCode = async () => {
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailError('Enter a valid email address.');
      return;
    }

    setEmailError('');
    setFlowError('');
    setEmailCodeLoading(true);
    try {
      await requestEmailLoginCode({
        email: normalizedEmail,
        purpose: PASSWORD_SETUP_PURPOSE,
        requestId: loginOptions?.requestId,
      });
      setEmailCode('');
      setLoginStep('code');
      toast.success('If eligible, a password setup code has been sent.');
    } catch (error) {
      setFlowError(getErrorMessage(error, 'Unable to send a password setup code.'));
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const confirmPasswordSetupCode = async () => {
    const code = emailCode.trim();
    if (!code) {
      setFlowError('Enter the verification code from your email.');
      return;
    }

    setFlowError('');
    setEmailCodeLoading(true);
    try {
      const result = await confirmEmailLoginCode({
        email: normalizedEmail,
        code,
        purpose: PASSWORD_SETUP_PURPOSE,
      });
      setPasswordSetupToken(result.passwordSetupToken);
      setEmailCode('');
      setLoginStep('password-setup');
    } catch (error) {
      setFlowError(getErrorMessage(error, 'Invalid or expired verification code.'));
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const submitPasswordSetup = async () => {
    setFlowError('');
    if (!passwordSetupToken) {
      setFlowError('Your password setup session expired. Request a new code.');
      setLoginStep('code');
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setFlowError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setFlowError('Passwords do not match.');
      return;
    }

    setPasswordSetupLoading(true);
    try {
      await setupAccountPassword({
        passwordSetupToken,
        newPassword,
      });
      setPasswordSetupToken('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      setLoginStep('setup-success');
      toast.success('Password created. Sign in with your new password.');
    } catch (error) {
      setFlowError(getErrorMessage(error, 'Unable to create your password.'));
    } finally {
      setPasswordSetupLoading(false);
    }
  };

  const bgGradient = [theme.colors.bg, theme.colors.bg, theme.colors.bg] as const;
  const accentGradient = [theme.colors.surface, theme.colors.surfaceAlt, theme.colors.surface] as const;

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

      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={tokens.spacing['2xl']}
        enableResetScrollToCoords={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + tokens.spacing.lg, paddingBottom: insets.bottom + tokens.spacing['3xl'] },
        ]}
      >
        <Animated.View style={[styles.logoRow, { opacity: logoOpacity }]}>
          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <ThreadlyLogo size={36} />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.headlineBlock,
            { opacity: headlineOpacity, transform: [{ translateY: headlineSlide }] },
          ]}
        >
          <AppText variant="caption" tone="primary" style={styles.editorialTag}>
            FASHION SOCIAL
          </AppText>
          <AppText variant="display">
            Welcome{'\n'}
            Back.
          </AppText>
          <AppText variant="subtitle" tone="muted" style={styles.tagline}>
            Your world of fashion awaits.
          </AppText>
        </Animated.View>

        <Animated.View
          style={[
            styles.formPanel,
            { opacity: formOpacity, transform: [{ translateY: formSlide }] },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />
          <View style={[styles.formPanelBorder, { borderColor: theme.colors.border }]} />
          <View style={styles.goldAccentLine} />

          <View style={[styles.formInner, { backgroundColor: theme.colors.surface }]}>
            {showAuthRequired ? (
              <View style={styles.notice}>
                <AppText style={styles.noticeText}>Please sign in to continue</AppText>
              </View>
            ) : null}

            <View style={styles.fieldsContainer}>
              <FloatingLabelInput
                label="Email"
                placeholder="Email"
                hideLabel
                icon="@"
                value={email}
                onChangeText={(value) => {
                  setEmail(stripInvisibleAuthSpacing(value));
                  setEmailError('');
                  if (loginStep !== 'email') {
                    resetProgressiveFlow();
                  }
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={emailError}
                testID="login-email-input"
              />

              {loginStep === 'password' ? (
                <FloatingLabelInput
                  label="Password"
                  placeholder="Password"
                  hideLabel
                  icon="*"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(stripInvisibleAuthSpacing(value));
                    setPasswordError('');
                  }}
                  isPassword
                  error={passwordError}
                  testID="login-password-input"
                />
              ) : null}
            </View>

            {loginStep === 'google-only' ? (
              <View style={styles.statePanel}>
                <AppText variant="bodyBold">This account uses Google sign-in.</AppText>
                <AppText variant="caption" tone="muted" style={styles.statePanelText}>
                  Continue with Google, or verify your email to create a WEAZ password.
                </AppText>
              </View>
            ) : null}

            {loginStep === 'code' ? (
              <View style={styles.inlineFlow}>
                <AppText variant="bodyBold">Enter your email code</AppText>
                <AppText variant="caption" tone="muted">
                  Use the code sent to your inbox to create your first password.
                </AppText>
                <FloatingLabelInput
                  label="Verification Code"
                  value={emailCode}
                  onChangeText={(value) => {
                    setEmailCode(value);
                    setFlowError('');
                  }}
                  keyboardType="numeric"
                  isPassword
                  testID="password-setup-code-input"
                />
                <View style={styles.inlineActions}>
                  <Button
                    title="Verify code"
                    onPress={confirmPasswordSetupCode}
                    loading={emailCodeLoading}
                    disabled={emailCodeLoading}
                    fullWidth
                  />
                  <Button
                    title="Resend code"
                    variant="outline"
                    onPress={requestPasswordSetupCode}
                    disabled={emailCodeLoading}
                    fullWidth
                  />
                </View>
              </View>
            ) : null}

            {loginStep === 'password-setup' ? (
              <View style={styles.inlineFlow}>
                <AppText variant="bodyBold">Create your password</AppText>
                <AppText variant="caption" tone="muted">
                  This creates your first WEAZ password. You will sign in after it is saved.
                </AppText>
                <FloatingLabelInput
                  label="New Password"
                  value={newPassword}
                  onChangeText={(value) => {
                    setNewPassword(value);
                    setFlowError('');
                  }}
                  isPassword
                  testID="password-setup-new-password-input"
                />
                <FloatingLabelInput
                  label="Confirm Password"
                  value={confirmNewPassword}
                  onChangeText={(value) => {
                    setConfirmNewPassword(value);
                    setFlowError('');
                  }}
                  isPassword
                  testID="password-setup-confirm-password-input"
                />
                <AppText variant="caption" tone="muted">
                  Use at least {PASSWORD_MIN_LENGTH} characters.
                </AppText>
                <PrimaryAuthButton
                  title="CREATE PASSWORD"
                  onPress={submitPasswordSetup}
                  loading={passwordSetupLoading}
                  disabled={passwordSetupLoading}
                />
              </View>
            ) : null}

            {loginStep === 'setup-success' ? (
              <View style={styles.successPanel}>
                <AppText variant="bodyBold">Password created</AppText>
                <AppText variant="caption" tone="muted" style={styles.statePanelText}>
                  Sign in with your email and new password, or continue with Google.
                </AppText>
                <Button
                  title="Back to sign in"
                  variant="outline"
                  onPress={() => {
                    setLoginOptions({
                      requestId: '',
                      methods: {
                        password: true,
                        google: Boolean(loginOptions?.methods.google),
                        passwordSetupAvailable: false,
                      },
                      message: '',
                    });
                    setLoginStep('password');
                  }}
                  fullWidth
                />
              </View>
            ) : null}

            {flowError ? (
              <View style={styles.errorPanel}>
                <AppText variant="caption" tone="danger">
                  {flowError}
                </AppText>
              </View>
            ) : null}

            {loginStep === 'password' ? (
              <Button
                title="Forgot password?"
                variant="ghost"
                size="xs"
                onPress={() =>
                  router.push({
                    pathname: '/forgot-password',
                    params: { email: normalizedEmail },
                  })
                }
                style={styles.forgotBtn}
              />
            ) : null}

            {loginStep === 'email' ? (
              <View style={styles.primaryAction}>
                <PrimaryAuthButton
                  title="CONTINUE"
                  onPress={continueWithEmail}
                  loading={optionsLoading}
                  disabled={optionsLoading}
                />
              </View>
            ) : null}

            {loginStep === 'password' ? (
              <View style={styles.primaryAction}>
                <PrimaryAuthButton
                  title="SIGN IN"
                  onPress={submitPasswordLogin}
                  loading={submitting || status === 'loading'}
                  disabled={submitting || status === 'loading'}
                />
              </View>
            ) : null}

            {showGoogleAction ? (
              <View style={styles.googleAction}>
                <Button
                  title="Continue with Google"
                  variant="outline"
                  onPress={handleGoogleSignIn}
                  loading={googleLoading}
                  disabled={!googleTokenRequest.configured || !googleTokenRequest.ready || googleLoading}
                  fullWidth
                  left={<GoogleMark />}
                  testID="login-google-button"
                />
                {__DEV__ && !googleTokenRequest.configured ? (
                  <AppText variant="caption" tone="warning" style={styles.googleConfigText}>
                    Google sign-in needs public Google client IDs in this build.
                  </AppText>
                ) : null}
              </View>
            ) : null}

            {showSignupHint ? (
              <View style={styles.signupHint}>
                <AppText variant="captionRegular" tone="muted">
                  New here?{' '}
                </AppText>
                <Pressable
                  onPress={() => router.push({ pathname: '/(auth)/signup', params: { next: nextPath } })}
                  accessibilityRole="button"
                  accessibilityLabel="Create an account"
                >
                  <AppText variant="captionBold" tone="primary">
                    Create an account.
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            {canRequestPasswordSetup &&
            loginStep !== 'code' &&
            loginStep !== 'password-setup' &&
            loginStep !== 'setup-success' ? (
              <Button
                title="Create a password with email code"
                variant="outline"
                onPress={requestPasswordSetupCode}
                loading={emailCodeLoading}
                disabled={emailCodeLoading}
                fullWidth
                style={styles.passwordSetupButton}
              />
            ) : null}

            <View style={styles.footerRow}>
              <AppText variant="body" tone="muted">
                New to WEAZ?
              </AppText>
              <Pressable
                onPress={() => router.push({ pathname: '/(auth)/signup', params: { next: nextPath } })}
                accessibilityRole="button"
                accessibilityLabel="Create account"
              >
                <AppText variant="bodyBold" tone="primary" style={styles.footerLink}>
                  {'  '}CREATE ACCOUNT
                </AppText>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: tokens.spacing.xl,
    justifyContent: 'flex-start',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: tokens.spacing['3xl'],
  },
  headlineBlock: { marginBottom: tokens.spacing.xl },
  editorialTag: {
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: tokens.spacing.sm,
  },
  tagline: {
    marginTop: tokens.spacing.sm,
  },
  formPanel: {
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    position: 'relative',
    marginTop: tokens.spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  formPanelBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
  },
  goldAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#D4AF37',
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    zIndex: 2,
  },
  formInner: {
    paddingVertical: tokens.spacing.xl2,
    paddingHorizontal: tokens.spacing.xl,
  },
  notice: {
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    backgroundColor: '#2B1742',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: '#9333EA',
    marginBottom: tokens.spacing.xl2,
  },
  noticeText: {
    color: '#D4AF37',
    fontSize: tokens.typography.caption.size,
    fontWeight: '600',
    textAlign: 'center',
  },
  fieldsContainer: {
    gap: tokens.spacing.md,
  },
  statePanel: {
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  statePanelText: {
    lineHeight: 19,
  },
  inlineFlow: {
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.3)',
    backgroundColor: 'rgba(147,51,234,0.08)',
  },
  inlineActions: {
    gap: tokens.spacing.sm,
  },
  successPanel: {
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  errorPanel: {
    marginTop: tokens.spacing.md,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
  },
  primaryAction: {
    marginTop: tokens.spacing.sm,
  },
  googleAction: {
    marginTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  googleConfigText: {
    textAlign: 'center',
  },
  signupHint: {
    marginTop: tokens.spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  passwordSetupButton: {
    marginTop: tokens.spacing.md,
  },
  footerRow: {
    marginTop: tokens.spacing['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  footerLink: {
    letterSpacing: 0.5,
  },
});
