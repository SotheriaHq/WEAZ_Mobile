import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppSelectSheet, type SelectSheetOption } from '@/components/ui/AppSelectSheet';
import { brandApi, type BrandProfileDto, type UpdateBrandProfilePayload } from '@/src/api/BrandApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  locationService,
  type CountryOption,
  type StateOption,
} from '@/src/services/locationService';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import {
  isEmptyPhone,
  isValidPhone,
  normalizePhoneToE164,
  PHONE_INVALID_MESSAGE,
  sanitizePhoneInput,
} from '@/src/utils/phoneNumber';

type LocationSheet = 'country' | 'state' | 'city' | null;

const LOCATION_LABELS = {
  country: 'Country',
  state: 'State / Province',
  city: 'City / LGA',
} as const;

function withCurrentOption(
  options: SelectSheetOption[],
  currentValue: string,
): SelectSheetOption[] {
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

function LocationSelectField({
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
    <View style={styles.locationField}>
      <AppText variant="captionBold" tone="muted">
        {label}
      </AppText>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.locationSelect,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          disabled && styles.locationSelectDisabled,
          pressed && !disabled && styles.locationSelectPressed,
        ]}
      >
        <AppText
          variant="body"
          tone={value ? 'default' : 'muted'}
          style={styles.locationSelectValue}
        >
          {value || placeholder}
        </AppText>
        <AppText variant="captionBold" tone={disabled ? 'muted' : 'primary'}>
          Choose
        </AppText>
      </Pressable>
    </View>
  );
}

interface EditBrandProfileSheetProps {
  visible: boolean;
  profile: BrandProfileDto | null;
  onClose: () => void;
  onSaved: (updated: BrandProfileDto) => void;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <AppText variant="caption" tone="muted" style={styles.sectionHeader}>
      {label}
    </AppText>
  );
}

function TagsInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const { theme } = useTheme();
  const [input, setInput] = useState('');

  const addTag = () => {
    const cleaned = input.trim().replace(/^#/, '');
    if (cleaned && !tags.includes(cleaned) && tags.length < 10) {
      onChange([...tags, cleaned]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((item) => item !== tag));
  };

  return (
    <View style={styles.tagsInputSection}>
      <View style={styles.tagsWrap}>
        {tags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => removeTag(tag)}
            style={[styles.tagChip, { backgroundColor: theme.colors.primarySoft }]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${tag}`}
          >
            <AppText variant="caption" tone="primary">
              #{tag}
            </AppText>
            <AppText variant="captionBold" tone="primary">
              x
            </AppText>
          </Pressable>
        ))}
      </View>
      {tags.length < 10 ? (
        <View style={styles.tagAddRow}>
          <Input
            label="Add tag"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={addTag}
            placeholder="Add tag"
            returnKeyType="done"
            blurOnSubmit={false}
            containerStyle={styles.tagInput}
          />
          <Button title="+" size="md" onPress={addTag} style={styles.tagAddButton} />
        </View>
      ) : null}
    </View>
  );
}

export function EditBrandProfileSheet({
  visible,
  profile,
  onClose,
  onSaved,
}: EditBrandProfileSheetProps) {
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();

  const [brandFullName, setBrandFullName] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [brandCity, setBrandCity] = useState('');
  const [brandState, setBrandState] = useState('');
  const [brandCountry, setBrandCountry] = useState('');
  const [brandTags, setBrandTags] = useState<string[]>([]);
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialFacebook, setSocialFacebook] = useState('');
  const [socialTwitter, setSocialTwitter] = useState('');
  const [socialWebsite, setSocialWebsite] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const [locationSheet, setLocationSheet] = useState<LocationSheet>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const slideY = useRef(new Animated.Value(800)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && profile) {
      setBrandFullName(profile.brandFullName ?? '');
      setBrandDescription(profile.brandDescription ?? '');
      setBusinessType(profile.businessType ?? '');
      setBrandCity(profile.brandCity ?? '');
      setBrandState(profile.brandState ?? '');
      setBrandCountry(profile.brandCountry ?? '');
      setBrandTags(profile.brandTags ?? []);
      setSocialInstagram(profile.socialInstagram ?? '');
      setSocialFacebook(profile.socialFacebook ?? '');
      setSocialTwitter(profile.socialTwitter ?? '');
      setSocialWebsite(profile.socialWebsite ?? '');
      setPhoneNumber(profile.phoneNumber ?? '');
      setLocationSheet(null);

      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          damping: 24,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 800,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, profile, backdropOpacity, slideY]);

  // Load countries when sheet opens (same service as catalog edit-profile)
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLocationLoading(true);
    setLocationError(null);
    void locationService.getCountries().then((nextCountries) => {
      if (cancelled) return;
      setCountries(nextCountries);
      if (nextCountries.length === 0) {
        setLocationError('Location options are unavailable. Your saved location is preserved.');
      }
      setLocationLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Cascade states when country changes
  useEffect(() => {
    const country = brandCountry.trim();
    if (!visible || !country) {
      setStates([]);
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
  }, [brandCountry, visible]);

  // Cascade cities / LGAs when state changes
  useEffect(() => {
    const country = brandCountry.trim();
    const state = brandState.trim();
    if (!visible || !country || !state) {
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
  }, [brandCountry, brandState, visible]);

  const countryOptions = useMemo(
    () =>
      withCurrentOption(
        countries.map((country) => ({ label: country.name, value: country.name })),
        brandCountry,
      ),
    [countries, brandCountry],
  );
  const stateOptions = useMemo(
    () =>
      withCurrentOption(
        states.map((state) => ({ label: state.name, value: state.name })),
        brandState,
      ),
    [states, brandState],
  );
  const cityOptions = useMemo(
    () =>
      withCurrentOption(
        cities.map((city) => ({ label: city, value: city })),
        brandCity,
      ),
    [cities, brandCity],
  );

  if (!visible) return null;

  const canSave = Boolean(profile?.id) && !saving;

  const handleSave = async () => {
    if (!profile?.id || saving) return;

    const resolvedBrandFullName = brandFullName.trim() || profile.brandFullName?.trim() || '';
    if (!resolvedBrandFullName) {
      toast.error('Brand name is required.');
      return;
    }

    const rawPhone = phoneNumber.trim();
    if (!isEmptyPhone(rawPhone) && !isValidPhone(rawPhone)) {
      toast.error(PHONE_INVALID_MESSAGE);
      return;
    }

    setSaving(true);

    const payload: UpdateBrandProfilePayload = {
      brandFullName: resolvedBrandFullName,
      brandDescription: brandDescription.trim() || undefined,
      businessType: businessType.trim() || undefined,
      brandCity: brandCity.trim() || undefined,
      brandState: brandState.trim() || undefined,
      brandCountry: brandCountry.trim() || undefined,
      brandTags,
      socialInstagram: socialInstagram.trim() || undefined,
      socialFacebook: socialFacebook.trim() || undefined,
      socialTwitter: socialTwitter.trim() || undefined,
      socialWebsite: socialWebsite.trim() || undefined,
      phoneNumber: isEmptyPhone(rawPhone)
        ? undefined
        : (normalizePhoneToE164(rawPhone) ?? undefined),
    };

    try {
      const updated = await brandApi.updateProfile(profile.id, payload);
      if (!updated) {
        toast.error('Update failed. Please try again.');
        return;
      }

      updateUser({
        firstName: updated.firstName ?? user?.firstName,
        lastName: updated.lastName ?? user?.lastName,
        username: updated.username ?? user?.username,
        brandFullName: updated.brandFullName ?? user?.brandFullName,
        brandDescription: updated.brandDescription ?? updated.description ?? user?.brandDescription,
        brandCountry: updated.brandCountry ?? updated.country ?? user?.brandCountry,
        brandState: updated.brandState ?? updated.state ?? user?.brandState,
        brandCity: updated.brandCity ?? updated.city ?? user?.brandCity,
        brandTags: updated.brandTags ?? user?.brandTags ?? [],
        brandBusinessType: updated.businessType ?? user?.brandBusinessType,
        socialInstagram: updated.socialInstagram ?? user?.socialInstagram,
        socialFacebook: updated.socialFacebook ?? user?.socialFacebook,
        socialTwitter: updated.socialTwitter ?? user?.socialTwitter,
        socialWebsite: updated.socialWebsite ?? user?.socialWebsite,
        phoneNumber: updated.phoneNumber ?? user?.phoneNumber,
        profileImage: updated.profileImage ?? user?.profileImage,
        profileImageId: updated.profileImageId ?? user?.profileImageId,
        profileImageFile: updated.profileImageFile ?? user?.profileImageFile,
        bannerImage: updated.bannerImage ?? user?.bannerImage,
        bannerImageId: updated.bannerImageId ?? user?.bannerImageId,
        bannerImageFile: updated.bannerImageMeta
          ? {
              id: updated.bannerImageMeta.id ?? null,
              s3Url: updated.bannerImageMeta.s3Url ?? null,
              url: updated.bannerImageMeta.url ?? null,
            }
          : user?.bannerImageFile,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Profile updated!');
      onSaved(updated);
      onClose();
    } catch {
      toast.error('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay, opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        <Animated.View
          style={styles.handleWrap}
          {...PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderRelease: (_, gesture) => {
              if (gesture.dy > 50 || gesture.vy > 1.5) {
                onClose();
              }
            },
          }).panHandlers}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        </Animated.View>

        <KeyboardAwareFormScroll
          style={styles.keyboardRoot}
          contentContainerStyle={styles.scrollContent}
        >
            <AppText variant="title">Edit Brand Profile</AppText>
            <AppText variant="caption" tone="muted" style={styles.subtitle}>
              Update your brand information visible to shoppers
            </AppText>

            <View style={styles.formStack}>
              <SectionHeader label="Brand identity" />
              <Input
                label="Brand Name *"
                value={brandFullName}
                onChangeText={setBrandFullName}
                placeholder="Your brand name"
                returnKeyType="next"
                maxLength={80}
              />
              <Input
                label={`Bio / Description (${brandDescription.length}/280)`}
                value={brandDescription}
                onChangeText={(value) => setBrandDescription(value.slice(0, 280))}
                placeholder="Tell shoppers your brand story..."
                multiline
                numberOfLines={4}
                maxLength={280}
              />
              <Input
                label="Business Type"
                value={businessType}
                onChangeText={setBusinessType}
                placeholder="e.g. Ready-to-Wear, Couture, Accessories"
                returnKeyType="next"
              />

              <SectionHeader label="Location" />
              <LocationSelectField
                label={LOCATION_LABELS.country}
                value={getOptionLabel(countryOptions, brandCountry)}
                placeholder="Select country"
                onPress={() => setLocationSheet('country')}
              />
              <LocationSelectField
                label={LOCATION_LABELS.state}
                value={getOptionLabel(stateOptions, brandState)}
                placeholder={brandCountry ? 'Select state / province' : 'Select country first'}
                onPress={() => setLocationSheet('state')}
                disabled={!brandCountry.trim()}
              />
              <LocationSelectField
                label={LOCATION_LABELS.city}
                value={getOptionLabel(cityOptions, brandCity)}
                placeholder={brandState ? 'Select city / LGA' : 'Select state first'}
                onPress={() => setLocationSheet('city')}
                disabled={!brandState.trim()}
              />
              {locationError ? (
                <AppText variant="caption" tone="warning">
                  {locationError}
                </AppText>
              ) : null}

              <SectionHeader label="Specialties (max 10)" />
              <TagsInput tags={brandTags} onChange={setBrandTags} />

              <SectionHeader label="Social links" />
              <Input
                label="Instagram"
                value={socialInstagram}
                onChangeText={setSocialInstagram}
                placeholder="@yourbrand or https://instagram.com/..."
                returnKeyType="next"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Input
                label="Facebook"
                value={socialFacebook}
                onChangeText={setSocialFacebook}
                placeholder="https://facebook.com/..."
                returnKeyType="next"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Input
                label="Twitter / X"
                value={socialTwitter}
                onChangeText={setSocialTwitter}
                placeholder="@yourbrand or https://x.com/..."
                returnKeyType="next"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Input
                label="Website"
                value={socialWebsite}
                onChangeText={setSocialWebsite}
                placeholder="https://yourbrand.com"
                returnKeyType="next"
                autoCapitalize="none"
                keyboardType="url"
              />

              <SectionHeader label="Contact" />
              <Input
                label="Phone"
                value={phoneNumber}
                onChangeText={(value) => setPhoneNumber(sanitizePhoneInput(value))}
                placeholder="080XXXXXXXX or +234..."
                returnKeyType="done"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.actions}>
              <Button title="Cancel" variant="outline" size="md" onPress={onClose} disabled={saving} style={styles.actionButton} />
              <Button
                title="Save Changes"
                variant="primary"
                size="md"
                onPress={handleSave}
                loading={saving}
                disabled={!canSave}
                style={styles.saveButton}
              />
            </View>
        </KeyboardAwareFormScroll>
      </Animated.View>

      <AppSelectSheet
        visible={locationSheet === 'country'}
        title={LOCATION_LABELS.country}
        subtitle="Choose the country shown on your public brand profile."
        options={countryOptions}
        value={brandCountry.trim() || null}
        loading={locationLoading && countries.length === 0}
        emptyMessage="No countries available right now."
        onChange={(value) => {
          setBrandCountry(value);
          setBrandState('');
          setBrandCity('');
        }}
        onClose={() => setLocationSheet(null)}
      />
      <AppSelectSheet
        visible={locationSheet === 'state'}
        title={LOCATION_LABELS.state}
        subtitle="Choose the state or province for this brand."
        options={stateOptions}
        value={brandState.trim() || null}
        loading={locationLoading && states.length === 0}
        emptyMessage="No states available for the selected country."
        onChange={(value) => {
          setBrandState(value);
          setBrandCity('');
        }}
        onClose={() => setLocationSheet(null)}
      />
      <AppSelectSheet
        visible={locationSheet === 'city'}
        title={LOCATION_LABELS.city}
        subtitle="Choose the city or LGA for this brand."
        options={cityOptions}
        value={brandCity.trim() || null}
        loading={locationLoading && cities.length === 0}
        emptyMessage="No cities available for the selected state."
        onChange={setBrandCity}
        onClose={() => setLocationSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderTopWidth: 1,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 32,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: tokens.radius.full,
  },
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: tokens.spacing.xl2,
    paddingBottom: tokens.spacing['3xl'],
    paddingTop: tokens.spacing.sm,
  },
  subtitle: {
    marginTop: tokens.spacing.xs,
  },
  formStack: {
    gap: tokens.spacing.xl2,
    marginTop: tokens.spacing.xl2,
  },
  sectionHeader: {
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: -tokens.spacing.md,
  },
  locationField: {
    gap: tokens.spacing.xs,
  },
  locationSelect: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  locationSelectDisabled: {
    opacity: 0.56,
  },
  locationSelectPressed: {
    opacity: 0.88,
  },
  locationSelectValue: {
    flex: 1,
    flexShrink: 1,
  },
  tagsInputSection: {
    gap: tokens.spacing.sm,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    minHeight: 36,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.full,
  },
  tagAddRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
  },
  tagInput: {
    flex: 1,
  },
  tagAddButton: {
    width: 44,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing['2xl'],
  },
  actionButton: {
    flex: 1,
  },
  saveButton: {
    flex: 2,
  },
});

export default EditBrandProfileSheet;
