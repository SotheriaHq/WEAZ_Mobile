import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppFloatingMenu } from '@/components/ui/AppFloatingMenu';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppMultiSelectSheet, AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { OptionRow } from '@/components/ui/OptionRow';
import { RequiredFieldLabel } from '@/components/ui/RequiredFieldLabel';
import { StableImage } from '@/components/ui/StableImage';
import TagsApi from '@/src/api/TagsApi';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import {
  DESIGN_AUDIENCE_LABELS,
  DESIGN_EDITOR_MAX_MEDIA,
  DESIGN_FIT_PREFERENCE_LABELS,
  DESIGN_MEDIA_SLOTS,
  DESIGN_REQUIRED_MEDIA_COUNT,
  DESIGN_SIZING_LABELS,
  DESIGN_TARGET_AGE_LABELS,
  DESIGN_VISIBILITY_LABELS,
} from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const PRIVACY_OPTIONS = [
  { value: 'PUBLIC', label: DESIGN_VISIBILITY_LABELS.PUBLIC },
  { value: 'PRIVATE', label: DESIGN_VISIBILITY_LABELS.PRIVATE },
] as const;

function formatPriceSummary(minPrice: string, maxPrice: string) {
  if (minPrice && maxPrice) return `NGN ${minPrice} - NGN ${maxPrice}`;
  if (minPrice) return `From NGN ${minPrice}`;
  if (maxPrice) return `Up to NGN ${maxPrice}`;
  return 'Not set';
}

