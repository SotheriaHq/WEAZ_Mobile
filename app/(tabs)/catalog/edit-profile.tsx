import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';

import { brandApi, type BrandProfileDto, type UpdateBrandProfilePayload } from '@/src/api/BrandApi';
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
import { backOrNavigate } from '@/src/utils/mobileNavigation';
import { queryClient } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { BRAND_TAG_OPTIONS, BRAND_TAG_SELECTION_LIMIT } from '@/src/data/brandTags';
import { normalizeSocialLink } from '@/src/utils/socialLinks';
import { AppMultiSelectSheet, AppSelectSheet, type SelectSheetOption } from '@/components/ui/AppSelectSheet';
import { Chip } from '@/components/ui/Chip';
import { locationService, type CountryOption, type StateOption } from '@/src/services/locationService';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type LocationSheet = 'country' | 'state' | 'city' | null;

const BUSINESS_TYPE_OPTIONS: SelectSheetOption[] = [
  { value: 'Retailer', label: 'Retailer', disabled: true },
  { value: 'Designer', label: 'Designer' },
  { value: 'Wholesaler', label: 'Wholesaler', disabled: true },
  { value: 'Boutique', label: 'Boutique', disabled: true },
];

type BrandFormState = {
  brandFullName: string;
  brandDescription: string;
  businessType: string;
  brandCity: string;
  brandState: string;
  brandCountry: string;
  brandTags: string[];
  socialInstagram: string;
  socialFacebook: string;
  socialTwitter: string;
  socialWebsite: string;
};

function toForm(profile: BrandProfileDto): BrandFormState {
  return {
    brandFullName: profile.brandFullName ?? '',
    brandDescription: profile.brandDescription ?? '',
    businessType: profile.businessType ?? '',
    brandCity: profile.brandCity ?? '',
    brandState: profile.brandState ?? '',
    brandCountry: profile.brandCountry ?? '',
    brandTags: Array.isArray(profile.brandTags) ? profile.brandTags : [],
    socialInstagram: profile.socialInstagram ?? '',
    socialFacebook: profile.socialFacebook ?? '',
    socialTwitter: profile.socialTwitter ?? '',
    socialWebsite: profile.socialWebsite ?? '',
  };
}

function normalizeField(value: string): string {
  return value.trim();
}

function formsEqual(a: BrandFormState, b: BrandFormState): boolean {
  return (
    normalizeField(a.brandFullName) === normalizeField(b.brandFullName) &&
    normalizeField(a.brandDescription) === normalizeField(b.brandDescription) &&
    normalizeField(a.businessType) === normalizeField(b.businessType) &&
    normalizeField(a.brandCity) === normalizeField(b.brandCity) &&
    normalizeField(a.brandState) === normalizeField(b.brandState) &&
    normalizeField(a.brandCountry) === normalizeField(b.brandCountry) &&
    a.brandTags.join('|') === b.brandTags.join('|') &&
    normalizeField(a.socialInstagram) === normalizeField(b.socialInstagram) &&
    normalizeField(a.socialFacebook) === normalizeField(b.socialFacebook) &&
    normalizeField(a.socialTwitter) === normalizeField(b.socialTwitter) &&
    normalizeField(a.socialWebsite) === normalizeField(b.socialWebsite)
  );
}

function toPayload(form: BrandFormState): UpdateBrandProfilePayload {
  return {
    brandFullName: form.brandFullName.trim(),
    brandDescription: form.brandDescription.trim() || undefined,
    businessType: form.businessType.trim() || undefined,
    brandCity: form.brandCity.trim() || undefined,
    brandState: form.brandState.trim() || undefined,
    brandCountry: form.brandCountry.trim() || undefined,
    brandTags: form.brandTags.slice(0, BRAND_TAG_SELECTION_LIMIT),
    // The API validates every social field with `@IsUrl()`. Our placeholders ask
    // for "@brand" and "@handle", so the raw values were guaranteed 400s.
    socialInstagram: normalizeSocialLink('instagram', form.socialInstagram),
    socialFacebook: normalizeSocialLink('facebook', form.socialFacebook),
    socialTwitter: normalizeSocialLink('twitter', form.socialTwitter),
    socialWebsite: normalizeSocialLink('website', form.socialWebsite),
  };
}

/**
 * Nest's ValidationPipe answers a 400 with `message` as an ARRAY of per-field
 * strings. Every generic error helper here reads `message` as a string, so the
 * only thing that ever reached the user was "Failed to save your brand
 * profile." — true, but it never said which field to fix.
 */
