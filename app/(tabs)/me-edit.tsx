import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';

import { ProfileApi, type UserProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';
import { compressPickedImage } from '@/src/utils/imageCompression';
import {
  MOBILE_UPLOAD_POLICIES,
  getMobileUploadValidationMessage,
  assertValidPickedUploadAsset,
} from '@/src/utils/uploadValidation';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { tokens } from '@/src/styles/tokens';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type ProfileFormState = {
  firstName: string;
  lastName: string;
  address: string;
};

function toForm(profile: UserProfile): ProfileFormState {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    address: profile.location ?? profile.address ?? '',
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

function statusLabel(state: SaveState, savedAt: Date | null): string {
  if (state === 'saving') return 'Saving changes...';
  if (state === 'error') return 'Could not save changes. Fix the issue before leaving.';
  if (state === 'saved' && savedAt) {
    return `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return 'Changes save when you leave';
}

export default function MeEditScreen() {
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const navigation = useNavigation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [baseline, setBaseline] = useState<ProfileFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const latestFormRef = useRef<ProfileFormState | null>(null);
  const pendingChangesRef = useRef(false);
  const isNavigatingAwayRef = useRef(false);

  const hasPendingChanges = useMemo(() => {
    if (!form || !baseline) return false;
    return !formsEqual(form, baseline);
  }, [baseline, form]);

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  useEffect(() => {
    pendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const retryDelays = [1000, 3000];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
      }
      try {
        const data = await ProfileApi.getMe();
        if (!data) {
          console.warn('[background.profile.load.failed] No profile data returned');
          if (attempt === 2) toast.error('Could not load your profile.');
          continue;
        }
        const nextForm = toForm(data);
        setProfile(data);
        setForm(nextForm);
        setBaseline(nextForm);
        setSaveState('idle');
        setLoading(false);
        return;
      } catch (error) {
        console.warn('[background.profile.load.failed]', error);
        if (attempt === 2) toast.error('Failed to load your profile.');
      }
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const persistDraft = useCallback(
    async (draft: ProfileFormState) => {
      if (!profile) return true;
      if (!baseline || formsEqual(draft, baseline)) return true;

      const resolvedFirstName = draft.firstName.trim() || baseline.firstName.trim() || profile.firstName.trim();
      const resolvedLastName = draft.lastName.trim() || baseline.lastName.trim() || profile.lastName.trim();

      if (!resolvedFirstName || !resolvedLastName) {
        setSaveState('error');
        toast.error('First and last name are required.');
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
          username: profile.username,
          address: draft.address.trim() || undefined,
        });
        if (updated) {
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
        }
        return true;
      } catch {
        setSaveState('error');
        toast.error('Failed to save your profile changes.');
        return false;
      }
    },
    [baseline, profile, toast, updateUser],
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
    router.back();
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

  if (loading || !form) {
    return <AppLoaderScreen message="Loading editor" />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton onPress={handleBack} style={styles.backButton} />
        <View style={styles.headerTextWrap}>
          <AppText variant="bodyBold">Edit Profile</AppText>
          <AppText variant="caption" tone={statusTone} style={styles.status}>
            {statusLabel(saveState, lastSavedAt)}
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
            <AppText variant="body" tone="muted" style={styles.avatarHelp}>
              Email and password stay in account settings. This screen only edits profile details.
            </AppText>
          </View>

          <View style={styles.group}>
            <Input
              label="First Name"
              value={form.firstName}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, firstName: value } : prev))}
              placeholder="First name"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Last Name"
              value={form.lastName}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, lastName: value } : prev))}
              placeholder="Last name"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Location"
              value={form.address}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, address: value } : prev))}
              placeholder="City, State"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.helperStack}>
            <AppText variant="caption" tone="muted">Changes save automatically when you leave this screen.</AppText>
            <AppText variant="caption" tone="muted">Signed in as {user?.email ?? 'your account'}.</AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: tokens.typography.caption.size,
    fontWeight: '600',
    textAlign: 'center',
  },
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
  status: {
    marginTop: tokens.spacing.xs,
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
  avatarHelp: {
    textAlign: 'center',
    maxWidth: 280,
  },
  group: {
    gap: tokens.spacing.sm,
  },
  helperStack: {
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing.xs,
  },
});
