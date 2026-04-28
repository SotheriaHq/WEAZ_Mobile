import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { CatalogCardSurface } from '@/components/catalog/CatalogCardSurface';
import { DesignEditorShell } from '@/src/features/design-editor/DesignEditorShell';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export default function CreateDesignReviewScreen() {
  const { booting, form, assets, tags, save, deleteDraft, saveState, canPublish, activeDesignId, isDraft } = useDesignEditor();
  const { theme } = useTheme();
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deletePhrase, setDeletePhrase] = React.useState('');
  const canConfirmDelete = deletePhrase === 'DELETE' && saveState.action !== 'draft';

  const closeDeleteModal = React.useCallback(() => {
    if (saveState.action === 'draft') return;
    setDeleteModalOpen(false);
    setDeletePhrase('');
  }, [saveState.action]);

  const confirmDelete = React.useCallback(async () => {
    if (!canConfirmDelete) return;
    await deleteDraft();
  }, [canConfirmDelete, deleteDraft]);

  if (booting) {
    return <AppLoaderScreen message="Loading review step" />;
  }

  return (
    <DesignEditorShell
      step="review"
      title="Preview"
      subtitle="Preview how the design will appear, then save the draft or publish it to the catalog."
      backHref="/catalog/create-design/details"
      footer={
        <View style={styles.footer}>
          <Button
            title={saveState.action === 'draft' ? 'Saving draft...' : 'Save draft'}
            variant="outline"
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
          {activeDesignId && isDraft ? (
            <Button
              title="Delete Draft"
              variant="danger"
              size="lg"
              onPress={() => setDeleteModalOpen(true)}
              fullWidth
            />
          ) : null}
        </View>
      }
    >
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
          Design summary
        </AppText>
        <AppText variant="h2" style={{ color: theme.colors.text }}>
          {form.title.trim() || 'Untitled design'}
        </AppText>
        <AppText variant="small" style={{ color: theme.colors.textMuted }}>
          {form.description.trim() || 'No description added yet.'}
        </AppText>
        <AppText variant="small" style={{ color: theme.colors.textMuted }}>
          {assets.length} media • {tags.length} tags • {form.visibility.toLowerCase()} • {form.sizingMode}
        </AppText>
        {activeDesignId ? (
          <AppText variant="caption" style={{ color: theme.colors.textMuted }}>
            Draft ID: {activeDesignId}
          </AppText>
        ) : null}
      </View>

      {saveState.action ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
            Current save progress
          </AppText>
          <AppText variant="bodyBold" style={{ color: theme.colors.text }}>
            {Math.round(saveState.progress * 100)}%
          </AppText>
          <AppText variant="small" style={{ color: theme.colors.textMuted }}>
            {saveState.message}
          </AppText>
        </View>
      ) : null}

      <View style={styles.assetList}>
        {assets.map((asset, index) => (
          <CatalogCardSurface
            key={asset.id}
            mediaSrc={asset.remoteUrl ?? asset.uri}
            mediaFileId={asset.remoteFileId}
            mediaAspectRatio={asset.aspectRatio ?? null}
            style={[styles.assetCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            bodyStyle={styles.assetBody}
            fallback={
              <View style={styles.mediaFallback}>
                <AppText variant="h2">🖼️</AppText>
              </View>
            }
          >
            <AppText variant="bodyBold" style={{ color: theme.colors.text }}>
              {index === 0 ? 'Lead cover asset' : `Asset ${index + 1}`}
            </AppText>
          </CatalogCardSurface>
        ))}
      </View>

      <Button title="Back to details" variant="ghost" onPress={() => router.replace('/catalog/create-design/details' as any)} />

      <Modal transparent animationType="fade" visible={deleteModalOpen} onRequestClose={closeDeleteModal}>
        <View style={styles.deleteModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDeleteModal} />
          <View style={[styles.deleteModalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText variant="h3">Delete draft?</AppText>
            <AppText variant="body" tone="muted">
              This permanently deletes "{form.title.trim() || 'Untitled design'}". This action cannot be reversed.
            </AppText>
            <Input
              label="Type DELETE to confirm"
              value={deletePhrase}
              onChangeText={setDeletePhrase}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.deleteActions}>
              <Button title="Cancel" variant="outline" onPress={closeDeleteModal} disabled={saveState.action === 'draft'} />
              <Button
                title={saveState.message || 'Delete Draft'}
                variant="danger"
                onPress={() => void confirmDelete()}
                loading={saveState.message === 'Deleting draft...'}
                disabled={!canConfirmDelete}
              />
            </View>
          </View>
        </View>
      </Modal>
    </DesignEditorShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  assetList: {
    gap: tokens.spacing.lg,
  },
  assetCard: {
    borderWidth: 1,
  },
  assetBody: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
  },
  deleteModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  deleteModalCard: {
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderWidth: 1,
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'flex-end',
  },
});
