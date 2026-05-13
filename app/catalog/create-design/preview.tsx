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
  DESIGN_AUDIENCE_LABELS,
  DESIGN_FIT_PREFERENCE_LABELS,
  DESIGN_SIZING_LABELS,
  DESIGN_TARGET_AGE_LABELS,
  DESIGN_VISIBILITY_LABELS,
} from '@/src/features/design-editor/designCreationRules';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant="captionRegular" tone="muted">{label}</AppText>
      <AppText variant="bodyBold" style={styles.summaryValue}>{value}</AppText>
    </View>
  );
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
  const categorySummary =
    selectedCategory && subCategory ? `${selectedCategory.name} / ${subCategory.name}` : 'Not selected';
  const selectedFilterCount = Object.values(filterSelection).reduce((sum, values) => sum + values.length, 0);
  const canDelete = deletePhrase === 'DELETE' && saveState.action !== 'draft';
  const selectedPreviewAsset = assets[selectedPreviewIndex] ?? null;

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
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/catalog/create-design/composer" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Preview</AppText>
          <AppText variant="captionRegular" tone="muted">
            Review before saving or publishing.
          </AppText>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing.xl }]}
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
                {selectedPreviewAsset.id === coverAssetId ? 'Cover' : `Asset ${selectedPreviewIndex + 1}`}
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
                    {index === selectedPreviewIndex ? 'Previewing' : `Asset ${index + 1}`}
                  </AppText>
                  <AppText variant="captionRegular" tone="muted">
                    {asset.id === coverAssetId ? 'Current cover' : 'Tap to preview'}
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

        <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
          <SummaryRow label="Privacy" value={DESIGN_VISIBILITY_LABELS[form.visibility]} />
          <SummaryRow label="Category" value={categorySummary} />
          <SummaryRow label="Audience" value={DESIGN_AUDIENCE_LABELS[form.audience]} />
          <SummaryRow label="Sizing" value={DESIGN_SIZING_LABELS[form.sizingMode]} />
          <SummaryRow label="Fit" value={DESIGN_FIT_PREFERENCE_LABELS[form.fitPreference]} />
          <SummaryRow label="Age group" value={DESIGN_TARGET_AGE_LABELS[form.targetAgeGroup]} />
          <SummaryRow label="Custom orders" value={form.customOrderEnabled ? 'Enabled' : 'Disabled'} />
          <SummaryRow label="Price" value={form.minPrice || form.maxPrice ? `NGN ${form.minPrice || '0'} - NGN ${form.maxPrice || '0'}` : 'Not set'} />
          <SummaryRow label="Assets" value={String(assets.length)} />
          <SummaryRow label="Discovery filters" value={selectedFilterCount > 0 ? `${selectedFilterCount} selected` : 'None'} />
        </Card>

        {tags.length > 0 ? (
          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Tags</AppText>
            <View style={styles.tagsWrap}>
              {tags.map((tag) => (
                <Chip key={tag} label={`#${tag}`} />
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

        {saveState.action ? (
          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Current save progress</AppText>
            <AppText variant="subtitle">{Math.round(saveState.progress * 100)}%</AppText>
            <AppText variant="body" tone="muted">{saveState.message}</AppText>
          </Card>
        ) : null}

        <View style={[styles.footerActions, { paddingHorizontal: tokens.spacing.lg, paddingBottom: insets.bottom }]}>
          {!canSaveDraft ? (
            <AppText variant="captionRegular" tone="muted" style={styles.draftHelper}>
              Add at least one field or one media item to save a draft.
            </AppText>
          ) : null}
          <Button title="Back to edit" variant="outline" onPress={() => router.replace('/catalog/create-design/composer' as any)} fullWidth />
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
              title={saveState.action === 'publish' ? 'Publishing...' : 'Publish'}
              loading={saveState.action === 'publish'}
              disabled={!canPublish}
              onPress={() => void save('publish')}
              style={styles.actionButton}
            />
          </View>
          {activeDesignId && isDraft ? (
            <Button title="Delete draft" variant="danger" onPress={() => setDeleteOpen(true)} fullWidth />
          ) : null}
        </View>
      </ScrollView>

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
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
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
  summaryRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'left',
  },
  draftHelper: {
    textAlign: 'center',
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
