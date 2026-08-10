import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';

import { ProfileApi, type UserProfile } from '@/src/api/ProfileApi';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { getFriendlyErrorMessage } from '@/src/utils/errorMessage';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';
import { compressPickedImage } from '@/src/utils/imageCompression';
import {
  MOBILE_UPLOAD_POLICIES,
  getMobileUploadValidationMessage,
  assertValidPickedUploadAsset,
} from '@/src/utils/uploadValidation';
import { AppText } from '@/components/ui/AppText';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { tokens } from '@/src/styles/tokens';
import { readWarmScreenState } from '@/src/state/screenWarmState';
import { backOrNavigate } from '@/src/utils/mobileNavigation';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type ProfileFormState = {
  firstName: string;
  lastName: string;
  address: string;
};

type WarmProfileState = {
  profile: UserProfile | null;
};

function toForm(profile: UserProfile | null, user: AuthUser | null): ProfileFormState {
  return {
    firstName: profile?.firstName ?? user?.firstName ?? '',
    lastName: profile?.lastName ?? user?.lastName ?? '',
    address: profile?.location ?? profile?.address ?? '',
  };
}

function normalized(value: string): string {
  return value.trim();
}

function formsEqual(a: ProfileFormState, b: ProfileFormState): boolean {
  return (
    normalized(a.firstName) === normalized(b.firstName) &&
    normalized(a.lastName) === normalized(b.lastName) &&
    normalized(a.address) === normalized(b.address)
  );
}

