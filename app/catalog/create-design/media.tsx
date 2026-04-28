import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { CatalogCardSurface } from '@/components/catalog/CatalogCardSurface';
import { DesignEditorShell } from '@/src/features/design-editor/DesignEditorShell';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export default function CreateDesignMediaScreen() {
  const { booting, loadingError, retryBootstrap, assets, pickMedia, moveAsset, removeAsset } = useDesignEditor();
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';

  if (booting) {
    return <AppLoaderScreen message="Loading media step" />;
  }

  return (
    <DesignEditorShell
      step="media"
      title="Content upload"
      subtitle="Add one or more images or videos, preview them here, and arrange the order visitors will see first."
      backHref="/catalog/create-design"
      nextLabel="Continue"
      onNext={() => router.replace('/catalog/create-design/details' as any)}
    >
      {loadingError ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="small" style={{ color: theme.colors.textMuted }}>
            {loadingError}
          </AppText>
          <Button title="Retry" onPress={() => void retryBootstrap()} />
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <AppText variant="bodyBold" style={{ color: theme.colors.text }}>
          {assets.length} / 20 assets
        </AppText>
        <AppText variant="small" style={{ color: theme.colors.textMuted }}>
          The first asset becomes the leading cover unless you reorder before saving.
        </AppText>
        <Button title="Add media" onPress={() => void pickMedia()} />
      </View>

      {assets.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : theme.colors.surface }]}>
          <AppText variant="h3" style={{ color: theme.colors.text }}>
            No media added yet
          </AppText>
          <AppText variant="small" style={{ color: theme.colors.textMuted }}>
            You can still continue, but publishing requires at least one design image or video.
          </AppText>
        </View>
      ) : null}

      <View style={styles.assetList}>
        {assets.map((asset, index) => (
          <View key={asset.id} style={styles.assetItem}>
            <CatalogCardSurface
              mediaSrc={asset.remoteUrl ?? asset.uri}
              mediaFileId={asset.remoteFileId}
              mediaAspectRatio={asset.aspectRatio ?? null}
              style={[styles.mediaCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              bodyStyle={styles.mediaBody}
              fallback={
                <View style={styles.mediaFallback}>
                  <AppText variant="h2">🖼️</AppText>
                </View>
              }
              topOverlay={
                <View style={styles.coverBadge}>
                  <AppText variant="smallBold" style={styles.coverBadgeText}>
                    {index === 0 ? 'Cover' : `#${index + 1}`}
                  </AppText>
                </View>
              }
            >
              <AppText variant="bodyBold" style={{ color: theme.colors.text }}>
                {asset.mediaKind === 'video' ? 'Video asset' : 'Image asset'}
              </AppText>
              <View style={styles.assetActions}>
                <Pressable onPress={() => moveAsset(asset.id, 'left')} disabled={index === 0}>
                  <AppText variant="smallBold" style={{ color: index === 0 ? theme.colors.textMuted : theme.colors.primary }}>
                    ← Move
                  </AppText>
                </Pressable>
                <Pressable onPress={() => moveAsset(asset.id, 'right')} disabled={index === assets.length - 1}>
                  <AppText
                    variant="smallBold"
                    style={{ color: index === assets.length - 1 ? theme.colors.textMuted : theme.colors.primary }}
                  >
                    Move →
                  </AppText>
                </Pressable>
                <Pressable onPress={() => removeAsset(asset.id)}>
                  <AppText variant="smallBold" style={{ color: theme.colors.danger }}>
                    Remove
                  </AppText>
                </Pressable>
              </View>
            </CatalogCardSurface>
          </View>
        ))}
      </View>
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
  emptyCard: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  assetList: {
    gap: tokens.spacing.lg,
  },
  assetItem: {
    gap: tokens.spacing.sm,
  },
  mediaCard: {
    borderWidth: 1,
  },
  mediaBody: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    top: tokens.spacing.sm,
    left: tokens.spacing.sm,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  coverBadgeText: {
    color: '#ffffff',
  },
  assetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
});
