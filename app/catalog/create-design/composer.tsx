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
import { ComposerSection } from '@/components/ui/ComposerSection';
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
    moveAsset,
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
  const [tagSuggestions, setTagSuggestions] = useState<{ name: string; usageCount: number }[]>([]);
  const [tagError, setTagError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!tagsOpen) return;
    let isActive = true;

    void TagsApi.getTags(50)
      .then((items) => {
        if (isActive) {
          setTagSuggestions(items);
          setTagError(null);
        }
      })
      .catch((error) => {
        if (isActive) {
          setTagSuggestions([]);
          setTagError('Could not load tags. You can still add your own.');
        }
      });

    return () => {
      isActive = false;
    };
  }, [tagsOpen]);

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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing.xl }]} keyboardShouldPersistTaps="handled">
          <ComposerSection title="Selected media">
            <View style={styles.sectionTopRow}>
              <AppText variant="captionRegular" tone="muted">
                {assets.length > 0 ? `${assets.length}/${DESIGN_EDITOR_MAX_MEDIA} selected` : 'No media selected yet'}
              </AppText>
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
                      <Pressable onPress={() => moveAsset(asset.id, 'left')} disabled={index === 0}>
                        <AppText variant="captionBold" tone={index === 0 ? 'muted' : 'primary'}>Left</AppText>
                      </Pressable>
                      <Pressable onPress={() => moveAsset(asset.id, 'right')} disabled={index === assets.length - 1}>
                        <AppText variant="captionBold" tone={index === assets.length - 1 ? 'muted' : 'primary'}>Right</AppText>
                      </Pressable>
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
          </ComposerSection>

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

          <View style={[styles.footerActions, { paddingBottom: insets.bottom, paddingHorizontal: tokens.spacing.lg }]}>
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
        subtitle={categoryStep === 'category' ? 'Pick the main category.' : `Pick a subcategory in ${selectedCategory?.name ?? 'this category'}.`}
        options={
          categoryStep === 'category'
            ? categoryOptions
            : subCategories.map((subCategory) => ({
                value: subCategory.id,
                label: subCategory.name,
              }))
        }
        value={categoryStep === 'category' ? form.categoryId : form.subCategoryId}
        onChange={(value) => {
          if (categoryStep === 'category') {
            updateField('categoryId', value);
            updateField('subCategoryId', '');
            setCategoryStep('subcategory');
            return;
          }
          updateField('subCategoryId', value);
          setCategoryOpen(false);
          setCategoryStep('category');
        }}
        onClose={() => {
          setCategoryOpen(false);
          setCategoryStep('category');
        }}
        emptyMessage={categoryStep === 'category' ? 'No categories are configured yet.' : 'No subcategories available.'}
      />

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
        maxSelected={10}
      />

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
    paddingBottom: tokens.spacing.xl,
    paddingTop: tokens.spacing.sm,
  },
  sectionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    minHeight: tokens.button.sm.height,
  },
  mediaStrip: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.sm,
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
  footerActions: {
    gap: tokens.spacing.md,
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


