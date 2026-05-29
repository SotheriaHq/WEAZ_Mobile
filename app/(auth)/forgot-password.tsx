import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requestPasswordReset } from '@/src/api/AuthApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import { FloatingLabelInput } from '@/components/auth/FloatingLabelInput';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';

const INVISIBLE_AUTH_SPACING_REGEX =
  /[\u00A0\u1680\u180E\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g;

function stripInvisibleAuthSpacing(value: string): string {
  return String(value ?? '').normalize('NFKC').replace(INVISIBLE_AUTH_SPACING_REGEX, '');
}

export default function ForgotPasswordScreen() {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (typeof params.email === 'string') {
      setEmail(stripInvisibleAuthSpacing(params.email));
    }
  }, [params.email]);

  const bgGradient = isDark
    ? (['#0f0a14', '#1a0a2e', '#0f0a14'] as const)
    : (['#f7f6f8', '#ede8f5', '#f0ecfa'] as const);

  const accentGradient = isDark
    ? (['#2B1742', '#1E293B', '#0F172A'] as const)
    : (['#EDE9FE', '#FEF3C7', '#F8FAFC'] as const);

  const formBg = theme.colors.surface;
  const formBorder = theme.colors.border;

  const onSubmit = async () => {
    const normalizedEmail = stripInvisibleAuthSpacing(email).trim();

    if (!normalizedEmail) {
      setEmailError('Email address is required');
      return;
    }

    setEmailError('');
    setSubmitting(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setSent(true);
      toast.success('If that email exists, a reset link was sent.');
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : 'Could not send reset link. Please try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

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
            onPress={() => router.replace('/login' as any)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Back to login"
          >
            <ThreadlyLogo size={36} />
          </Pressable>
        </View>

        <View style={styles.spacer} />

        <View style={styles.headlineBlock}>
          <AppText variant="captionBold" tone="primary" style={styles.kicker}>PASSWORD RESET</AppText>
          <AppText variant="display">
            Reset your password
          </AppText>
          <AppText variant="body" muted style={styles.subtitle}>
            Enter the email connected to your account and we’ll send a secure reset link.
          </AppText>
        </View>

        <View style={styles.formPanel}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />
          <View style={[styles.formPanelBorder, { borderColor: formBorder }]} />
          <View style={styles.gradientAccentLine} />

          <View style={[styles.formInner, { backgroundColor: formBg }]}> 
            {sent ? (
              <View style={styles.successBlock}>
                <AppText variant="title">
                  Check your inbox
                </AppText>
                <AppText variant="body" muted style={styles.successBody}>
                  If that address exists, the reset email is on the way. Open the secure link on this device or in a browser; the web page still works if the app cannot open it.
                </AppText>

                <Button
                  title="Back to login"
                  onPress={() => router.replace('/login' as any)}
                  size="lg"
                  fullWidth
                  style={styles.primaryButton}
                  textStyle={styles.primaryButtonText}
                />

                <Button
                  title="Send another link"
                  variant="ghost"
                  size="xs"
                  onPress={() => setSent(false)}
                  style={styles.secondaryButton}
                />
              </View>
            ) : (
              <View>
                <AppText variant="captionBold" tone="muted" style={styles.sectionLabel}>ACCOUNT EMAIL</AppText>

                <FloatingLabelInput
                  label="Email address"
                  icon="📧"
                  value={email}
                  onChangeText={(value) => setEmail(stripInvisibleAuthSpacing(value))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={emailError}
                  testID="forgot-password-email-input"
                />

                <Button
                  title="Send reset link"
                  onPress={onSubmit}
                  loading={submitting}
                  disabled={submitting}
                  size="lg"
                  fullWidth
                  style={styles.primaryButton}
                  textStyle={styles.primaryButtonText}
                />

                <Button
                  title="Back to login"
                  variant="ghost"
                  size="xs"
                  onPress={() => router.replace('/login' as any)}
                  style={styles.secondaryButton}
                />
              </View>
            )}
          </View>
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
    minHeight: 140,
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
    backgroundColor: '#D4AF37',
    opacity: 0.7,
    zIndex: 2,
  },
  formInner: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  sectionLabel: {
    marginBottom: 12,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  successBlock: {
    gap: 16,
  },
  successBody: {
    lineHeight: 24,
  },
  primaryButton: {
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
    paddingHorizontal: 4,
  },
});