export default function CreateDesignComposerScreen() {
  const {
    booting,
    assets,
    coverAssetId,
    form,
    categories,
    selectedCategory,
    subCategories,
    filterDimensions,
    filterSelection,
    measurementPoints,
    customMeasurementKeys,
    permissionIssue,
    updateField,
    toggleFilterValue,
    toggleMeasurementKey,
    removeAsset,
    setCoverAssetId,
    save,
    saveState,
    canSaveDraft,
    isEditMode,
    pickMedia,
    clearPermissionIssue,
    openMediaPermissionSettings,
  } = useDesignEditor();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const plusRef = useRef<View>(null);
  const hasEverHadAssetsRef = useRef(false);

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [customOrdersOpen, setCustomOrdersOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [categoryStep, setCategoryStep] = useState<'category' | 'subcategory'>('category');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftSubCategoryId, setDraftSubCategoryId] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<{ name: string; usageCount: number }[]>([]);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);

  const audienceLabel = DESIGN_AUDIENCE_LABELS[form.audience];
  const sizingLabel = DESIGN_SIZING_LABELS[form.sizingMode];
  const fitPreferenceLabel = DESIGN_FIT_PREFERENCE_LABELS[form.fitPreference];
  const targetAgeLabel = DESIGN_TARGET_AGE_LABELS[form.targetAgeGroup];
  const selectedSubCategory =
    selectedCategory?.subCategories.find((entry) => entry.id === form.subCategoryId) ?? null;
  const categoryValue = selectedCategory && selectedSubCategory
    ? `${selectedCategory.name} / ${selectedSubCategory.name}`
    : selectedCategory?.name ?? 'Select category';

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );
  const draftSelectedCategory = useMemo(
    () => categories.find((entry) => entry.id === draftCategoryId) ?? null,
    [categories, draftCategoryId],
  );
  const draftSubCategories = draftSelectedCategory?.subCategories ?? [];

  const discoveryDimensions = filterDimensions;
  const selectedDiscoveryFilterCount = Object.entries(filterSelection).reduce((sum, [dimensionId, values]) => {
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
      tagSuggestions
        .filter((tag) => !selectedTags.includes(tag.name))
        .map((tag) => ({ value: tag.name, label: `#${tag.name}`, usageCount: tag.usageCount })),
    [selectedTags, tagSuggestions],
  );
  const priceError = useMemo(() => {
    if (!form.minPrice || !form.maxPrice) return null;
    const min = Number(form.minPrice);
    const max = Number(form.maxPrice);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return max < min ? 'Maximum price must be greater than or equal to minimum price.' : null;
  }, [form.maxPrice, form.minPrice]);
  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (assets.length === 0) missing.push('Media');
    if (assets.length > 0 && assets.length < DESIGN_REQUIRED_MEDIA_COUNT) missing.push('Front, Back, Left, Right media');
    if (form.title.trim().length === 0) missing.push('Title');
    if (!form.categoryId || !form.subCategoryId) missing.push('Category');
    if (selectedTags.length === 0) missing.push('Tags');
    if (form.customOrderEnabled && customMeasurementKeys.length === 0) missing.push('Custom order fields');
    if (form.customOrderEnabled && (!form.baseProductionCharge || !form.fabricCostPerYard)) missing.push('Custom order pricing');
    return missing;
  }, [
    assets.length,
    customMeasurementKeys.length,
    form.categoryId,
    form.customOrderEnabled,
    form.subCategoryId,
    form.title,
    selectedTags.length,
  ]);
  const canPreview = missingRequiredFields.length === 0;

  const handlePickMedia = useCallback(
    async (source: 'camera' | 'library') => {
      await pickMedia(source);
    },
    [pickMedia],
  );

  const loadTags = useCallback(async (isActive: () => boolean = () => true) => {
    setTagsLoading(true);
    setTagError(null);

    await TagsApi.getTags(50)
      .then((items) => {
        if (isActive()) {
          setTagSuggestions(items);
          setTagError(null);
        }
      })
      .catch(() => {
        if (isActive()) {
          setTagSuggestions([]);
          setTagError('Could not load tags. You can still add your own.');
        }
      })
      .finally(() => {
        if (isActive()) {
          setTagsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!tagsOpen) return;
    let active = true;
    void loadTags(() => active);
    return () => {
      active = false;
    };
  }, [loadTags, tagsOpen]);

  const closeCategorySheet = useCallback(() => {
    setCategoryOpen(false);
    setCategoryStep('category');
  }, []);

  const handleCategoryDone = useCallback(() => {
    if (!draftSelectedCategory) return;
    if (draftSubCategories.length > 0 && !draftSubCategoryId) {
      setCategoryStep('subcategory');
      return;
    }
    updateField('categoryId', draftCategoryId);
    updateField('subCategoryId', draftSubCategoryId);
    closeCategorySheet();
  }, [
    closeCategorySheet,
    draftCategoryId,
    draftSelectedCategory,
    draftSubCategories.length,
    draftSubCategoryId,
    updateField,
  ]);

  useEffect(() => {
    if (assets.length > 0) {
      hasEverHadAssetsRef.current = true;
    }
  }, [assets.length]);

  const shouldRedirectEmptyCreate =
    !booting && !isEditMode && assets.length === 0 && !hasEverHadAssetsRef.current;

  useEffect(() => {
    if (shouldRedirectEmptyCreate) {
      router.replace('/catalog' as any);
    }
  }, [shouldRedirectEmptyCreate]);

  if (booting || shouldRedirectEmptyCreate) {
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
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.mediaSection}>
            <View style={styles.sectionTopRow}>
              <View style={styles.sectionTitleCopy}>
                <AppText variant="bodyBold">Selected media</AppText>
                <AppText variant="captionRegular" tone="muted">
                  {assets.length > 0 ? `${assets.length}/${DESIGN_EDITOR_MAX_MEDIA} selected` : 'No media selected yet'}
                </AppText>
              </View>
              <View ref={plusRef}>
                <Button title="+" size="sm" variant="ghost" onPress={() => setMediaOpen(true)} />
              </View>
            </View>
            {assets.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                {assets.map((asset, index) => (
                  <View key={asset.id} style={styles.assetCard}>
                    <StableImage uri={asset.remoteUrl ?? asset.uri} containerStyle={styles.assetPreview} imageStyle={styles.assetPreview} />
                    <View style={[styles.assetBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
                      <AppText variant="captionBold">{DESIGN_MEDIA_SLOTS[index]}</AppText>
                    </View>
                    <View style={styles.assetActionRow}>
                      <Pressable onPress={() => setCoverAssetId(asset.id)}>
                        <AppText variant="captionBold" tone={asset.id === coverAssetId ? 'muted' : 'primary'}>Set Cover</AppText>
                      </Pressable>
                      <Pressable onPress={() => removeAsset(asset.id)}>
                        <AppText variant="captionBold" tone="danger">Remove</AppText>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

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
                  subtitle="Choose category and subcategory."
                  value={categoryValue}
                  onPress={() => {
                    setDraftCategoryId(form.categoryId);
                    setDraftSubCategoryId(form.subCategoryId);
                    setCategoryStep('category');
                    setCategoryOpen(true);
                  }}
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
                      ? `${customMeasurementKeys.length} field${customMeasurementKeys.length === 1 ? '' : 's'}`
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
                  onPress={() => setMoreOptionsOpen(true)}
                />
                <OptionRow
                  leading="🏷️"
                  title="Tags"
                  subtitle="Choose tags for your design"
                  value={selectedTags.length > 0 ? `${selectedTags.length} selected` : 'Required'}
                  divider={false}
                  onPress={() => setTagsOpen(true)}
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

        </ScrollView>
        <View
          style={[
            styles.footerActions,
            {
              backgroundColor: theme.colors.bg,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, tokens.spacing.md),
              paddingHorizontal: tokens.spacing.lg,
            },
          ]}
        >
          {!canSaveDraft ? (
            <AppText variant="captionRegular" tone="muted" style={styles.draftHelper}>
              Add at least one field or one media item to save a draft.
            </AppText>
          ) : null}
          <View style={styles.actionRow}>
            <Button
              title={saveState.action === 'draft' ? 'Saving draft...' : 'Save draft'}
              variant="secondary"
              loading={saveState.action === 'draft'}
              disabled={!canSaveDraft}
              onPress={() => void save('draft')}
              style={styles.actionButton}
            />
            <Button
              title="Preview"
              disabled={!canPreview}
              onPress={() => router.push('/catalog/create-design/preview' as any)}
              style={styles.actionButton}
            />
          </View>
        </View>
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

      <AppBottomSheet
        visible={categoryOpen}
        title="Category"
        subtitle={categoryStep === 'category' ? 'Pick the main category.' : `Pick a subcategory in ${draftSelectedCategory?.name ?? 'this category'}.`}
        onClose={closeCategorySheet}
        onDone={handleCategoryDone}
        doneLabel="Use selection"
        doneDisabled={!draftSelectedCategory || (draftSubCategories.length > 0 && !draftSubCategoryId)}
        showCloseButton
      >
        {categoryStep === 'subcategory' && draftSelectedCategory ? (
          <Pressable onPress={() => setCategoryStep('category')} style={styles.sheetBackRow}>
            <AppText variant="captionBold" tone="primary">&lt; Change category</AppText>
          </Pressable>
        ) : null}
        <View style={styles.optionCardList}>
          {(categoryStep === 'category' ? categoryOptions : draftSubCategories.map((subCategory) => ({
            value: subCategory.id,
            label: subCategory.name,
          }))).map((option) => {
            const selected = categoryStep === 'category'
              ? option.value === draftCategoryId
              : option.value === draftSubCategoryId;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  if (categoryStep === 'category') {
                    setDraftCategoryId(option.value);
                    setDraftSubCategoryId('');
                    setCategoryStep('subcategory');
                    return;
                  }
                  setDraftSubCategoryId(option.value);
                }}
                style={({ pressed }) => [
                  styles.categoryOption,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed ? styles.optionPressed : null,
                ]}
              >
                <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {categoryStep === 'category' && categoryOptions.length === 0 ? (
          <AppText variant="body" tone="muted">No categories are configured yet.</AppText>
        ) : null}
        {categoryStep === 'subcategory' && draftSelectedCategory && draftSubCategories.length === 0 ? (
          <Card padding="md" style={[styles.inlineNotice, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">No subcategories yet</AppText>
            <AppText variant="captionRegular" tone="muted">
              You can save a draft with this category. Publishing requires a configured subcategory.
            </AppText>
          </Card>
        ) : null}
      </AppBottomSheet>

      <AppMultiSelectSheet
        visible={tagsOpen}
        title="Tags"
        subtitle="Choose existing tags or add your own."
        options={tagOptions}
        values={selectedTags}
        onChange={(values) => {
          updateField('tagsInput', values.join(', '));
        }}
        onClose={() => setTagsOpen(false)}
        emptyMessage="No suggestions found. Type a tag and tap Add."
        errorMessage={tagError}
        loading={tagsLoading}
        onRetry={() => void loadTags()}
        maxSelected={10}
      />

      <AppBottomSheet
        visible={priceOpen}
        title="Price range"
        subtitle="Set the indicative range buyers will see."
        onClose={() => setPriceOpen(false)}
        showCloseButton
        footer={
          <View style={styles.sheetActionRow}>
            <Button title="Cancel" variant="outline" onPress={() => setPriceOpen(false)} style={styles.actionButton} />
            <Button title="Done" disabled={Boolean(priceError)} onPress={() => setPriceOpen(false)} style={styles.actionButton} />
          </View>
        }
      >
        <View style={[styles.priceSummaryCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <AppText variant="captionBold" tone="muted">Displayed price</AppText>
          <AppText variant="subtitle">{formatPriceSummary(form.minPrice, form.maxPrice)}</AppText>
        </View>
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
        {priceError ? (
          <AppText variant="captionRegular" tone="danger">{priceError}</AppText>
        ) : (
          <AppText variant="captionRegular" tone="muted">
            Leave either field empty if the design only needs a starting or maximum reference price.
          </AppText>
        )}
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
              <Chip key={value} label={DESIGN_SIZING_LABELS[value]} selected={form.sizingMode === value} onPress={() => updateField('sizingMode', value)} />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Fit preference</AppText>
          <View style={styles.sheetChipWrap}>
            {(['SLIM', 'REGULAR', 'LOOSE', 'OVERSIZED'] as const).map((value) => (
              <Chip key={value} label={DESIGN_FIT_PREFERENCE_LABELS[value]} selected={form.fitPreference === value} onPress={() => updateField('fitPreference', value)} />
            ))}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <AppText variant="bodyBold">Target age group</AppText>
          <View style={styles.sheetChipWrap}>
            {(['ADULT', 'CHILD'] as const).map((value) => (
              <Chip key={value} label={DESIGN_TARGET_AGE_LABELS[value]} selected={form.targetAgeGroup === value} onPress={() => updateField('targetAgeGroup', value)} />
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
            value={form.customOrderEnabled}
            onValueChange={(value) => {
              updateField('customOrderEnabled', value);
            }}
          />
        </View>

        {form.customOrderEnabled ? (
          <View style={styles.sheetSection}>
            <RequiredFieldLabel required>Required custom-order fields</RequiredFieldLabel>
            <AppText variant="captionRegular" tone="muted">
              Select the exact buyer measurement fields for this design.
            </AppText>
            <View style={styles.sheetChipWrap}>
              {measurementPoints.length > 0 ? measurementPoints.map((point) => (
                <Chip
                  key={point.key}
                  label={point.label || point.key}
                  selected={customMeasurementKeys.includes(point.key)}
                  onPress={() => toggleMeasurementKey(point.key)}
                />
              )) : (
                <AppText variant="body" tone="muted">
                  No measurement fields are available for this audience.
                </AppText>
              )}
            </View>
            <View style={styles.priceRow}>
              <Input
                label="Base charge"
                value={form.baseProductionCharge}
                onChangeText={(value) => updateField('baseProductionCharge', value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="5000"
                containerStyle={styles.priceInput}
              />
              <Input
                label="Fabric cost / yard"
                value={form.fabricCostPerYard}
                onChangeText={(value) => updateField('fabricCostPerYard', value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="2500"
                containerStyle={styles.priceInput}
              />
            </View>
            <View style={styles.priceRow}>
              <Input
                label="Delivery min days"
                value={form.deliveryMinDays}
                onChangeText={(value) => updateField('deliveryMinDays', value.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="2"
                containerStyle={styles.priceInput}
              />
              <Input
                label="Delivery max days"
                value={form.deliveryMaxDays}
                onChangeText={(value) => updateField('deliveryMaxDays', value.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                placeholder="5"
                containerStyle={styles.priceInput}
              />
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
              label="Fallback yards"
              value={form.fallbackOutputYards}
              onChangeText={(value) => updateField('fallbackOutputYards', value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="4"
            />
            <Input
              label="Delivery scope"
              value={form.deliveryScope}
              onChangeText={(value) => updateField('deliveryScope', value)}
              placeholder="Nigeria"
            />
            <Input
              label="Additional instructions"
              value={form.buyerInstructionText}
              onChangeText={(value) => updateField('buyerInstructionText', value)}
              multiline
              placeholder="Any special instructions for buyers..."
            />
            <Input
              label="Revision policy"
              value={form.revisionPolicy}
              onChangeText={(value) => updateField('revisionPolicy', value)}
              multiline
            />
            <Input
              label="Return policy"
              value={form.returnPolicy}
              onChangeText={(value) => updateField('returnPolicy', value)}
              multiline
            />
            <Input
              label="Defect policy"
              value={form.defectPolicy}
              onChangeText={(value) => updateField('defectPolicy', value)}
              multiline
            />
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
              <Chip key={value} label={DESIGN_AUDIENCE_LABELS[value]} selected={form.audience === value} onPress={() => updateField('audience', value)} />
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

      <AppFloatingMenu
        visible={mediaOpen}
        anchorRef={plusRef}
        onClose={() => setMediaOpen(false)}
        options={[
          {
            key: 'camera',
            icon: '📷',
            title: 'Camera',
            onPress: () => void handlePickMedia('camera'),
          },
          {
            key: 'media',
            icon: '🖼️',
            title: 'Media',
            onPress: () => void handlePickMedia('library'),
          },
          {
            key: 'attachment',
            icon: '📎',
            title: 'Attachment',
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
    paddingBottom: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
  },
  sectionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    minHeight: tokens.button.sm.height,
  },
  sectionTitleCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  mediaSection: {
    gap: tokens.spacing.md,
  },
  mediaStrip: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.sm,
  },
  assetCard: {
    width: 172,
    gap: tokens.spacing.sm,
  },
  assetPreview: {
    width: 172,
    height: 224,
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
    flexWrap: 'wrap',
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

  requiredCard: {
    gap: tokens.spacing.xs,
    borderWidth: 1,
  },
  priceRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  priceSummaryCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.md,
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
  optionCardList: {
    gap: tokens.spacing.sm,
  },
  categoryOption: {
    minHeight: tokens.button.md.height,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  optionPressed: {
    opacity: 0.76,
  },
  sheetBackRow: {
    alignSelf: 'flex-start',
    paddingVertical: tokens.spacing.xs,
  },
  inlineNotice: {
    borderWidth: 1,
    gap: tokens.spacing.xs,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'stretch',
  },
  footerActions: {
    gap: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'stretch',
  },
  actionButton: {
    flex: 1,
  },
  draftHelper: {
    textAlign: 'center',
  },
});


