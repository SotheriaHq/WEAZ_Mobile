import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

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
    tags,
    save,
    saveState,
    canPublish,
    activeDesignId,
    isDraft,
    deleteDraft,
    selectedCategory,
    subCategories,
    filterSelection,
    customMeasurementKeys,
    filterDimensions,
  } = useDesignEditor();
  const { theme } = useTheme();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePhrase, setDeletePhrase] = React.useState('');

  const subCategory = subCategories.find((entry) => entry.id === form.subCategoryId) ?? null;
  const selectedFilterCount = Object.values(filterSelection).reduce((sum, values) => sum + values.length, 0);
  const locationDimension = filterDimensions.find((dimension) => dimension.slug === 'designer-location') ?? null;
  const selectedLocationId = locationDimension ? (filterSelection[locationDimension.id] ?? [])[0] : null;
  const selectedLocation = locationDimension?.values.find((value) => value.id === selectedLocationId) ?? null;
  const canDelete = deletePhrase === 'DELETE' && saveState.action !== 'draft';

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
            Review before saving or publishing.
          </AppText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {assets[0] ? (
          <StableImage uri={assets[0].remoteUrl ?? assets[0].uri} containerStyle={styles.heroImage} imageStyle={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
            <AppText variant="display">🖼️</AppText>
          </View>
        )}

        {assets.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assetStrip}>
            {assets.map((asset, index) => (
              <StableImage
                key={asset.id}
                uri={asset.remoteUrl ?? asset.uri}
                containerStyle={[
                  styles.assetThumb,
                  index === 0 ? { borderWidth: 2, borderColor: theme.colors.primary } : null,
                ]}
                imageStyle={styles.assetThumb}
              />
            ))}
          </ScrollView>
        ) : null}

        <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
          <AppText variant="title">{form.title.trim() || 'Untitled design'}</AppText>
          <AppText variant="body" tone="muted">{form.description.trim() || 'No description yet.'}</AppText>
        </Card>

        <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
          <SummaryRow label="Privacy" value={form.visibility === 'PRIVATE' ? 'Only me' : 'Everyone'} />
          <SummaryRow label="Category" value={selectedCategory?.name ?? 'Not selected'} />
          <SummaryRow label="Sub-category" value={subCategory?.name ?? 'Not selected'} />
          <SummaryRow label="Audience" value={toPrettyLabel(form.audience)} />
          <SummaryRow label="Sizing" value={toPrettyLabel(form.sizingMode)} />
          <SummaryRow label="Fit" value={toPrettyLabel(form.fitPreference)} />
          <SummaryRow label="Age group" value={toPrettyLabel(form.targetAgeGroup)} />
          <SummaryRow label="Custom orders" value={form.customOrderEnabled ? 'Enabled' : 'Disabled'} />
          <SummaryRow label="Location" value={selectedLocation?.name ?? 'Not selected'} />
          <SummaryRow label="Price" value={form.minPrice || form.maxPrice ? `₦${form.minPrice || '0'} - ₦${form.maxPrice || '0'}` : 'Not set'} />
          <SummaryRow label="Assets" value={String(assets.length)} />
          <SummaryRow label="Hashtags" value={tags.length > 0 ? tags.join(', ') : 'None'} />
          <SummaryRow label="Measurements" value={customMeasurementKeys.length > 0 ? customMeasurementKeys.join(', ') : 'None'} />
          <SummaryRow label="Discovery filters" value={selectedFilterCount > 0 ? `${selectedFilterCount} selected` : 'None'} />
        </Card>

        {saveState.action ? (
          <Card padding="lg" style={[styles.section, { borderColor: theme.colors.border }]}>
            <AppText variant="bodyBold">Current save progress</AppText>
            <AppText variant="subtitle">{Math.round(saveState.progress * 100)}%</AppText>
            <AppText variant="body" tone="muted">{saveState.message}</AppText>
          </Card>
        ) : null}

        <View style={styles.footerActions}>
          <Button title="Back to edit" variant="outline" onPress={() => router.replace('/catalog/create-design/composer' as any)} fullWidth />
          <View style={styles.actionRow}>
            <Button
              title={saveState.action === 'draft' ? 'Saving draft...' : 'Save draft'}
              variant="secondary"
              loading={saveState.action === 'draft'}
              onPress={() => void save('draft')}
              fullWidth
            />
            <Button
              title={saveState.action === 'publish' ? 'Publishing...' : 'Publish'}
              loading={saveState.action === 'publish'}
              disabled={!canPublish}
              onPress={() => void save('publish')}
              fullWidth
            />
          </View>
          {activeDesignId && isDraft ? (
            <Button title="Delete draft" variant="danger" onPress={() => setDeleteOpen(true)} fullWidth />
          ) : null}
        </View>
      </ScrollView>

      <Modal transparent visible={deleteOpen} animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.modalRoot}>
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
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
  },
  assetStrip: {
    gap: tokens.spacing.sm,
  },
  assetThumb: {
    width: 88,
    height: 112,
    borderRadius: tokens.radius.lg,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: tokens.radius.xl,
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
    textAlign: 'right',
  },
  footerActions: {
    gap: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
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
});
