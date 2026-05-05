/**
 * Login Screen — Theme-Aware Redesign
 *
 * Fully respects the active theme (dark / light / time-based):
 * - Background: LinearGradient using theme tokens (no hardcoded dark hex)
 * - Form panel: theme.colors.surface with theme.colors.border
 * - Text: theme.colors.text / theme.colors.textMuted throughout
 * - No image background (images are always dark, incompatible with light theme)
 *
 * The gradient creates a premium, editorial atmosphere without locking to dark.
 * Fashion · Social identity is maintained through typography and accent colors.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { FloatingLabelInput } from '@/components/auth/FloatingLabelInput';
import { Button } from '@/components/ui/Button';
import { PrimaryAuthButton } from '@/components/auth/PrimaryAuthButton';
import { AppText } from '@/components/ui/AppText';

// ─── Invisible-character sanitizer (logic unchanged from original) ─────────────
const INVISIBLE_AUTH_SPACING_REGEX =
  /[\u00A0\u1680\u180E\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g;

function stripInvisibleAuthSpacing(value: string): string {
  return String(value ?? '').normalize('NFKC').replace(INVISIBLE_AUTH_SPACING_REGEX, '');
}
// ──────────────────────────────────────────────────────────────────────────────

const STAGGER_LOGO = 0;
const STAGGER_HEADLINE = 80;
const STAGGER_FORM = 200;

export default function LoginScreen() {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';

  const { signIn, status, user } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ reason?: string; next?: string }>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ── Staggered entrance ──
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineSlide = useRef(new Animated.Value(24)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(36)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 500, delay: STAGGER_LOGO,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(headlineOpacity, {
        toValue: 1, duration: 500, delay: STAGGER_HEADLINE,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(headlineSlide, {
        toValue: 0, duration: 500, delay: STAGGER_HEADLINE,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(formOpacity, {
        toValue: 1, duration: 500, delay: STAGGER_FORM,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(formSlide, {
        toValue: 0, duration: 500, delay: STAGGER_FORM,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ── Post-login navigation ──
  const nextPath = useMemo(() => {
    const next = typeof params.next === 'string' ? params.next : undefined;
    return next || '/(tabs)/me';
  }, [params.next]);

  const [pendingNavigation, setPendingNavigation] = useState(false);
  const showAuthRequired = params.reason === 'auth_required';

  useEffect(() => {
    if (pendingNavigation && status === 'authenticated' && user) {
      const next = typeof params.next === 'string' ? params.next : undefined;
      const shouldForceBrandCatalog =
        user.type === 'BRAND' &&
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

  const onSubmit = async () => {
    const rawIdentifier = String(email ?? '');
    const rawPassword = String(password ?? '');
    const normalizedIdentifier = stripInvisibleAuthSpacing(rawIdentifier).trim();
    const normalizedPassword = stripInvisibleAuthSpacing(rawPassword);

    let hasError = false;
    if (!normalizedIdentifier) {
      setEmailError('Email or username is required');
      hasError = true;
    } else {
      setEmailError('');
    }

    if (!normalizedPassword.trim()) {
      setPasswordError('Password is required');
      hasError = true;
    } else {
      setPasswordError('');
    }

    if (hasError) return;

    setSubmitting(true);
    try {
      await signIn({ email: normalizedIdentifier, password: normalizedPassword });
      toast.success('Welcome back! 🎉');
      setPendingNavigation(true);
    } catch (e: any) {
      const message = typeof e?.message === 'string' ? e.message : 'Login failed. Please try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Theme-derived gradient colors — premium aesthetic for both light and dark
  const bgGradient = [theme.colors.bg, theme.colors.bg, theme.colors.bg] as const;

  const accentGradient = [theme.colors.surface, theme.colors.surfaceAlt, theme.colors.surface] as const;

  const formBg = theme.colors.surface;
  const formBorder = theme.colors.border;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      {/* ── Theme-adaptive gradient background ── */}
      <LinearGradient
        colors={bgGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Purple-gold accent sweep in top-right corner */}
      <LinearGradient
        colors={accentGradient}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAwareScrollView
        enableOnAndroid={true}
        extraScrollHeight={tokens.spacing['2xl']}
        enableResetScrollToCoords={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + tokens.spacing.lg, paddingBottom: insets.bottom + tokens.spacing['3xl'] },
        ]}
      >
        {/* ── Logo — icon only, top left ── */}
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

        {/* ── Editorial Headline ── */}
        <Animated.View
          style={[
            styles.headlineBlock,
            { opacity: headlineOpacity, transform: [{ translateY: headlineSlide }] },
          ]}
        >
          <AppText variant="caption" tone="primary" style={styles.editorialTag}>
            FASHION · SOCIAL
          </AppText>
          <AppText variant="display">
            Welcome{'\n'}
            Back.
          </AppText>
          <AppText variant="subtitle" tone="muted" style={styles.tagline}>
            Your world of fashion awaits.
          </AppText>
        </Animated.View>

        {/* ── Form Panel ── */}
        <Animated.View
          style={[
            styles.formPanel,
            { opacity: formOpacity, transform: [{ translateY: formSlide }] },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />

          {/* Panel border */}
          <View style={[styles.formPanelBorder, { borderColor: formBorder }]} />

          {/* Gold top accent line */}
          <View style={styles.goldAccentLine} />

          <View style={[styles.formInner, { backgroundColor: formBg }]}>
            {showAuthRequired && (
              <View style={styles.notice}>
                <AppText style={styles.noticeText}>🔒 Please sign in to continue</AppText>
              </View>
            )}

            <View style={styles.fieldsContainer}>
              <FloatingLabelInput
                label="Email or username"
                icon="📧"
                value={email}
                onChangeText={(v) => setEmail(stripInvisibleAuthSpacing(v))}
                keyboardType="default"
                error={emailError}
                testID="login-email-input"
              />

              <FloatingLabelInput
                label="Password"
                icon="🔑"
                value={password}
                onChangeText={(v) => setPassword(stripInvisibleAuthSpacing(v))}
                isPassword
                error={passwordError}
                testID="login-password-input"
              />
            </View>

            <Button
              title="Forgot password?"
              variant="ghost"
              size="xs"
              onPress={() =>
                router.push({
                  pathname: '/forgot-password',
                  params: { email: stripInvisibleAuthSpacing(email).trim() },
                })
              }
              style={styles.forgotBtn}
            />

            <View style={{ marginTop: tokens.spacing.sm }}>
              <PrimaryAuthButton
                title="SIGN IN"
                onPress={onSubmit}
                loading={submitting || status === 'loading'}
                disabled={submitting || status === 'loading'}
              />
            </View>

            <View style={styles.footerRow}>
              <AppText variant="body" tone="muted">
                New to Threadly?
              </AppText>
              <Pressable
                onPress={() => router.push({ pathname: '/(auth)/signup', params: { next: nextPath } })}
                accessibilityRole="button"
                accessibilityLabel="Create account"
              >
                <AppText variant="bodyBold" tone="primary" style={styles.footerLink}>
                  {'  '}CREATE ACCOUNT →
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
    ...StyleSheet.absoluteFillObject,
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
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -tokens.spacing.sm,
    marginBottom: tokens.spacing.xl2,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
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
