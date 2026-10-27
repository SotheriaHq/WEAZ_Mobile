import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/src/auth/AuthContext';
import { needsGenderPrompt } from '@/src/lib/profileGender';
import { saveAnalyticsConsent, useConsent } from '@/src/privacy/consent';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Screens the prompt never covers: mid-flow sign-in steps, and the policy the
 * prompt links to. Same list as `GenderPromptSheet`.
 */
const SKIP_PATH_PARTS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/legal',
  '/accept-invite',
  '/account-reactivation',
];

/**
 * Asks once whether analytics may run on this install.
 *
 * Both answers carry equal weight and nothing optional runs until one is
 * chosen. It waits for the gender prompt, so two sheets never stack. Push
 * permission is a separate system prompt and is not affected by this choice.
 */
export function AnalyticsConsentSheet() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { status, user } = useAuth();
  const { ready, decided } = useConsent();

  const onSkippedRoute = SKIP_PATH_PARTS.some((part) => pathname?.includes(part));
  const genderPromptFirst = status === 'authenticated' && Boolean(user?.id) && needsGenderPrompt(user);
  const open = ready && !decided && status !== 'loading' && !onSkippedRoute && !genderPromptFirst;

  if (!open) return null;

  return (
    // Not dismissible, like the gender prompt: the choice is the only way out.
    <Modal visible transparent animationType="slide" onRequestClose={() => undefined}>
      <View style={[styles.scrim, { paddingBottom: insets.bottom + tokens.spacing.lg }]}>
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <AppText variant="captionBold" tone="primary">
            Your privacy
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            Help improve your feed?
          </AppText>
          <AppText variant="bodyRegular" tone="muted">
            With your OK, WIEZ uses what you view and tap in the app to shape your Runway and
            Market, and measures how fast screens load. We never sell this or use it for ads.
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            You can change this anytime in Settings › Privacy controls.
          </AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/legal/cookies' as never)}
            hitSlop={8}
            style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
          >
            <AppText variant="captionBold" tone="primary">
              Cookie and tracking policy
            </AppText>
          </Pressable>
          <View style={styles.actions}>
            <Button
              title="Don't allow"
              variant="secondary"
              size="md"
              style={styles.action}
              onPress={() => saveAnalyticsConsent(false)}
            />
            <Button
              title="Allow"
              variant="secondary"
              size="md"
              style={styles.action}
              onPress={() => saveAnalyticsConsent(true)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: tokens.colors.scrim,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  sheet: {
    width: '100%',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.xl,
    borderWidth: 2,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
  },
  link: {
    alignSelf: 'flex-start',
    paddingVertical: tokens.spacing.xs,
  },
  pressed: {
    opacity: 0.72,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  action: {
    flex: 1,
  },
});
