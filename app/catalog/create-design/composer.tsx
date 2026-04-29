import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppActionSheet } from '@/components/ui/AppActionSheet';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { OptionRow } from '@/components/ui/OptionRow';
import TagsApi from '@/src/api/TagsApi';
import { StableImage } from '@/components/ui/StableImage';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const PRIVACY_OPTIONS = [
  { value: 'PUBLIC', label: 'Everyone' },
  { value: 'PRIVATE', label: 'Only me' },
] as const;

const AUDIENCE_LABELS: Record<'EVERYBODY' | 'FEMALE' | 'MALE', string> = {
  EVERYBODY: 'Everybody',
  FEMALE: 'Women',
  MALE: 'Men',
};

const FIT_PREFERENCE_LABELS: Record<'SLIM' | 'REGULAR' | 'LOOSE' | 'OVERSIZED', string> = {
  SLIM: 'Slim',
  REGULAR: 'Regular',
  LOOSE: 'Loose',
  OVERSIZED: 'Oversized',
};

const TARGET_AGE_LABELS: Record<'ADULT' | 'CHILD', string> = {
  ADULT: 'Adult',
  CHILD: 'Child',
};

const SIZING_LABELS: Record<'NONE' | 'RTW' | 'CUSTOM' | 'RTW_PLUS_FITTINGS', string> = {
  NONE: 'No sizing info',
  RTW: 'RTW only',
  CUSTOM: 'Custom only',
  RTW_PLUS_FITTINGS: 'RTW + fittings',
};

function formatPriceSummary(minPrice: string, maxPrice: string) {
  if (minPrice && maxPrice) return `₦${minPrice} - ₦${maxPrice}`;
  if (minPrice) return `From ₦${minPrice}`;
  if (maxPrice) return `Up to ₦${maxPrice}`;
  return 'Not set';
}

function normalizeMentionsInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((entry) => entry.trim().replace(/^@/, ''))
        .filter(Boolean)
        .map((entry) => `@${entry}`),
    ),
  );
}

function mergeMentions(description: string, mentions: string[]) {
  const withoutMentions = description
    .split('\n')
    .filter((line) => !line.trim().startsWith('Mentions:'))
    .join('\n')
    .trim();
  if (mentions.length === 0) return withoutMentions;
  return [withoutMentions, `Mentions: ${mentions.join(' ')}`].filter(Boolean).join('\n\n');
}

