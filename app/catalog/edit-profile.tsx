import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';

import { brandApi, type BrandProfileDto, type UpdateBrandProfilePayload } from '@/src/api/BrandApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { tokens } from '@/src/styles/tokens';
import { BRAND_TAG_OPTIONS } from '@/src/data/brandTags';
import { AppMultiSelectSheet, AppSelectSheet, type SelectSheetOption } from '@/components/ui/AppSelectSheet';
import { Chip } from '@/components/ui/Chip';
import { locationService, type CountryOption, type StateOption } from '@/src/services/locationService';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type LocationSheet = 'country' | 'state' | 'city' | null;

const BUSINESS_TYPE_OPTIONS: SelectSheetOption[] = [
  { value: 'Retailer', label: 'Retailer' },
  { value: 'Designer', label: 'Designer' },
  { value: 'Wholesaler', label: 'Wholesaler' },
  { value: 'Boutique', label: 'Boutique' },
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
    brandTags: form.brandTags.slice(0, 10),
    socialInstagram: form.socialInstagram.trim() || undefined,
    socialFacebook: form.socialFacebook.trim() || undefined,
    socialTwitter: form.socialTwitter.trim() || undefined,
    socialWebsite: form.socialWebsite.trim() || undefined,
  };
}

function statusLabel(state: SaveState, savedAt: Date | null): string {
  if (state === 'saving') return 'Saving changes...';
  if (state === 'error') return 'Could not save changes. Fix the issue before leaving.';
  if (state === 'saved' && savedAt) {
    return `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return 'Changes save when you leave';
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
      <AppText variant="captionBold" tone="muted">
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
          <AppText variant="captionBold" tone={disabled ? 'muted' : 'primary'}>
            Choose
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

    setLoading(true);
    try {
      const data = await brandApi.getProfileById(targetBrandId);
      if (!data) {
        toast.error('Could not load brand profile.');
        setLoading(false);
        return;
      }
      const nextForm = toForm(data);
      setProfile(data);
      setForm(nextForm);
      setBaseline(nextForm);
      setSaveState('idle');
    } catch {
      toast.error('Failed to load brand profile.');
    } finally {
      setLoading(false);
    }
  }, [targetBrandId, toast]);

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
      } catch {
        setSaveState('error');
        toast.error('Failed to save your brand profile.');
        return false;
      }
    },
    [baseline, profile?.brandFullName, targetBrandId, toast, updateUser, user],
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

    const asset = result.assets[0];
    setSaveState('saving');
    try {
      const uploaded = await brandApi.uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
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
      setSaveState('saved');
      setLastSavedAt(new Date());
      toast.success('Brand image updated.');
    } catch {
      setSaveState('error');
      toast.error('Failed to update your brand image.');
    }
  }, [toast, updateUser]);

  const avatar = resolveProfileImageSource(profile ?? user ?? null);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: Boolean(profile || user) });
  const avatarFallback = getAvatarFallback(
    profile?.brandFullName ?? ([profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || user?.brandFullName || null),
    profile?.username ?? user?.username ?? null,
  );
  const statusTone =
    saveState === 'error' ? 'danger' : saveState === 'saving' ? 'warning' : 'muted';
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
            <AppText variant="body" tone="muted" style={styles.avatarHelp}>
              Brand details save when you leave. Email and password are managed elsewhere.
            </AppText>
          </View>

          <View style={styles.group}>
            <Input
              label="Brand Name"
              value={form.brandFullName}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, brandFullName: value } : prev))}
              placeholder="Your brand name"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Description"
              value={form.brandDescription}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, brandDescription: value } : prev))}
              placeholder="Describe your brand"
              multiline
              containerStyle={styles.group}
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
                label="State"
                value={getOptionLabel(stateOptions, form.brandState)}
                placeholder={form.brandCountry ? 'Select state' : 'Select country first'}
                onPress={() => setLocationSheet('state')}
                disabled={!form.brandCountry}
              />
            </View>
          </View>

          <View style={styles.group}>
            <ProfileSelectField
              label="City"
              value={getOptionLabel(cityOptions, form.brandCity)}
              placeholder={form.brandState ? 'Select city' : 'Select state first'}
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
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, socialInstagram: value } : prev))}
              placeholder="@brand or URL"
              autoCapitalize="none"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Facebook"
              value={form.socialFacebook}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, socialFacebook: value } : prev))}
              placeholder="Profile URL"
              autoCapitalize="none"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Twitter/X"
              value={form.socialTwitter}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, socialTwitter: value } : prev))}
              placeholder="@handle"
              autoCapitalize="none"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.group}>
            <Input
              label="Website"
              value={form.socialWebsite}
              onChangeText={(value) => setForm((prev) => (prev ? { ...prev, socialWebsite: value } : prev))}
              placeholder="https://"
              autoCapitalize="none"
              containerStyle={styles.group}
            />
          </View>

          <View style={styles.helperStack}>
            <AppText variant="caption" tone="muted">Changes save automatically when you leave this screen.</AppText>
            <AppText variant="caption" tone="muted">Signed in as {user?.email ?? 'your account'}.</AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppSelectSheet
        visible={businessTypeSheetOpen}
        title="Business Type"
        subtitle="Use the same business category shown on web."
        options={businessTypeOptions}
        value={form.businessType || null}
        onChange={(value) => setForm((prev) => (prev ? { ...prev, businessType: value } : prev))}
        onClose={() => setBusinessTypeSheetOpen(false)}
      />

      <AppSelectSheet
        visible={locationSheet === 'country'}
        title="Country"
        subtitle="Choose the country shown on your public brand profile."
        options={countryOptions}
        value={form.brandCountry || null}
        loading={locationLoading && countries.length === 0}
        errorMessage={locationError}
        emptyMessage="No countries available."
        onChange={(value) =>
          setForm((prev) =>
            prev ? { ...prev, brandCountry: value, brandState: '', brandCity: '' } : prev,
          )
        }
        onClose={() => setLocationSheet(null)}
      />

      <AppSelectSheet
        visible={locationSheet === 'state'}
        title="State"
        subtitle="Choose the state or province for this brand."
        options={stateOptions}
        value={form.brandState || null}
        loading={locationLoading && states.length === 0}
        emptyMessage="No states available for the selected country."
        onChange={(value) =>
          setForm((prev) =>
            prev ? { ...prev, brandState: value, brandCity: '' } : prev,
          )
        }
        onClose={() => setLocationSheet(null)}
      />

      <AppSelectSheet
        visible={locationSheet === 'city'}
        title="City"
        subtitle="Choose the city for this brand."
        options={cityOptions}
        value={form.brandCity || null}
        loading={locationLoading && cities.length === 0}
        emptyMessage="No cities available for the selected state."
        onChange={(value) => setForm((prev) => (prev ? { ...prev, brandCity: value } : prev))}
        onClose={() => setLocationSheet(null)}
      />

      <AppMultiSelectSheet
        visible={tagsSheetOpen}
        title="Brand Tags"
        subtitle="Pick the specialties that describe this brand."
        options={tagOptions}
        values={form.brandTags}
        maxSelected={10}
        onChange={(values) => setForm((prev) => (prev ? { ...prev, brandTags: values } : prev))}
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
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  selectValue: {
    flex: 1,
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
  helperStack: {
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing.xs,
  },
});