function getProfileSaveErrorMessage(error: unknown): string {
  const fallback = 'Failed to save your brand profile.';
  const response = (error as { response?: { data?: unknown } } | null)?.response;
  const data = response?.data as Record<string, unknown> | undefined;
  if (!data) return fallback;

  const raw = data.message ?? (data.data as Record<string, unknown> | undefined)?.message;
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === 'string' && entry.trim());
    return typeof first === 'string' ? first.trim() : fallback;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

function statusLabel(state: SaveState, savedAt: Date | null): string | null {
  if (state === 'saving') return 'Saving changes...';
  if (state === 'error') return 'Could not save changes. Fix the issue before leaving.';
  if (state === 'saved' && savedAt) {
    return `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return null;
}

function withCurrentOption(options: SelectSheetOption[], currentValue: string): SelectSheetOption[] {
  const trimmed = currentValue.trim();
  if (!trimmed || options.some((option) => option.value === trimmed)) {
    return options;
  }
  return [{ value: trimmed, label: trimmed }, ...options];
}

function getOptionLabel(options: SelectSheetOption[], value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return options.find((option) => option.value === trimmed)?.label ?? trimmed;
}

function ProfileSelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="smallBold" tone="secondary">
        {label}
      </AppText>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.selectField,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          disabled && styles.selectFieldDisabled,
          pressed && !disabled && styles.selectFieldPressed,
        ]}
      >
        <View style={styles.selectValueRow}>
          <AppText variant="body" tone={value ? 'default' : 'muted'} style={styles.selectValue}>
            {value || placeholder}
          </AppText>
          {/* A chevron, not the word "Choose". Every platform picker uses a
              disclosure marker here; spelling out the verb on every field is
              noise the user has to read past on the way to the value. */}
          <AppText variant="subtitle" tone={disabled ? 'muted' : 'secondary'} style={styles.selectChoose}>
            ›
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}

export default function BrandProfileEditScreen() {
  const { brandId: routeBrandId } = useLocalSearchParams<{ brandId?: string }>();
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const navigation = useNavigation();

  const targetBrandId =
    typeof routeBrandId === 'string' && routeBrandId.length > 0
      ? routeBrandId
      : user?.id ?? null;

  const [profile, setProfile] = useState<BrandProfileDto | null>(null);
  const [form, setForm] = useState<BrandFormState | null>(null);
  const [baseline, setBaseline] = useState<BrandFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [tagsSheetOpen, setTagsSheetOpen] = useState(false);
  const [businessTypeSheetOpen, setBusinessTypeSheetOpen] = useState(false);
  const [locationSheet, setLocationSheet] = useState<LocationSheet>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const latestFormRef = useRef<BrandFormState | null>(null);
  const pendingChangesRef = useRef(false);
  const isNavigatingAwayRef = useRef(false);
  /**
   * True once the user has typed anything. A refetch must not overwrite work in
   * progress: `loadProfile` resets `form` AND `baseline`, so a reload mid-edit
   * did not just revert the fields on screen, it made `hasPendingChanges` false
   * and left `beforeRemove`/`handleBack` with nothing to save. `me-edit.tsx` has
   * carried this guard; this screen did not.
   */
  const hasUserEditedRef = useRef(false);

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
    if (!targetBrandId) {
      setLoading(false);
      return;
    }

    // Only the first load blocks the screen. A later refetch used to flip
    // `loading` back on and replace the whole editor with the full-page loader —
    // the "entire screen reloaded" on avatar upload.
    setLoading((current) => current || !latestFormRef.current);
    try {
      const data = await brandApi.getProfileById(targetBrandId);
      if (!data) {
        toast.error('Could not load brand profile.');
        setLoading(false);
        return;
      }
      setProfile(data);
      if (!hasUserEditedRef.current) {
        const nextForm = toForm(data);
        setForm(nextForm);
        setBaseline(nextForm);
        setSaveState('idle');
      }
    } catch {
      toast.error('Failed to load brand profile.');
    } finally {
      setLoading(false);
    }
    // `toast` is deliberately not a dependency. It is stable now, but listing it
    // is what let a toast rebuild this callback and re-fire its effect mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetBrandId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadCountries = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);
    const nextCountries = await locationService.getCountries();
    setCountries(nextCountries);
    if (nextCountries.length === 0) {
      setLocationError('Location options are unavailable. Your saved location is preserved.');
    }
    setLocationLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      void loadCountries();
    }
  }, [loadCountries, loading]);

  useEffect(() => {
    const country = form?.brandCountry.trim() ?? '';
    if (!country) {
      setStates([]);
      setCities([]);
      return;
    }

    let cancelled = false;
    setLocationLoading(true);
    void locationService.getStates(country).then((nextStates) => {
      if (cancelled) return;
      setStates(nextStates);
      setLocationLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [form?.brandCountry]);

  useEffect(() => {
    const country = form?.brandCountry.trim() ?? '';
    const state = form?.brandState.trim() ?? '';
    if (!country || !state) {
      setCities([]);
      return;
    }

    let cancelled = false;
    setLocationLoading(true);
    void locationService.getCities(country, state).then((nextCities) => {
      if (cancelled) return;
      setCities(nextCities);
      setLocationLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [form?.brandCountry, form?.brandState]);

  const persistDraft = useCallback(
    async (draft: BrandFormState) => {
      if (!targetBrandId || !baseline) return true;
      if (formsEqual(draft, baseline)) return true;

      const resolvedBrandFullName =
        draft.brandFullName.trim() || baseline.brandFullName.trim() || profile?.brandFullName?.trim() || '';

      if (!resolvedBrandFullName) {
        setSaveState('error');
        toast.error('Brand name is required.');
        return false;
      }

      const resolvedDraft: BrandFormState = {
        ...draft,
        brandFullName: resolvedBrandFullName,
      };

      setSaveState('saving');
      try {
        const updated = await brandApi.updateProfile(targetBrandId, toPayload(resolvedDraft));
        if (updated) {
          setProfile(updated);
          setBaseline(resolvedDraft);
          // The draft is now the server's truth, so a later refetch is free to
          // refresh the form again.
          hasUserEditedRef.current = false;
          // Same reason as the avatar upload: the catalogue reads this profile
          // from the query cache, so it has to be told the record moved.
          void queryClient.invalidateQueries({
            queryKey: queryKeys.brand.profile(targetBrandId),
          });
          setSaveState('saved');
          setLastSavedAt(new Date());
          updateUser({
            firstName: updated.firstName ?? user?.firstName,
            lastName: updated.lastName ?? user?.lastName,
            username: updated.username ?? user?.username,
            brandFullName: updated.brandFullName ?? user?.brandFullName,
            phoneNumber: updated.phoneNumber ?? user?.phoneNumber,
            profileImage: updated.profileImage ?? user?.profileImage,
            profileImageId: updated.profileImageId ?? user?.profileImageId,
            profileImageFile: updated.profileImageFile ?? user?.profileImageFile,
          });
        }
        return true;
      } catch (error) {
        setSaveState('error');
        toast.error(getProfileSaveErrorMessage(error));
        return false;
      }
    },
    [baseline, profile?.brandFullName, targetBrandId, toast, updateUser, user],
  );

  /**
   * Every write to `form` goes through here so `hasUserEditedRef` cannot drift
   * out of sync with what is on screen — a background refetch that lands while
   * a field is dirty must not be allowed to replace it.
   */
  const updateField = useCallback((patch: Partial<BrandFormState>) => {
    hasUserEditedRef.current = true;
    setForm((current) => (current ? { ...current, ...patch } : current));
  }, []);

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
    // Owner edit-profile lives in the (tabs) group; fall back to the catalog
    // when there is no history (e.g. entered from Settings) instead of Runway.
    backOrNavigate('/catalog');
  }, [persistOnExit]);

  const handlePickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow photo access to update your brand image.');
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

    setSaveState('saving');
    try {
      const uploaded = await brandApi.uploadAvatar(asset.uri, asset.mimeType);
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
              logoImage: uploaded.url,
              logoImageId: uploaded.id,
              logoImageMeta: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url, fileId: uploaded.id },
            }
          : prev,
      );
      updateUser({
        profileImage: uploaded.url,
        profileImageId: uploaded.id,
        profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
      });
      // The catalogue renders the brand avatar from the cached `brand.profile`
      // query, not from auth state, so `updateUser` alone never reached it.
      // Write through rather than only invalidating: the new image is already
      // in hand, so the catalogue should be correct the instant we navigate
      // back, not one refetch later.
      if (targetBrandId) {
        const profileKey = queryKeys.brand.profile(targetBrandId);
        queryClient.setQueryData<BrandProfileDto>(profileKey, (current) =>
          current
            ? {
                ...current,
                profileImage: uploaded.url,
                profileImageId: uploaded.id,
                profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
                logoImage: uploaded.url,
                logoImageId: uploaded.id,
                logoImageMeta: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url, fileId: uploaded.id },
              }
            : current,
        );
        void queryClient.invalidateQueries({ queryKey: profileKey });
      }
      setSaveState('saved');
      setLastSavedAt(new Date());
      toast.success('Brand image updated.');
    } catch {
      setSaveState('error');
      toast.error('Failed to update your brand image.');
    }
  }, [targetBrandId, toast, updateUser]);

  const avatar = resolveProfileImageSource(profile ?? user ?? null);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: Boolean(profile || user) });
  const avatarFallback = getAvatarFallback(
    profile?.brandFullName ?? ([profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || user?.brandFullName || null),
    profile?.username ?? user?.username ?? null,
  );
  const statusTone =
    saveState === 'error' ? 'danger' : saveState === 'saving' ? 'warning' : 'muted';
  const currentStatusLabel = statusLabel(saveState, lastSavedAt);
  /**
   * A brand name is set once, at signup, and then fixed — it is how buyers and
   * orders identify the brand, so it is not a field to re-type freely.
   *
   * This reads the name the SERVER returned, not the form, so typing cannot
   * unlock it. Note this is a UI lock only: `updateProfile` still accepts
   * `brandFullName`, so the rule is not enforced until the API rejects changes
   * to it. Treat that as the real fix; this stops the accidental case.
   */
  const brandNameLocked = Boolean(profile?.brandFullName?.trim());
  const tagOptions: SelectSheetOption[] = useMemo(() => {
    const byValue = new Map<string, SelectSheetOption>();
    BRAND_TAG_OPTIONS.forEach((option) => byValue.set(option.value, option));
    (form?.brandTags ?? []).forEach((tag) => {
      if (!byValue.has(tag)) {
        byValue.set(tag, { label: tag, value: tag });
      }
    });
    return Array.from(byValue.values());
  }, [form?.brandTags]);
  const businessTypeOptions = useMemo(
    () => withCurrentOption(BUSINESS_TYPE_OPTIONS, form?.businessType ?? ''),
    [form?.businessType],
  );
  const countryOptions = useMemo(
    () => withCurrentOption(countries.map((country) => ({ label: country.name, value: country.name })), form?.brandCountry ?? ''),
    [countries, form?.brandCountry],
  );
  const stateOptions = useMemo(
    () => withCurrentOption(states.map((state) => ({ label: state.name, value: state.name })), form?.brandState ?? ''),
    [states, form?.brandState],
  );
  const cityOptions = useMemo(
    () => withCurrentOption(cities.map((city) => ({ label: city, value: city })), form?.brandCity ?? ''),
    [cities, form?.brandCity],
  );

  if (loading || !form) {
    return <AppLoaderScreen message="Loading profile editor" />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton onPress={handleBack} style={styles.backButton} />
        <View style={styles.headerTextWrap}>
          <AppText variant="bodyBold">Edit Brand Profile</AppText>
          {currentStatusLabel ? (
            // A spinner beside the label. "Saving changes..." as static text
            // gives no sign the app is working, so a save in flight looks
            // identical to a frozen screen — which is exactly how it read when
            // swiping back triggered the save-on-exit.
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
              accessibilityLabel="Update brand image"
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

          <View style={styles.group}>
            <Input
              label="Brand Name"
              value={form.brandFullName}
              onChangeText={(value) => updateField({ brandFullName: value })}
              placeholder="Your brand name"
              containerStyle={styles.group}
              variant="underline"
              editable={!brandNameLocked}
            />
            {brandNameLocked ? (
              <AppText variant="caption" tone="muted">
                Your brand name is locked. Contact support if it needs to change.
              </AppText>
            ) : null}
          </View>

          <View style={styles.group}>
            <Input
              label="Bio"
              value={form.brandDescription}
              onChangeText={(value) => updateField({ brandDescription: value })}
              placeholder="Tell shoppers what your brand is about"
              multiline
              containerStyle={styles.group}
              variant="underline"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.group, styles.rowItem]}>
              <ProfileSelectField
                label="Business Type"
                value={getOptionLabel(businessTypeOptions, form.businessType)}
                placeholder="Select business type"
                onPress={() => setBusinessTypeSheetOpen(true)}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.group, styles.rowItem]}>
              <ProfileSelectField
                label="Country"
                value={getOptionLabel(countryOptions, form.brandCountry)}
                placeholder="Select country"
                onPress={() => setLocationSheet('country')}
              />
            </View>
            <View style={[styles.group, styles.rowItem]}>
              <ProfileSelectField
                label="State / Province"
                value={getOptionLabel(stateOptions, form.brandState)}
                placeholder={form.brandCountry ? 'Select state / province' : 'Select country first'}
                onPress={() => setLocationSheet('state')}
                disabled={!form.brandCountry}
              />
            </View>
          </View>

          <View style={styles.group}>
            <ProfileSelectField
              label="City / LGA"
              value={getOptionLabel(cityOptions, form.brandCity)}
              placeholder={form.brandState ? 'Select city / LGA' : 'Select state first'}
              onPress={() => setLocationSheet('city')}
              disabled={!form.brandState}
            />
            {locationError ? (
              <AppText variant="caption" tone="warning">
                {locationError}
              </AppText>
            ) : null}
          </View>

          <View style={styles.group}>
            <AppText variant="captionBold" tone="muted">Tags</AppText>
            <Pressable
              onPress={() => setTagsSheetOpen(true)}
              style={[styles.tagField, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              accessibilityRole="button"
            >
              {form.brandTags.length > 0 ? (
                <View style={styles.tagFieldChips}>
                  {form.brandTags.map((tag) => (
                    <Chip key={tag} label={tag} selected />
                  ))}
                </View>
              ) : (
                <AppText variant="body" tone="muted">Select brand tags</AppText>
              )}
            </Pressable>
          </View>

          <View style={styles.group}>
            <Input
              label="Instagram"
              value={form.socialInstagram}
              onChangeText={(value) => updateField({ socialInstagram: value })}
              placeholder="@brand or URL"
              autoCapitalize="none"
              containerStyle={styles.group}
              variant="underline"
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Facebook"
              value={form.socialFacebook}
              onChangeText={(value) => updateField({ socialFacebook: value })}
              placeholder="Profile URL"
              autoCapitalize="none"
              containerStyle={styles.group}
              variant="underline"
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Twitter/X"
              value={form.socialTwitter}
              onChangeText={(value) => updateField({ socialTwitter: value })}
              placeholder="@handle"
              autoCapitalize="none"
              containerStyle={styles.group}
              variant="underline"
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Website"
              value={form.socialWebsite}
              onChangeText={(value) => updateField({ socialWebsite: value })}
              placeholder="https://"
              autoCapitalize="none"
              containerStyle={styles.group}
              variant="underline"
            />
          </View>

      </KeyboardAwareFormScroll>

      <AppSelectSheet
        visible={businessTypeSheetOpen}
        title="Business Type"
        options={businessTypeOptions}
        value={form.businessType || null}
        onChange={(value) => updateField({ businessType: value })}
        onClose={() => setBusinessTypeSheetOpen(false)}
      />

      <AppSelectSheet
        visible={locationSheet === 'country'}
        title="Country"
        options={countryOptions}
        value={form.brandCountry || null}
        loading={locationLoading && countries.length === 0}
        errorMessage={locationError}
        emptyMessage="No countries available."
        onChange={(value) => updateField({ brandCountry: value, brandState: '', brandCity: '' })}
        onClose={() => setLocationSheet(null)}
      />

      <AppSelectSheet
        visible={locationSheet === 'state'}
        title="State / Province"
        options={stateOptions}
        value={form.brandState || null}
        loading={locationLoading && states.length === 0}
        emptyMessage="No states available for the selected country."
        onChange={(value) => updateField({ brandState: value, brandCity: '' })}
        onClose={() => setLocationSheet(null)}
      />

      <AppSelectSheet
        visible={locationSheet === 'city'}
        title="City / LGA"
        options={cityOptions}
        value={form.brandCity || null}
        loading={locationLoading && cities.length === 0}
        emptyMessage="No cities available for the selected state."
        onChange={(value) => updateField({ brandCity: value })}
        onClose={() => setLocationSheet(null)}
      />

      <AppMultiSelectSheet
        visible={tagsSheetOpen}
        title="Brand Tags"
        options={tagOptions}
        values={form.brandTags}
        maxSelected={BRAND_TAG_SELECTION_LIMIT}
        onChange={(values) => updateField({ brandTags: values })}
        onClose={() => setTagsSheetOpen(false)}
      />
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
  row: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
  group: {
    gap: tokens.spacing.sm,
  },
  selectField: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    justifyContent: 'center',
  },
  selectFieldDisabled: {
    opacity: 0.56,
  },
  selectFieldPressed: {
    opacity: 0.88,
  },
  selectValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  selectValue: {
    flex: 1,
    flexShrink: 1,
  },
  selectChoose: {
    flexShrink: 0,
  },
  tagField: {
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    justifyContent: 'center',
  },
  tagFieldChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  textArea: {
    minHeight: 110,
  },
});
