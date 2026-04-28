/**
 * Signup Screen — REDESIGNED
 *
 * Fashion + Social Fusion:
 * - Same editorial background variant (alt image) for visual continuity with Login
 * - Shared glass panel architecture
 * - AccountTypeSelector (Shopper vs Brand) with spring-animated cards
 * - Brand field reveal — smooth height animation, not a jarring reflow
 * - FloatingLabelInput across all fields
 * - Premium checkbox for Terms (emoji-based)
 * - Gold gradient CTA for Brand, Purple for Shopper
 * - Staggered entrance with same timing curve as Login
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';
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
import { AccountTypeSelector } from '@/components/auth/AccountTypeSelector';
import { PrimaryAuthButton } from '@/components/auth/PrimaryAuthButton';
import { AppText } from '@/components/ui/AppText';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type UserType = 'REGULAR' | 'BRAND' | null;

export default function SignupScreen() {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const { signUp, status, user } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ next?: string }>();
  const insets = useSafeAreaInsets();

  const [userType, setUserType] = useState<UserType>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Staggered entrance
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineSlide = useRef(new Animated.Value(30)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        delay: 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headlineOpacity, {
        toValue: 1,
        duration: 600,
        delay: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headlineSlide, {
        toValue: 0,
        duration: 600,
        delay: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formSlide, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Brand name field animated reveal
  const brandReveal = useRef(new Animated.Value(0)).current;
  const prevUserType = useRef<UserType>(null);

  useEffect(() => {
    if (userType === prevUserType.current) return;
    prevUserType.current = userType;

    LayoutAnimation.configureNext(
      LayoutAnimation.create(280, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );

    Animated.timing(brandReveal, {
      toValue: userType === 'BRAND' ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [userType]);

  const nextPath = useMemo(() => {
    const next = typeof params.next === 'string' ? params.next : undefined;
    return next || '/(tabs)/me';
  }, [params.next]);

  const [pendingNavigation, setPendingNavigation] = useState(false);

  useEffect(() => {
    if (pendingNavigation && status === 'authenticated' && user) {
      if (user.type === 'BRAND') {
        router.replace('/catalog' as any);
      } else {
        router.replace(nextPath as any);
      }
      setPendingNavigation(false);
    }
  }, [pendingNavigation, status, user, nextPath]);

  const onSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!userType) {
      toast.warning('Choose whether you are a Shopper or a Brand 🛍️✨');
      return;
    }
    if (!firstName.trim()) newErrors.firstName = 'First name required';
    if (!lastName.trim()) newErrors.lastName = 'Last name required';
    if (userType === 'BRAND' && !brandName.trim()) newErrors.brandName = 'Brand name required';
    if (!email.trim()) newErrors.email = 'Email address required';
    if (!password) newErrors.password = 'Password required';
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!acceptedTerms) {
      toast.warning('Please accept the Terms & Privacy to continue.');
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await signUp({
        firstName,
        lastName,
        email: email.trim(),
        password,
        type: userType,
        ...(userType === 'BRAND' ? { brandFullName: brandName.trim() } : {}),
      });
      toast.success('Welcome to Threadly! 🎉');
      setPendingNavigation(true);
    } catch (e: any) {
      const message =
        typeof e?.message === 'string' ? e.message : 'Signup failed. Please try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const isBrand = userType === 'BRAND';
  const ctaTitle = isBrand ? 'CREATE BRAND' : 'JOIN THREADLY';

  // Theme-derived colors
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
            {
              opacity: headlineOpacity,
              transform: [{ translateY: headlineSlide }],
            },
          ]}
        >
          <AppText variant="caption" tone="primary" style={styles.editorialTag}>JOIN THE MOVEMENT</AppText>
          <AppText variant="display">
            Start Your{'\n'}
            Journey.
          </AppText>
          <AppText variant="subtitle" tone="muted" style={styles.tagline}>Fashion meets your social world.</AppText>
        </Animated.View>

        {/* ── Glass Form Panel ── */}
        <Animated.View
          style={[
            styles.formPanel,
            {
              opacity: formOpacity,
              transform: [{ translateY: formSlide }],
            },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />
          <View style={[styles.formPanelBorder, { borderColor: formBorder }]} />

          {/* Purple → Gold accent line (reflects journey: Shopper → Brand) */}
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.primaryActive]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientAccentLine}
          />

          <View style={[styles.formInner, { backgroundColor: formBg }]}>
            {/* Account type selector */}
            <AppText variant="caption" tone="muted" style={styles.sectionLabel}>I AM A...</AppText>
            <AccountTypeSelector value={userType} onChange={setUserType} />

            <View style={styles.fieldsContainer}>
              {/* Name row */}
              <View style={styles.nameRow}>
                <View style={{ flex: 1 }}>
                  <FloatingLabelInput
                    label="First Name"
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    error={errors.firstName}
                    testID="signup-firstname-input"
                  />
                </View>
                <View style={{ width: tokens.spacing.md }} />
                <View style={{ flex: 1 }}>
                  <FloatingLabelInput
                    label="Last Name"
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    error={errors.lastName}
                    testID="signup-lastname-input"
                  />
                </View>
              </View>

              {/* Brand name — animated reveal */}
              {userType === 'BRAND' && (
                <Animated.View style={{ opacity: brandReveal }}>
                  <FloatingLabelInput
                    label="Brand Name"
                    icon="✨"
                    value={brandName}
                    onChangeText={setBrandName}
                    autoCapitalize="words"
                    error={errors.brandName}
                    testID="signup-brandname-input"
                  />
                </Animated.View>
              )}

              <FloatingLabelInput
                label="Email Address"
                icon="📧"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                error={errors.email}
                testID="signup-email-input"
              />

              <FloatingLabelInput
                label="Password"
                icon="🔑"
                value={password}
                onChangeText={setPassword}
                isPassword
                error={errors.password}
                testID="signup-password-input"
              />

              <FloatingLabelInput
                label="Confirm Password"
                icon="🔒"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                isPassword
                error={errors.confirmPassword}
                testID="signup-confirm-password-input"
              />
            </View>

            {/* Terms checkbox */}
            <Pressable
              onPress={() => setAcceptedTerms((v) => !v)}
              style={styles.termsRow}
              accessibilityRole="checkbox"
              accessibilityLabel="Accept terms and privacy"
              accessibilityState={{ checked: acceptedTerms }}
            >
              <View style={styles.checkbox}>
                <AppText style={styles.checkEmoji}>{acceptedTerms ? '✅' : '⬜'}</AppText>
              </View>
              <AppText variant="caption" tone="muted" style={styles.termsText}>
                I agree to the{' '}
                <AppText variant="caption" tone="primary" style={{ fontWeight: '700' }}>Terms</AppText> &{' '}
                <AppText variant="caption" tone="primary" style={{ fontWeight: '700' }}>Privacy Policy</AppText>
              </AppText>
            </Pressable>

            {/* CTA */}
            <View style={{ marginTop: tokens.spacing.xl }}>
              <PrimaryAuthButton
                title={ctaTitle}
                onPress={onSubmit}
                loading={submitting || status === 'loading'}
                disabled={submitting || status === 'loading'}
              />
            </View>

            {/* Back to Login */}
            <View style={styles.footerRow}>
              <AppText variant="body" tone="muted">Already a member?</AppText>
              <Pressable
                onPress={() =>
                  router.replace({ pathname: '/login', params: { next: nextPath } })
                }
                accessibilityRole="button"
                accessibilityLabel="Sign in to existing account"
              >
                <AppText variant="bodyBold" tone="primary" style={styles.footerLink}>{'  '}SIGN IN →</AppText>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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
    gap: tokens.spacing.md,
    alignSelf: 'flex-start',
    marginBottom: tokens.spacing['3xl'],
  },
  headlineBlock: {
    marginBottom: tokens.spacing.xl,
  },
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
    shadowOpacity: 0.40,
    shadowRadius: 24,
    elevation: 16,
  },
  formPanelBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
  },
  gradientAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    zIndex: 2,
  },
  formInner: {
    paddingVertical: tokens.spacing.xl2,
    paddingHorizontal: tokens.spacing.xl,
  },
  sectionLabel: {
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: tokens.spacing.md,
  },
  fieldsContainer: {
    gap: tokens.spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.md,
    marginBottom: tokens.spacing.xs,
  },
  checkbox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmoji: {
    fontSize: 20,
  },
  termsText: {
    flex: 1,
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
