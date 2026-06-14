import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import {
  DESIGN_FIT_PREFERENCE_LABELS,
  DESIGN_SIZING_LABELS,
  DESIGN_TARGET_AGE_LABELS,
  DESIGN_VISIBILITY_LABELS,
  getMediaViewSlotLabel,
} from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import {
  getAudienceLabel,
  getDiscoveryDimensionSortIndex,
  isLegacyDiscoveryDimensionSlug,
  normalizeHashtagLabel,
} from '@/src/utils/creatorMetadata';

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLabelColumn}>
        <AppText variant="captionBold" tone="muted">{label}</AppText>
      </View>
      <AppText variant="bodyBold" style={styles.summaryValue}>{value}</AppText>
    </View>
  );
}

function formatAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || value.trim().length === 0) return null;
  return `NGN ${Math.round(parsed).toLocaleString('en-NG')}`;
}

function formatPriceRange(minPrice: string, maxPrice: string) {
  const min = formatAmount(minPrice);
  const max = formatAmount(maxPrice);

  if (min && max) return `${min} - ${max}`;
  if (min) return `From ${min}`;
  if (max) return `Up to ${max}`;
  return 'Not set';
}

function toPrettyLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CreateDesignPreviewScreen() {
  const {
    booting,
    form,
    assets,
    coverAssetId,
    tags,
    save,
    saveState,
    canSaveDraft,
    canPublish,
    activeDesignId,
    isDraft,
    deleteDraft,
    selectedCategory,
    subCategories,
    filterDimensions,
    filterSelection,
    customMeasurementKeys,
  } = useDesignEditor();
  const { scheme, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePhrase, setDeletePhrase] = React.useState('');
  const [selectedPreviewIndex, setSelectedPreviewIndex] = React.useState(0);
  const hasInitializedPreviewRef = React.useRef(false);

  const subCategory = subCategories.find((entry) => entry.id === form.subCategoryId) ?? null;
  const categorySummary = selectedCategory?.name ?? 'Not selected';
  const garmentTypeSummary = subCategory?.name ?? 'Not selected';
  const discoveryDimensions = React.useMemo(
    () =>
      [...filterDimensions]
        .filter(
          (dimension) =>
            (dimension.appliesTo.includes('DESIGN') || dimension.appliesTo.includes('COLLECTION')) &&
            !isLegacyDiscoveryDimensionSlug(dimension.slug),
        )
        .sort((a, b) => {
          const orderDelta = getDiscoveryDimensionSortIndex(a.slug) - getDiscoveryDimensionSortIndex(b.slug);
          return orderDelta || a.name.localeCompare(b.name);
        }),
    [filterDimensions],
  );
  const discoveryCounts = React.useMemo(
    () =>
      discoveryDimensions.reduce(
        (acc, dimension) => {
          const count = filterSelection[dimension.id]?.length ?? 0;
          if (dimension.slug === 'heritage') {
            acc.heritage += count;
          } else if (dimension.slug === 'occasion') {
            acc.occasion += count;
          } else {
            acc.style += count;
          }
          acc.total += count;
          return acc;
        },
        { style: 0, heritage: 0, occasion: 0, total: 0 },
      ),
    [discoveryDimensions, filterSelection],
  );
  const isSaving = Boolean(saveState.action);
  const canDelete = deletePhrase === 'DELETE' && !isSaving;
  const selectedPreviewAsset = assets[selectedPreviewIndex] ?? null;
  const selectedPreviewSlotLabel = selectedPreviewAsset
    ? getMediaViewSlotLabel(selectedPreviewAsset.viewSlot)
    : '';
  const saveProgressPercent = Math.max(0, Math.min(100, Math.round(saveState.progress * 100)));

  useAndroidOverlaySystemBars(deleteOpen, scheme, 'create-design-delete');

  React.useEffect(() => {
    if (assets.length === 0) {
      hasInitializedPreviewRef.current = false;
      setSelectedPreviewIndex(0);
      return;
    }

    if (!hasInitializedPreviewRef.current) {
      hasInitializedPreviewRef.current = true;
      const coverIndex = coverAssetId ? assets.findIndex((asset) => asset.id === coverAssetId) : -1;
      const nextIndex = coverIndex >= 0 ? coverIndex : 0;
      if (nextIndex !== selectedPreviewIndex) {
        setSelectedPreviewIndex(nextIndex);
      }
      return;
    }

    if (selectedPreviewIndex >= assets.length) {
      setSelectedPreviewIndex(assets.length - 1);
    }
  }, [assets, coverAssetId, selectedPreviewIndex]);

  if (booting) {
    return <AppLoaderScreen message="Loading preview" />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/catalog/create-design/composer" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Preview</AppText>
          <AppText variant="captionRegular" tone="muted">
            Review before saving or going live.
          </AppText>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {selectedPreviewAsset ? (
          <View style={styles.heroWrap}>
            <StableImage
              uri={selectedPreviewAsset.remoteUrl ?? selectedPreviewAsset.uri}
              containerStyle={styles.heroImage}
              imageStyle={styles.heroImage}
            />
            <View style={[styles.heroBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
              <AppText variant="captionBold">
                {selectedPreviewAsset.id === coverAssetId
                  ? `Cover - ${selectedPreviewSlotLabel}`
                  : selectedPreviewSlotLabel}
              </AppText>
            </View>
          </View>
        ) : (
          <View style={[styles.heroImage, styles.heroFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
            <AppText variant="display">🖼️</AppText>
          </View>
        )}

        {assets.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assetStrip}>
            {assets.map((asset, index) => (
              <Pressable
                key={asset.id}
                onPress={() => setSelectedPreviewIndex(index)}
                style={[
                  styles.assetThumbWrap,
                  {
                    borderColor: index === selectedPreviewIndex ? theme.colors.primary : theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <StableImage
                  uri={asset.remoteUrl ?? asset.uri}
                  containerStyle={styles.assetThumb}
                  imageStyle={styles.assetThumb}
                />
                <View style={styles.assetThumbMeta}>
                  <AppText variant="captionBold" tone={index === selectedPreviewIndex ? 'primary' : 'default'}>
                    {getMediaViewSlotLabel(asset.viewSlot)}
                  </AppText>
                  <AppText variant="captionRegular" tone="muted">
                    {asset.id === coverAssetId ? 'Current cover' : index === selectedPreviewIndex ? 'Previewing' : 'Tap to preview'}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
          <AppText variant="title">{form.title.trim() || 'Untitled design'}</AppText>
          <AppText variant="body" tone="muted">{form.description.trim() || 'No description yet.'}</AppText>
        </Card>

        <Card padding="lg" style={[styles.section, styles.receiptSection, { borderColor: theme.colors.border }]}>
          <AppText variant="bodyBold">Details</AppText>
          <SummaryRow label="Who can see this?" value={DESIGN_VISIBILITY_LABELS[form.visibility]} />
          <SummaryRow label="What is it?" value={categorySummary} />
          <SummaryRow label="Garment type" value={garmentTypeSummary} />
          <SummaryRow label="Who is it for?" value={getAudienceLabel(form.audience)} />
          <SummaryRow label="Style details" value={discoveryCounts.style > 0 ? `${discoveryCounts.style} selected` : 'None'} />
          <SummaryRow label="Cultural vibe" value={discoveryCounts.heritage > 0 ? `${discoveryCounts.heritage} selected` : 'None'} />
          <SummaryRow label="Where would you wear it?" value={discoveryCounts.occasion > 0 ? `${discoveryCounts.occasion} selected` : 'None'} />
          <SummaryRow label="Sizing" value={DESIGN_SIZING_LABELS[form.sizingMode]} />
          <SummaryRow label="Fit" value={DESIGN_FIT_PREFERENCE_LABELS[form.fitPreference]} />
          <SummaryRow label="Age group" value={DESIGN_TARGET_AGE_LABELS[form.targetAgeGroup]} />
          <SummaryRow label="Custom orders" value={form.customOrderEnabled ? 'Enabled' : 'Disabled'} />
          <SummaryRow label="Price" value={formatPriceRange(form.minPrice, form.maxPrice)} />
          <SummaryRow label="Assets" value={String(assets.length)} />
          <SummaryRow label="Metadata selected" value={discoveryCounts.total > 0 ? `${discoveryCounts.total} selected` : 'None'} />
        </Card>

        {tags.length > 0 ? (
          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Hashtags</AppText>
            <View style={styles.tagsWrap}>
              {tags.map((tag) => (
                <Chip key={tag} label={normalizeHashtagLabel(tag)} />
              ))}
            </View>
          </Card>
        ) : null}

        {customMeasurementKeys.length > 0 ? (
          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Custom order fields</AppText>
            <View style={styles.customFieldsWrap}>
              {customMeasurementKeys.map((key) => (
                <AppText key={key} variant="body" style={styles.customFieldItem}>
                  {toPrettyLabel(key)}
                </AppText>
              ))}
            </View>
          </Card>
        ) : null}

      </ScrollView>

      <View
        style={[
          styles.footerActions,
          {
            backgroundColor: theme.colors.bg,
            borderTopColor: theme.colors.border,
            paddingHorizontal: tokens.spacing.lg,
            paddingBottom: Math.max(insets.bottom + tokens.spacing.lg, tokens.spacing['2xl']),
          },
        ]}
      >
        {saveState.action ? (
          <View style={[styles.progressPanel, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <View style={styles.progressCopyRow}>
              <View style={styles.progressCopy}>
                <AppText variant="bodyBold">Current save progress</AppText>
                <AppText variant="captionRegular" tone="muted">{saveState.message}</AppText>
              </View>
              <AppText variant="subtitle">{saveProgressPercent}%</AppText>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.colors.surface }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.primary,
                    width: `${saveProgressPercent}%`,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}
        {!canSaveDraft ? (
          <AppText variant="captionRegular" tone="muted" style={styles.draftHelper}>
            Add at least one field or one media item to save a draft.
          </AppText>
        ) : null}
        <Button title="Back to edit" variant="outline" onPress={() => router.replace('/catalog/create-design/composer' as any)} fullWidth />
        <AppText variant="captionRegular" tone="muted" style={styles.draftHelper}>
          Going live confirms these images belong to this design and match the selected views.
        </AppText>
        <View style={styles.actionRow}>
          <View style={styles.actionButton}>
            <Button
              title={saveState.action === 'draft' ? 'Saving draft...' : 'Save draft'}
              variant="secondary"
              loading={saveState.action === 'draft'}
              disabled={!canSaveDraft || isSaving}
              onPress={() => void save('draft')}
              fullWidth
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              title={saveState.action === 'publish' ? 'Going live...' : 'Go live'}
              loading={saveState.action === 'publish'}
              disabled={!canPublish || isSaving}
              onPress={() => void save('publish')}
              fullWidth
            />
          </View>
        </View>
        {activeDesignId && isDraft ? (
          <Button title="Delete draft" variant="danger" onPress={() => setDeleteOpen(true)} fullWidth />
        ) : null}
      </View>

      <Modal
        transparent
        visible={deleteOpen}
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setDeleteOpen(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: theme.colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText variant="subtitle">Delete draft?</AppText>
            <AppText variant="body" tone="muted">
              This permanently deletes {form.title.trim() ? `"${form.title.trim()}"` : 'this draft'}.
            </AppText>
            <Input
              label="Type DELETE to confirm"
              value={deletePhrase}
              onChangeText={setDeletePhrase}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setDeleteOpen(false)} />
              <Button
                title="Delete draft"
                variant="danger"
                disabled={!canDelete}
                onPress={() => void deleteDraft()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
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
  scroll: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
  },
  assetStrip: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.sm,
  },
  assetThumbWrap: {
    width: 108,
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    padding: tokens.spacing.xs,
  },
  assetThumb: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: tokens.radius.lg,
  },
  assetThumbMeta: {
    gap: tokens.spacing.xs,
  },
  heroWrap: {
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: tokens.radius.xl,
  },
  heroBadge: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: tokens.spacing.sm,
    borderWidth: 1,
  },
  receiptSection: {
    gap: tokens.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  summaryLabelColumn: {
    width: 118,
    flexShrink: 0,
  },
  summaryValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  draftHelper: {
    textAlign: 'center',
  },
  footerActions: {
    gap: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.md,
  },
  progressPanel: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
  },
  progressCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  progressCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: tokens.radius.full,
  },
  progressFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'stretch',
  },
  actionButton: {
    flex: 1,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderWidth: 1,
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  customFieldsWrap: {
    gap: tokens.spacing.xs,
  },
  customFieldItem: {
    textAlign: 'left',
  },
});
