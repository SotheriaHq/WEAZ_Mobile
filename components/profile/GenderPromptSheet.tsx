import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { ProfileApi } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  needsGenderPrompt,
  PROFILE_GENDER_OPTIONS,
  PROFILE_GENDER_PROMPT,
  type ProfileGender,
} from '@/src/lib/profileGender';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const SKIP_PATH_PARTS = ['/login', '/signup', '/forgot-password'];

export function GenderPromptSheet() {
  const { theme } = useTheme();
  const toast = useToast();
  const pathname = usePathname();
  const { status, user, updateUser } = useAuth();
  const [saving, setSaving] = useState<ProfileGender | null>(null);

  const onAuthRoute = SKIP_PATH_PARTS.some((part) => pathname?.includes(part));
  const open =
    status === 'authenticated' &&
    Boolean(user?.id) &&
    needsGenderPrompt(user) &&
    !onAuthRoute;

  const handleSelect = useCallback(
    async (gender: ProfileGender) => {
      if (saving) return;
      setSaving(gender);
      try {
        const updated = await ProfileApi.updateProfile({
          firstName: user?.firstName ?? '',
          lastName: user?.lastName ?? '',
          username: user?.username ?? '',
          gender,
        });
        updateUser({ gender: updated?.gender ?? gender });
      } catch {
        toast.error('Unable to save that just now. Please try again.');
      } finally {
        setSaving(null);
      }
    },
    [saving, toast, updateUser, user?.firstName, user?.lastName, user?.username],
  );

  if (!open) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.scrim}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppText variant="captionBold" tone="primary">
            A moment
          </AppText>
          <AppText variant="title">{PROFILE_GENDER_PROMPT.title}</AppText>
          <AppText variant="bodyRegular" tone="muted">
            {PROFILE_GENDER_PROMPT.body}
          </AppText>
          <AppText variant="captionBold">{PROFILE_GENDER_PROMPT.question}</AppText>
          <View style={styles.grid}>
            {PROFILE_GENDER_OPTIONS.map((option) => {
              const busy = saving === option.value;
              return (
                <Pressable
                  key={option.value}
                  disabled={Boolean(saving)}
                  onPress={() => void handleSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: theme.colors.primarySoft,
                      borderColor: theme.colors.focusRing,
                      opacity: pressed || Boolean(saving) ? 0.7 : 1,
                    },
                  ]}
                >
                  <AppText variant="captionBold" tone="primary">
                    {busy ? 'Saving…' : option.label}
                  </AppText>
                </Pressable>
              );
            })}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: tokens.spacing.lg,
  },
  sheet: {
    width: '100%',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  option: {
    width: '48%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
});