function statusLabel(state: SaveState, savedAt: Date | null, error: string | null): string | null {
  if (state === 'saving') return 'Saving changes';
  // Prefer the specific failure over the generic sentence — "Username already
  // taken" tells the user what to do; "Could not save changes" does not.
  if (state === 'error') return error ?? 'Could not save changes. Fix the issue before leaving.';
  if (state === 'saved' && savedAt) {
    return `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return null;
}

export default function MeEditScreen() {
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const navigation = useNavigation();

  const initialProfile = useMemo(
    () =>
      user?.id
        ? readWarmScreenState<WarmProfileState>(`me:${user.id}`)?.profile ?? null
        : null,
    [user?.id],
  );
  const initialForm = useMemo(() => toForm(initialProfile, user), [initialProfile, user]);
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [form, setForm] = useState<ProfileFormState>(initialForm);
  const [baseline, setBaseline] = useState<ProfileFormState>(initialForm);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // Carries the specific reason a save failed, so the header can say what went
  // wrong instead of "Could not save changes."
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const latestFormRef = useRef<ProfileFormState | null>(null);
  const pendingChangesRef = useRef(false);
  const hasUserEditedRef = useRef(false);
  const isNavigatingAwayRef = useRef(false);

  const hasPendingChanges = useMemo(() => {
    return !formsEqual(form, baseline);
  }, [baseline, form]);

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  useEffect(() => {
    pendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges]);

  const loadProfile = useCallback(async () => {
    try {
      const data = await ProfileApi.getMe();
      if (!data) return;
      const nextForm = toForm(data, user);
      setProfile(data);
      if (!hasUserEditedRef.current) {
        setForm(nextForm);
        setBaseline(nextForm);
        setSaveState('idle');
      }
    } catch {
      // Auth/warm data keeps the editor usable while the profile request degrades.
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const persistDraft = useCallback(
    async (draft: ProfileFormState) => {
      if (formsEqual(draft, baseline)) return true;

      const resolvedFirstName = draft.firstName.trim() || baseline.firstName.trim() || profile?.firstName.trim() || user?.firstName?.trim();
      const resolvedLastName = draft.lastName.trim() || baseline.lastName.trim() || profile?.lastName.trim() || user?.lastName?.trim();
      const username = profile?.username.trim() || user?.username?.trim();

      if (!resolvedFirstName || !resolvedLastName || !username) {
        setSaveState('error');
        toast.error('First name, last name, and username are required.');
        return false;
      }

      const resolvedDraft: ProfileFormState = {
        ...draft,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
      };

      setSaveState('saving');
      try {
        const updated = await ProfileApi.updateProfile({
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          username,
          address: draft.address.trim() || undefined,
        });
        // A falsy response means nothing was persisted. Returning `true` here —
        // as this did — let `beforeRemove` navigate away on the strength of a
        // save that never happened, discarding the user's edits silently.
        if (!updated) {
          setSaveState('error');
          toast.error('Your profile did not save. Please try again.');
          return false;
        }

        setProfile(updated);
        setBaseline(resolvedDraft);
        setSaveState('saved');
        setLastSavedAt(new Date());
        updateUser({
          firstName: updated.firstName,
          lastName: updated.lastName,
          username: updated.username,
          profileImage: updated.profileImage,
          profileImageId: updated.profileImageId,
          profileImageFile: updated.profileImageFile,
        });
        return true;
      } catch (error) {
        setSaveState('error');
        // The bare `catch` here used to collapse every cause into one generic
        // sentence, so a taken username, an expired session and a dropped
        // connection were indistinguishable — and none of them actionable.
        const reason = getFriendlyErrorMessage(error, 'Failed to save your profile changes.');
        setSaveError(reason);
        toast.error(reason);
        return false;
      }
    },
    [baseline, profile, toast, updateUser, user?.firstName, user?.lastName, user?.username],
  );

  const persistOnExit = useCallback(async () => {
    if (!pendingChangesRef.current || !latestFormRef.current) {
      return true;
    }
    setSaveState('saving');
    return persistDraft(latestFormRef.current);
  }, [persistDraft]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (isNavigatingAwayRef.current) {
        return;
      }
      if (!pendingChangesRef.current || !latestFormRef.current) {
        return;
      }

      event.preventDefault();
      isNavigatingAwayRef.current = true;

      void persistOnExit().then((didSave) => {
        if (didSave) {
          navigation.dispatch(event.data.action);
          return;
        }
        isNavigatingAwayRef.current = false;
      });
    });

    return unsubscribe;
  }, [navigation, persistOnExit]);

  const handleBack = useCallback(async () => {
    if (isNavigatingAwayRef.current) {
      return;
    }

    isNavigatingAwayRef.current = true;
    const didSave = await persistOnExit();
    if (!didSave) {
      isNavigatingAwayRef.current = false;
      return;
    }
    // Edit Info lives inside the (tabs) group; a bare router.back() with no
    // history (e.g. entered from Settings or a deep link) drops to the default
    // tab (Runway). backOrNavigate falls back to the Me profile instead.
    backOrNavigate('/(tabs)/me');
  }, [persistOnExit]);

  const handlePickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow photo access to update your profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const raw = result.assets[0];
    let asset = { uri: raw.uri, fileName: raw.fileName, mimeType: raw.mimeType ?? 'image/jpeg' };
    try {
      const compressed = await compressPickedImage(
        raw.uri, raw.width ?? 0, raw.height ?? 0, raw.fileName, 'profileImage',
      );
      asset = { uri: compressed.uri, fileName: compressed.fileName, mimeType: compressed.mimeType };
    } catch {
      // compression failed — validate original (may reject if >2 MB)
    }

    try {
      assertValidPickedUploadAsset(
        { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType },
        MOBILE_UPLOAD_POLICIES.profileImage,
      );
    } catch (validationError) {
      toast.error(getMobileUploadValidationMessage(validationError));
      return;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName ?? 'profile.jpg',
      type: asset.mimeType,
    } as any);

    setSaveState('saving');
    try {
      const uploaded = await ProfileApi.uploadProfileImage(formData);
      if (!uploaded) {
        throw new Error('Upload failed');
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              profileImage: uploaded.url,
              profileImageId: uploaded.id,
              profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
            }
          : prev,
      );
      updateUser({
        profileImage: uploaded.url,
        profileImageId: uploaded.id,
        profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
      });
      setSaveState('saved');
      setLastSavedAt(new Date());
      toast.success('Profile image updated.');
    } catch {
      setSaveState('error');
      toast.error('Failed to update your profile image.');
    }
  }, [toast, updateUser]);

  const avatar = resolveProfileImageSource(profile ?? user ?? null);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: Boolean(profile || user) });
  const avatarFallback = getAvatarFallback(
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || user?.firstName || null,
    profile?.username ?? user?.username ?? null,
  );
  const statusTone =
    saveState === 'error' ? 'danger' : saveState === 'saving' ? 'warning' : 'muted';
  const currentStatusLabel = statusLabel(saveState, lastSavedAt, saveError);

  const updateField = useCallback((patch: Partial<ProfileFormState>) => {
    hasUserEditedRef.current = true;
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton onPress={handleBack} style={styles.backButton} />
        <View style={styles.headerTextWrap}>
          <AppText variant="bodyBold">Edit Profile</AppText>
          {currentStatusLabel ? (
            // A spinner alongside the label: "Saving changes" as static text
            // gives no sign the app is actually working, which is why a stalled
            // save is indistinguishable from a frozen screen.
            <View style={styles.statusRow}>
              {saveState === 'saving' ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : null}
              <AppText variant="caption" tone={statusTone} style={styles.status}>
                {currentStatusLabel}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      <KeyboardAwareFormScroll
        style={styles.flex}
        contentContainerStyle={styles.content}
      >
          <View style={styles.avatarSection}>
            <Pressable
              onPress={handlePickAvatar}
              style={({ pressed }) => [styles.avatarButton, pressed && styles.avatarPressed]}
              accessibilityRole="button"
              accessibilityLabel="Update profile image"
            >
              {avatarUri ? (
                <StableImage uri={avatarUri} containerStyle={styles.avatarImage} imageStyle={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primary + '1f' }]}>
                  <AppText variant="title" tone="primary">{avatarFallback}</AppText>
                </View>
              )}
              <View
                style={[
                  styles.avatarEditBadge,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <AppText variant="captionBold">✏️</AppText>
              </View>
            </Pressable>
          </View>

          <View style={[styles.formPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.fieldRow, { borderBottomColor: theme.colors.border }]}>
            <Input
              label="First Name"
              value={form.firstName}
              onChangeText={(value) => updateField({ firstName: value })}
              placeholder="First name"
              containerStyle={styles.group}
              variant="bare"
            />
            </View>

            <View style={[styles.fieldRow, { borderBottomColor: theme.colors.border }]}>
            <Input
              label="Last Name"
              value={form.lastName}
              onChangeText={(value) => updateField({ lastName: value })}
              placeholder="Last name"
              containerStyle={styles.group}
              variant="bare"
            />
            </View>

            <View style={styles.fieldRow}>
            <Input
              label="Location"
              value={form.address}
              onChangeText={(value) => updateField({ address: value })}
              placeholder="City, State"
              containerStyle={styles.group}
              variant="bare"
            />
            </View>
          </View>
      </KeyboardAwareFormScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  backButton: {
  },
  headerTextWrap: {
    flex: 1,
  },
  statusRow: {
    marginTop: tokens.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  status: {
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    paddingBottom: tokens.spacing['4xl'],
    gap: tokens.spacing.md,
  },
  avatarSection: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
  },
  avatarButton: {
    width: 96,
    height: 96,
    position: 'relative',
  },
  avatarPressed: {
    opacity: 0.82,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  fieldRow: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  group: {
    width: '100%',
    gap: tokens.spacing.sm,
  },
});
