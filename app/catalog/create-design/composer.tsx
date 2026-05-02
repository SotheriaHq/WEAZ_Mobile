import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppActionSheet } from '@/components/ui/AppActionSheet';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppMultiSelectSheet, AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ComposerSection } from '@/components/ui/ComposerSection';
import { Input } from '@/components/ui/Input';
import { OptionRow } from '@/components/ui/OptionRow';
import { RequiredFieldLabel } from '@/components/ui/RequiredFieldLabel';
import { StableImage } from '@/components/ui/StableImage';
import TagsApi from '@/src/api/TagsApi';
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
  if (minPrice && maxPrice) return `NGN ${minPrice} - NGN ${maxPrice}`;
  if (minPrice) return `From NGN ${minPrice}`;
  if (maxPrice) return `Up to NGN ${maxPrice}`;
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
  const { source: routeSourceParam } = useLocalSearchParams<{ source?: string | string[] }>();
  const {
    booting,
    assets,
    form,
    categories,
    selectedCategory,
    filterDimensions,
    filterSelection,
    measurementPoints,
    customOrderConfigurations,
    selectedCustomOrderConfigurationId,
    customMeasurementKeys,
    permissionIssue,
    updateField,
    toggleFilterValue,
    selectCustomOrderConfiguration,
    moveAsset,
    removeAsset,
    pickMedia,
    clearPermissionIssue,
    openMediaPermissionSettings,
  } = useDesignEditor();
  const { theme } = useTheme();
  const autoLaunchRef = useRef(false);

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [subcategoryOpen, setSubcategoryOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [customOrdersOpen, setCustomOrdersOpen] = useState(false);
  const [customOrderConfigOpen, setCustomOrderConfigOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mentionsDraft, setMentionsDraft] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const routeSource = Array.isArray(routeSourceParam) ? routeSourceParam[0] : routeSourceParam;
  const normalizedSource = routeSource === 'camera' || routeSource === 'library' ? routeSource : null;
  const audienceLabel = AUDIENCE_LABELS[form.audience];
  const sizingLabel = SIZING_LABELS[form.sizingMode];
  const fitPreferenceLabel = FIT_PREFERENCE_LABELS[form.fitPreference];
  const targetAgeLabel = TARGET_AGE_LABELS[form.targetAgeGroup];
  const selectedSubCategory =
    selectedCategory?.subCategories.find((entry) => entry.id === form.subCategoryId) ?? null;
  const selectedCustomOrderConfiguration =
    customOrderConfigurations.find((entry) => entry.id === selectedCustomOrderConfigurationId) ?? null;
  const hasCustomOrderConfigurations = customOrderConfigurations.length > 0;

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );

  const subcategoryOptions = useMemo(
    () =>
      selectedCategory
        ? selectedCategory.subCategories.map((subCategory) => ({
            value: subCategory.id,
            label: subCategory.name,
          }))
        : [],
    [selectedCategory],
  );

  const locationDimension = filterDimensions.find((dimension) => dimension.slug === 'designer-location') ?? null;
  const locationValueIds = locationDimension ? filterSelection[locationDimension.id] ?? [] : [];
  const selectedLocation = locationDimension?.values.find((value) => locationValueIds.includes(value.id)) ?? null;
  const discoveryDimensions = filterDimensions.filter((dimension) => dimension.id !== locationDimension?.id);
  const selectedDiscoveryFilterCount = Object.entries(filterSelection).reduce((sum, [dimensionId, values]) => {
    if (locationDimension?.id === dimensionId) return sum;
    return sum + values.length;
  }, 0);

  const selectedTags = useMemo(
    () =>
      Array.from(
        new Set(
          form.tagsInput
            .split(',')
            .map((value) => value.trim().replace(/^#/, ''))
            .filter(Boolean),
        ),
      ),
    [form.tagsInput],
  );
  const tagOptions = useMemo(
    () =>
      Array.from(new Set([...tagSuggestions, ...selectedTags]))
        .filter(Boolean)
        .map((tag) => ({ value: tag, label: `#${tag}` })),
    [selectedTags, tagSuggestions],
  );
  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (assets.length === 0) missing.push('Media');
    if (form.title.trim().length === 0) missing.push('Title');
    if (!form.categoryId || !form.subCategoryId) missing.push('Category');
    if (selectedTags.length === 0) missing.push('Tags');
    if (form.customOrderEnabled && !selectedCustomOrderConfigurationId) missing.push('Custom order configuration');
    if (form.customOrderEnabled && customMeasurementKeys.length === 0) missing.push('Custom order fields');
    return missing;
  }, [
    assets.length,
    customMeasurementKeys.length,
    form.categoryId,
    form.customOrderEnabled,
    form.subCategoryId,
    form.title,
    selectedCustomOrderConfigurationId,
    selectedTags.length,
  ]);
  const canPreview = missingRequiredFields.length === 0;

  const customOrderFieldOptions = useMemo(() => {
    const pointByKey = new Map(measurementPoints.map((point) => [point.key, point]));
    return customMeasurementKeys.map((key) => {
      const point = pointByKey.get(key);
      return {
        key,
        label:
          point?.label ??
          key
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase()),
      };
    });
  }, [customMeasurementKeys, measurementPoints]);

  const handlePickMedia = useCallback(
    async (source: 'camera' | 'library') => {
      await pickMedia(source);
    },
    [pickMedia],
  );

  useEffect(() => {
    if (!tagsOpen) return;
    let isActive = true;

    void TagsApi.getSuggestions(24)
      .then((items) => {
        if (isActive) setTagSuggestions(items);
      })
      .catch(() => {
        if (isActive) setTagSuggestions([]);
      });

    return () => {
      isActive = false;
    };
  }, [tagsOpen]);

  useEffect(() => {
    if (booting || !normalizedSource || autoLaunchRef.current || assets.length > 0) return;
    autoLaunchRef.current = true;
    void pickMedia(normalizedSource);
  }, [assets.length, booting, normalizedSource, pickMedia]);

  if (booting) {
    return <AppLoaderScreen message="Loading composer" />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/catalog" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Create design</AppText>
          <AppText variant="captionRegular" tone="muted">
            Edit the required fields, then preview.
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ComposerSection
            title={assets.length > 0 ? 'Selected media' : 'Start with media'}
            subtitle={assets.length > 0 ? 'The first item becomes the lead preview.' : 'Capture a new design or select media from your device.'}
          >
            {assets.length > 0 ? (
              <>
                <View style={styles.sectionTopRow}>
                  <AppText variant="captionRegular" tone="muted">
                    {assets.length} selected asset{assets.length === 1 ? '' : 's'}
                  </AppText>
                  <Button title="+" size="sm" variant="ghost" onPress={() => setMediaOpen(true)} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                  {assets.map((asset, index) => (
                    <View key={asset.id} style={styles.assetCard}>
                      <StableImage uri={asset.remoteUrl ?? asset.uri} containerStyle={styles.assetPreview} imageStyle={styles.assetPreview} />
                      <View style={[styles.assetBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
                        <AppText variant="captionBold">{index === 0 ? 'Cover' : `#${index + 1}`}</AppText>
                      </View>
                      <View style={styles.assetActionRow}>
                        <Pressable onPress={() => moveAsset(asset.id, 'left')} disabled={index === 0}>
                          <AppText variant="captionBold" tone={index === 0 ? 'muted' : 'primary'}>Left</AppText>
                        </Pressable>
                        <Pressable onPress={() => moveAsset(asset.id, 'right')} disabled={index === assets.length - 1}>
                          <AppText variant="captionBold" tone={index === assets.length - 1 ? 'muted' : 'primary'}>Right</AppText>
                        </Pressable>
                        <Pressable onPress={() => removeAsset(asset.id)}>
                          <AppText variant="captionBold" tone="danger">Remove</AppText>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : (
              <View style={styles.emptyStage}>
                <View style={[styles.emptyStageIcon, { backgroundColor: theme.colors.primarySoft }]}>
                  <AppText variant="title" tone="primary">+</AppText>
                </View>
                <AppText variant="bodyBold">No media selected yet</AppText>
                <AppText variant="body" tone="muted" style={styles.centerText}>
                  Add media first so the composer and preview use a real design asset.
                </AppText>
                <View style={styles.emptyStageActions}>
                  <Button title="Camera" variant="secondary" onPress={() => void handlePickMedia('camera')} />
                  <Button title="Select from library" onPress={() => void handlePickMedia('library')} />
                </View>
              </View>
            )}
          </ComposerSection>

          {assets.length > 0 ? (
            <>
              <View style={styles.copyBlock}>
                <RequiredFieldLabel required>Title</RequiredFieldLabel>
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
                <RequiredFieldLabel>Description</RequiredFieldLabel>
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
                  <Button
                    title={`# Tags${selectedTags.length > 0 ? ` (${selectedTags.length})` : ' (Required)'}`}
                    size="sm"
                    variant="ghost"
                    onPress={() => setTagsOpen(true)}
                  />
                  <Button
                    title="@ Mention"
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setMentionsDraft('');
                      setMentionsOpen(true);
                    }}
                  />
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
                  subtitle="Choose the main category."
                  value={selectedCategory?.name ?? 'Select category'}
                  onPress={() => setCategoryOpen(true)}
                />
                <OptionRow
                  title="Subcategory"
                  subtitle="Choose a subcategory within the selected category."
                  value={selectedSubCategory?.name ?? 'Select subcategory'}
                  disabled={!selectedCategory}
                  onPress={selectedCategory ? () => setSubcategoryOpen(true) : undefined}
                />
                <OptionRow
                  leading="📍"
                  title="Location"
                  subtitle={locationDimension ? 'Control where this design shows geographically.' : 'Designer location filters are not available yet.'}
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
                  value="Open"
                  onPress={() => setAvailabilityOpen(true)}
                />
                <OptionRow
                  leading="🧵"
                  title="Custom orders"
                  subtitle={
                    form.customOrderEnabled
                      ? selectedCustomOrderConfiguration
                        ? `${selectedCustomOrderConfiguration.title} · ${customMeasurementKeys.length} field${customMeasurementKeys.length === 1 ? '' : 's'}`
                        : 'Configuration required'
                      : 'Off'
                  }
                  value={form.customOrderEnabled ? 'Enabled' : 'Disabled'}
                  onPress={() => setCustomOrdersOpen(true)}
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

              {missingRequiredFields.length > 0 ? (
                <Card padding="md" style={[styles.requiredCard, { borderColor: theme.colors.border }]}>
                  <AppText variant="bodyBold">Required before preview</AppText>
                  <AppText variant="captionRegular" tone="muted">
                    Missing: {missingRequiredFields.join(', ')}
                  </AppText>
                </Card>
              ) : null}

              <Button title="Preview" disabled={!canPreview} onPress={() => router.push('/catalog/create-design/preview' as any)} />
            </>
          ) : null}
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
        subtitle="Pick the main category."
        options={categoryOptions}
        value={form.categoryId}
        onChange={(value) => {
          updateField('categoryId', value);
          updateField('subCategoryId', ''); // clear subcategory
        }}
        onClose={() => setCategoryOpen(false)}
        emptyMessage="No categories are configured yet."
      />

      <AppSelectSheet
        visible={subcategoryOpen}
        title="Subcategory"
        subtitle="Pick a subcategory within the selected category."
        options={subcategoryOptions}
        value={form.subCategoryId}
        onChange={(value) => updateField('subCategoryId', value)}
        onClose={() => setSubcategoryOpen(false)}
        emptyMessage="No subcategories available."
      />

      <AppSelectSheet
        visible={locationOpen}
        title="Designer location"
        subtitle="Use one location so discovery filters stay consistent."
        options={(locationDimension?.values ?? []).map((value) => ({ value: value.id, label: value.name }))}
        value={locationValueIds[0] ?? ''}
        onChange={(value) => {
          if (!locationDimension) return;
          const currentValue = locationValueIds[0] ?? null;
          if (currentValue === value) {
            toggleFilterValue(locationDimension.id, value, false);
            return;
          }
          if (currentValue) toggleFilterValue(locationDimension.id, currentValue, false);
          toggleFilterValue(locationDimension.id, value, false);
        }}
        onClose={() => setLocationOpen(false)}
        emptyMessage="No location filters configured yet."
      />

      <AppMultiSelectSheet
        visible={tagsOpen}
        title="Tags"
        subtitle="Choose existing tags or add your own."
        options={tagOptions}
        values={selectedTags}
        onChange={(values) => updateField('tagsInput', values.join(', '))}
        onClose={() => setTagsOpen(false)}
        emptyMessage="No suggestions found. Type a tag and tap Add."
        maxSelected={10}
      />

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
        subtitle="Set sizing and fit expectations."
        onClose={() => setAvailabilityOpen(false)}
        showCloseButton
      >
        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Sizing mode</AppText>
          <View style={styles.sheetChipWrap}>
            {(['RTW_PLUS_FITTINGS', 'RTW', 'CUSTOM', 'NONE'] as const).map((value) => (
              <Chip key={value} label={SIZING_LABELS[value]} selected={form.sizingMode === value} onPress={() => updateField('sizingMode', value)} />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Fit preference</AppText>
          <View style={styles.sheetChipWrap}>
            {(['SLIM', 'REGULAR', 'LOOSE', 'OVERSIZED'] as const).map((value) => (
              <Chip key={value} label={FIT_PREFERENCE_LABELS[value]} selected={form.fitPreference === value} onPress={() => updateField('fitPreference', value)} />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Target age group</AppText>
          <View style={styles.sheetChipWrap}>
            {(['ADULT', 'CHILD'] as const).map((value) => (
              <Chip key={value} label={TARGET_AGE_LABELS[value]} selected={form.targetAgeGroup === value} onPress={() => updateField('targetAgeGroup', value)} />
            ))}
          </View>
        </View>
      </AppBottomSheet>

      <AppBottomSheet
        visible={customOrdersOpen}
        title="Custom orders"
        subtitle="Expose every required field buyers must provide."
        onClose={() => setCustomOrdersOpen(false)}
        showCloseButton
      >
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <AppText variant="bodyBold">Accept custom orders</AppText>
            <AppText variant="captionRegular" tone="muted">
              Buyers can request this design as a custom job.
            </AppText>
          </View>
          <Switch
            value={form.customOrderEnabled && hasCustomOrderConfigurations}
            disabled={!hasCustomOrderConfigurations}
            onValueChange={(value) => {
              if (!hasCustomOrderConfigurations) {
                updateField('customOrderEnabled', false);
                return;
              }
              updateField('customOrderEnabled', value);
              if (value && !selectedCustomOrderConfigurationId && customOrderConfigurations[0]) {
                selectCustomOrderConfiguration(customOrderConfigurations[0].id);
              }
            }}
          />
        </View>

        {!hasCustomOrderConfigurations ? (
          <Card padding="md" style={[styles.requiredCard, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Custom-order setup required</AppText>
            <AppText variant="captionRegular" tone="muted">
              Set up custom order options before enabling custom orders for this design.
            </AppText>
          </Card>
        ) : null}

        {form.customOrderEnabled && hasCustomOrderConfigurations ? (
          <View style={styles.sheetSection}>
            <OptionRow
              title="Configuration"
              subtitle={
                hasCustomOrderConfigurations
                  ? 'Choose custom order settings.'
                  : 'No configurations are available.'
              }
              value={selectedCustomOrderConfiguration?.title ?? 'Select'}
              disabled={!hasCustomOrderConfigurations}
              onPress={hasCustomOrderConfigurations ? () => setCustomOrderConfigOpen(true) : undefined}
            />
            <RequiredFieldLabel required>Required custom-order fields</RequiredFieldLabel>
            <AppText variant="captionRegular" tone="muted">
              These fields come from the selected custom-order configuration.
            </AppText>
            <View style={styles.sheetChipWrap}>
              {customOrderFieldOptions.length > 0 ? customOrderFieldOptions.map((point) => (
                <Chip
                  key={point.key}
                  label={point.label}
                  selected
                  disabled
                />
              )) : (
                <AppText variant="body" tone="muted">
                  Select a configuration to load its required fields.
                </AppText>
              )}
            </View>
            <Input
              label="Production time"
              value={form.productionLeadDays}
              onChangeText={(value) => updateField('productionLeadDays', value.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              placeholder="14"
              helperText="Days to produce the custom order."
            />
            <Input
              label="Additional instructions"
              value={form.buyerInstructionText}
              onChangeText={(value) => updateField('buyerInstructionText', value)}
              multiline
              placeholder="Any special instructions for buyers..."
            />
          </View>
        ) : null}
      </AppBottomSheet>

      <AppSelectSheet
        visible={customOrderConfigOpen}
        title="Custom-order configuration"
        subtitle="Choose custom order settings."
        options={customOrderConfigurations.map((configuration) => ({
          value: configuration.id,
          label: configuration.title,
          description: `${configuration.resolvedRequiredMeasurementKeys.length} field${configuration.resolvedRequiredMeasurementKeys.length === 1 ? '' : 's'}`,
        }))}
        value={selectedCustomOrderConfigurationId}
        onChange={(value) => selectCustomOrderConfiguration(value)}
        onClose={() => setCustomOrderConfigOpen(false)}
        emptyMessage="No custom order configurations are available."
      />

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
              <Chip key={value} label={AUDIENCE_LABELS[value]} selected={form.audience === value} onPress={() => updateField('audience', value)} />
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
            onPress: () => void handlePickMedia('camera'),
          },
          {
            key: 'media',
            icon: '🖼️',
            title: 'Media',
            description: 'Pick images or videos from your library.',
            onPress: () => void handlePickMedia('library'),
          },
          {
            key: 'attachment',
            icon: '📎',
            title: 'Attachment',
            description: 'Attach an existing photo or video from your device.',
            onPress: () => void handlePickMedia('library'),
          },
        ]}
      />

      <AppBottomSheet
        visible={Boolean(permissionIssue)}
        title={permissionIssue?.title}
        subtitle={permissionIssue?.message}
        onClose={clearPermissionIssue}
        showCloseButton
        footer={
          <View style={styles.permissionActions}>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => {
                const source = permissionIssue?.source;
                clearPermissionIssue();
                if (source) void handlePickMedia(source);
              }}
            />
            <Button title="Open settings" onPress={() => void openMediaPermissionSettings()} />
          </View>
        }
      >
        <AppText variant="body" tone="muted">
          You can close this sheet and tap Camera or Select from library again at any time.
        </AppText>
      </AppBottomSheet>
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
  sectionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
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
  emptyStage: {
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
  },
  emptyStageIcon: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStageActions: {
    alignSelf: 'stretch',
    gap: tokens.spacing.sm,
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
  requiredCard: {
    gap: tokens.spacing.xs,
    borderWidth: 1,
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
  permissionActions: {
    gap: tokens.spacing.sm,
  },
});