export default function CreateDesignComposerScreen() {
  const {
    booting,
    assets,
    form,
    categories,
    selectedCategory,
    subCategories,
    filterDimensions,
    filterSelection,
    measurementPoints,
    customMeasurementKeys,
    updateField,
    toggleFilterValue,
    toggleMeasurementKey,
    moveAsset,
    removeAsset,
    pickMedia,
  } = useDesignEditor();
  const { theme } = useTheme();

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [subCategoryOpen, setSubCategoryOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [hashtagsOpen, setHashtagsOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mentionsDraft, setMentionsDraft] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const audienceLabel = AUDIENCE_LABELS[form.audience];
  const sizingLabel = SIZING_LABELS[form.sizingMode];
  const fitPreferenceLabel = FIT_PREFERENCE_LABELS[form.fitPreference];
  const targetAgeLabel = TARGET_AGE_LABELS[form.targetAgeGroup];
  const selectedSubCategory = subCategories.find((entry) => entry.id === form.subCategoryId) ?? null;
  const shouldShowMeasurementKeys =
    form.sizingMode === 'CUSTOM' || form.sizingMode === 'RTW_PLUS_FITTINGS' || form.customOrderEnabled;
  const locationDimension = filterDimensions.find((dimension) => dimension.slug === 'designer-location') ?? null;
  const locationValueIds = locationDimension ? filterSelection[locationDimension.id] ?? [] : [];
  const selectedLocation = locationDimension?.values.find((value) => locationValueIds.includes(value.id)) ?? null;
  const discoveryDimensions = filterDimensions.filter((dimension) => dimension.id !== locationDimension?.id);
  const selectedDiscoveryFilterCount = Object.entries(filterSelection).reduce((sum, [dimensionId, values]) => {
    if (locationDimension?.id === dimensionId) {
      return sum;
    }
    return sum + values.length;
  }, 0);

  const hashtagCount = useMemo(
    () => form.tagsInput.split(',').map((value) => value.trim()).filter(Boolean).length,
    [form.tagsInput],
  );
  useEffect(() => {
    if (!hashtagsOpen) {
      return;
    }

    let isActive = true;

    void TagsApi.getSuggestions(12)
      .then((items) => {
        if (isActive) {
          setTagSuggestions(items);
        }
      })
      .catch(() => {
        if (isActive) {
          setTagSuggestions([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [hashtagsOpen]);

  const canPreview =
    assets.length > 0 &&
    form.title.trim().length > 0 &&
    Boolean(form.categoryId) &&
    Boolean(form.subCategoryId) &&
    hashtagCount > 0;

  if (booting) {
    return <AppLoaderScreen message="Loading composer" />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/catalog/create-design" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Create design</AppText>
          <AppText variant="captionRegular" tone="muted">
            Edit the design details, then preview when the required fields are ready.
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.mediaSection}>
          <View style={styles.sectionTopRow}>
            <View style={styles.sectionTopCopy}>
              <AppText variant="bodyBold">Selected media</AppText>
              <AppText variant="captionRegular" tone="muted">
                The first item becomes the lead preview.
              </AppText>
            </View>
            <Button title="+" size="sm" variant="ghost" onPress={() => setMediaOpen(true)} />
          </View>

          {assets.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
              {assets.map((asset, index) => (
                <View key={asset.id} style={styles.assetCard}>
                  <StableImage uri={asset.remoteUrl ?? asset.uri} containerStyle={styles.assetPreview} imageStyle={styles.assetPreview} />
                  <View style={[styles.assetBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
                    <AppText variant="captionBold">{index === 0 ? 'Cover' : `#${index + 1}`}</AppText>
                  </View>
                  <View style={styles.assetActionRow}>
                    <Pressable onPress={() => moveAsset(asset.id, 'left')} disabled={index === 0}>
                      <AppText variant="captionBold" tone={index === 0 ? 'muted' : 'primary'}>←</AppText>
                    </Pressable>
                    <Pressable onPress={() => moveAsset(asset.id, 'right')} disabled={index === assets.length - 1}>
                      <AppText variant="captionBold" tone={index === assets.length - 1 ? 'muted' : 'primary'}>→</AppText>
                    </Pressable>
                    <Pressable onPress={() => removeAsset(asset.id)}>
                      <AppText variant="captionBold" tone="danger">Remove</AppText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyMedia}>
              <AppText variant="title">🖼️</AppText>
              <AppText variant="bodyBold">No media selected yet</AppText>
              <AppText variant="body" tone="muted" style={styles.centerText}>
                Add a photo or video first so the preview screen has something real to publish.
              </AppText>
            </View>
          )}
          </View>

        <View style={styles.copyBlock}>
          <Input
            label="Title"
            hideLabel
            variant="bare"
            value={form.title}
            onChangeText={(value) => updateField('title', value)}
            placeholder="Title"
            containerStyle={styles.copyField}
          />
          <View style={[styles.copyDivider, { backgroundColor: theme.colors.border }]} />
          <Input
            label="Description"
            hideLabel
            variant="bare"
            value={form.description}
            onChangeText={(value) => updateField('description', value)}
            placeholder="Description"
            multiline
            containerStyle={styles.copyField}
          />
          <View style={styles.quickChipRow}>
            <Button title={`# Hashtags${hashtagCount > 0 ? ` (${hashtagCount})` : ''}`} size="sm" variant="ghost" onPress={() => setHashtagsOpen(true)} />
            <Button title="@ Mention" size="sm" variant="ghost" onPress={() => {
              setMentionsDraft('');
              setMentionsOpen(true);
            }} />
          </View>
        </View>

        <Card padding="lg" style={[styles.formCard, { borderColor: theme.colors.border }]}>
          <OptionRow
            leading="🌍"
            title="Privacy"
            value={PRIVACY_OPTIONS.find((entry) => entry.value === form.visibility)?.label ?? 'Everyone'}
            onPress={() => setPrivacyOpen(true)}
          />
          <OptionRow
            leading="🏷️"
            title="Category"
            value={selectedCategory?.name ?? 'Select'}
            onPress={() => setCategoryOpen(true)}
          />
          <OptionRow
            leading="🧵"
            title="Sub-category"
            value={selectedSubCategory?.name ?? 'Select'}
            onPress={() => setSubCategoryOpen(true)}
          />
          <OptionRow
            leading="📍"
            title="Location"
            subtitle={locationDimension ? 'Control where this design shows up geographically.' : 'Designer location filters are not available yet.'}
            value={selectedLocation?.name ?? (locationDimension ? 'Select' : 'Unavailable')}
            disabled={!locationDimension}
            onPress={locationDimension ? () => setLocationOpen(true) : undefined}
          />
          <OptionRow
            leading="💸"
            title="Price"
            value={formatPriceSummary(form.minPrice, form.maxPrice)}
            onPress={() => setPriceOpen(true)}
          />
          <OptionRow
            leading="📦"
            title="Availability"
            subtitle={`${sizingLabel} · ${fitPreferenceLabel} · ${targetAgeLabel}`}
            value={form.customOrderEnabled ? 'Custom-ready' : 'Standard only'}
            onPress={() => setAvailabilityOpen(true)}
          />
          <OptionRow
            leading="⚙️"
            title="More options"
            subtitle={`${audienceLabel} audience · ${selectedDiscoveryFilterCount} discovery filter${selectedDiscoveryFilterCount === 1 ? '' : 's'}`}
            value="Open"
            divider={false}
            onPress={() => setMoreOptionsOpen(true)}
          />
        </Card>

        <Button title="Continue to preview" disabled={!canPreview} onPress={() => router.push('/catalog/create-design/preview' as any)} />
      </ScrollView>
      </KeyboardAvoidingView>

      <AppSelectSheet
        visible={privacyOpen}
        title="Privacy settings"
        subtitle="Choose who can view this design."
        options={PRIVACY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={form.visibility}
        onChange={(value) => updateField('visibility', value as 'PUBLIC' | 'PRIVATE')}
        onClose={() => setPrivacyOpen(false)}
      />

      <AppSelectSheet
        visible={categoryOpen}
        title="Category"
        subtitle="Pick the broad category first."
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
        value={form.categoryId}
        onChange={(value) => updateField('categoryId', value)}
        onClose={() => setCategoryOpen(false)}
      />

      <AppSelectSheet
        visible={locationOpen}
        title="Designer location"
        subtitle="Use one location so discovery filters stay consistent."
        options={(locationDimension?.values ?? []).map((value) => ({ value: value.id, label: value.name }))}
        value={locationValueIds[0] ?? ''}
        onChange={(value) => {
          if (!locationDimension) return;
          setLocationOpen(false);
          const currentValue = locationValueIds[0] ?? null;
          if (currentValue === value) {
            toggleFilterValue(locationDimension.id, value, false);
            return;
          }
          if (currentValue) {
            toggleFilterValue(locationDimension.id, currentValue, false);
          }
          toggleFilterValue(locationDimension.id, value, false);
        }}
        onClose={() => setLocationOpen(false)}
        emptyMessage="No location filters configured yet."
      />

      <AppSelectSheet
        visible={subCategoryOpen}
        title="Sub-category"
        subtitle="Refine where this design belongs."
        options={subCategories.map((category) => ({ value: category.id, label: category.name }))}
        value={form.subCategoryId}
        onChange={(value) => updateField('subCategoryId', value)}
        onClose={() => setSubCategoryOpen(false)}
        emptyMessage="Choose a category first."
      />

      <AppBottomSheet
        visible={hashtagsOpen}
        title="Hashtags"
        subtitle="Separate tags with commas so they stay searchable."
        onClose={() => setHashtagsOpen(false)}
        showCloseButton
      >
        {tagSuggestions.length > 0 ? (
          <View style={styles.suggestionWrap}>
            {tagSuggestions.map((tag) => {
              const hasTag = form.tagsInput
                .split(',')
                .map((value) => value.trim().toLowerCase())
                .includes(tag.toLowerCase());
              const nextTags = hasTag
                ? form.tagsInput
                : [form.tagsInput.trim(), tag].filter(Boolean).join(', ');

              return (
                <Chip
                  key={tag}
                  label={tag}
                  variant="default"
                  onPress={() => updateField('tagsInput', nextTags)}
                />
              );
            })}
          </View>
        ) : null}
        <Input
          label="Tags"
          value={form.tagsInput}
          onChangeText={(value) => updateField('tagsInput', value)}
          placeholder="bridal, asoebi, streetwear"
          multiline
        />
      </AppBottomSheet>

      <AppBottomSheet
        visible={mentionsOpen}
        title="Mentions"
        subtitle="Add usernames and they will be appended to the description."
        onClose={() => setMentionsOpen(false)}
        onDone={() => {
          const mentions = normalizeMentionsInput(mentionsDraft);
          updateField('description', mergeMentions(form.description, mentions));
          setMentionsOpen(false);
        }}
        doneLabel="Apply"
        showCloseButton
      >
        <Input
          label="Usernames"
          value={mentionsDraft}
          onChangeText={setMentionsDraft}
          placeholder="@stylecreator, @threadlybrand"
        />
      </AppBottomSheet>

      <AppBottomSheet
        visible={priceOpen}
        title="Price range"
        subtitle="Set the indicative range buyers will see."
        onClose={() => setPriceOpen(false)}
        showCloseButton
      >
        <View style={styles.priceRow}>
          <Input
            label="Minimum"
            value={form.minPrice}
            onChangeText={(value) => updateField('minPrice', value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.priceInput}
          />
          <Input
            label="Maximum"
            value={form.maxPrice}
            onChangeText={(value) => updateField('maxPrice', value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={styles.priceInput}
          />
        </View>
      </AppBottomSheet>

      <AppBottomSheet
        visible={availabilityOpen}
        title="Availability"
        subtitle="Keep custom-order readiness and fit expectations together."
        onClose={() => setAvailabilityOpen(false)}
        showCloseButton
      >
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <AppText variant="bodyBold">Enable custom orders</AppText>
            <AppText variant="captionRegular" tone="muted">
              Turn this on when the design can be requested as a custom job.
            </AppText>
          </View>
          <Switch value={form.customOrderEnabled} onValueChange={(value) => updateField('customOrderEnabled', value)} />
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Sizing mode</AppText>
          <View style={styles.sheetChipWrap}>
            {(['RTW_PLUS_FITTINGS', 'RTW', 'CUSTOM', 'NONE'] as const).map((value) => (
              <Chip
                key={value}
                label={SIZING_LABELS[value]}
                selected={form.sizingMode === value}
                onPress={() => updateField('sizingMode', value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Fit preference</AppText>
          <View style={styles.sheetChipWrap}>
            {(['SLIM', 'REGULAR', 'LOOSE', 'OVERSIZED'] as const).map((value) => (
              <Chip
                key={value}
                label={FIT_PREFERENCE_LABELS[value]}
                selected={form.fitPreference === value}
                onPress={() => updateField('fitPreference', value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Target age group</AppText>
          <View style={styles.sheetChipWrap}>
            {(['ADULT', 'CHILD'] as const).map((value) => (
              <Chip
                key={value}
                label={TARGET_AGE_LABELS[value]}
                selected={form.targetAgeGroup === value}
                onPress={() => updateField('targetAgeGroup', value)}
              />
            ))}
          </View>
        </View>

        {shouldShowMeasurementKeys ? (
          <View style={styles.sheetSection}>
            <AppText variant="bodyBold">Required measurement points</AppText>
            <View style={styles.sheetChipWrap}>
              {measurementPoints.map((point) => (
                <Chip
                  key={point.id}
                  label={point.label}
                  selected={customMeasurementKeys.includes(point.key)}
                  onPress={() => toggleMeasurementKey(point.key)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet
        visible={moreOptionsOpen}
        title="More options"
        subtitle="Keep audience and discovery tuning in one place."
        onClose={() => setMoreOptionsOpen(false)}
        showCloseButton
      >
        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Audience</AppText>
          <View style={styles.sheetChipWrap}>
            {(['EVERYBODY', 'FEMALE', 'MALE'] as const).map((value) => (
              <Chip
                key={value}
                label={AUDIENCE_LABELS[value]}
                selected={form.audience === value}
                onPress={() => updateField('audience', value)}
              />
            ))}
          </View>
        </View>
        {discoveryDimensions.map((dimension) => (
          <View key={dimension.id} style={styles.sheetSection}>
            <AppText variant="bodyBold">{dimension.name}</AppText>
            <View style={styles.sheetChipWrap}>
              {dimension.values.map((value) => (
                <Chip
                  key={value.id}
                  label={value.name}
                  selected={(filterSelection[dimension.id] ?? []).includes(value.id)}
                  onPress={() => toggleFilterValue(dimension.id, value.id, dimension.isMulti)}
                />
              ))}
            </View>
          </View>
        ))}
      </AppBottomSheet>

      <AppActionSheet
        visible={mediaOpen}
        title="Add media"
        subtitle="Choose how to attach the next asset."
        onClose={() => setMediaOpen(false)}
        options={[
          {
            key: 'camera',
            icon: '📷',
            title: 'Camera',
            description: 'Capture a new photo or video.',
            onPress: () => void pickMedia('camera'),
          },
          {
            key: 'media',
            icon: '🖼️',
            title: 'Media',
            description: 'Pick images or videos from your library.',
            onPress: () => void pickMedia('library'),
          },
          {
            key: 'attachment',
            icon: '📎',
            title: 'Attachment',
            description: 'Attach an existing photo or video from your device.',
            onPress: () => void pickMedia('library'),
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
  },
  mediaSection: {
    gap: tokens.spacing.md,
  },
  sectionTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  sectionTopCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  mediaActions: {
    gap: tokens.spacing.sm,
  },
  mediaStrip: {
    gap: tokens.spacing.sm,
  },
  assetCard: {
    width: 144,
    gap: tokens.spacing.sm,
  },
  assetPreview: {
    width: 144,
    height: 192,
    borderRadius: tokens.radius.xl,
  },
  assetBadge: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  assetActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  emptyMedia: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.lg,
  },
  formCard: {
    gap: tokens.spacing.md,
    borderWidth: 1,
  },
  copyBlock: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  copyField: {
    paddingVertical: tokens.spacing.xs,
  },
  copyDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  quickChipRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  priceInput: {
    flex: 1,
  },
  sheetSection: {
    gap: tokens.spacing.sm,
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  sheetChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
});
