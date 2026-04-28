import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { DesignEditorShell } from '@/src/features/design-editor/DesignEditorShell';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

export default function CreateDesignEntryScreen() {
  const {
    booting,
    loadingError,
    retryBootstrap,
    draftConflict,
    takeOverDraftConflict,
    isEditMode,
    assets,
    tags,
    form,
    activeDesignId,
  } = useDesignEditor();
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';

  if (booting) {
    return <AppLoaderScreen message="Loading design studio" />;
  }

  return (
    <DesignEditorShell
      step="index"
      title={isEditMode ? 'Resume your design draft' : 'Create a design'}
      subtitle="Work through focused screens without losing your inputs. Save as draft or publish from review."
      nextLabel={loadingError || draftConflict ? undefined : isEditMode ? 'Continue editing' : 'Start with media'}
      onNext={
        loadingError || draftConflict
          ? undefined
          : () => {
              router.replace('/catalog/create-design/media' as any);
            }
      }
    >
      {loadingError ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="h3" style={{ color: theme.colors.text }}>
            Could not load the design editor
          </AppText>
          <AppText variant="small" style={{ color: theme.colors.textMuted }}>
            {loadingError}
          </AppText>
          <Button title="Retry" onPress={() => void retryBootstrap()} />
        </View>
      ) : null}

      {draftConflict?.hasConflict ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="h3" style={{ color: theme.colors.text }}>
            Another device is editing this draft
          </AppText>
          <AppText variant="small" style={{ color: theme.colors.textMuted }}>
            {draftConflict.conflictDetails?.deviceName
              ? `Current lock: ${draftConflict.conflictDetails.deviceName}`
              : 'This draft currently has an active editing lock.'}
          </AppText>
          <Button title="Take over draft" onPress={() => void takeOverDraftConflict()} />
        </View>
      ) : null}

      {!loadingError && !draftConflict ? (
        <>
          <View style={[styles.heroCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.colors.surface }]}>
            <AppText variant="h2" style={{ color: theme.colors.text }}>
              {isEditMode ? 'Editing in progress' : 'New design flow'}
            </AppText>
            <AppText variant="small" style={{ color: theme.colors.textMuted }}>
              {isEditMode
                ? 'Your draft is already loaded into the mobile editor. Continue from any step and publish when ready.'
                : 'Upload media first, add details, configure measurement requirements and discovery filters, then review before publishing.'}
            </AppText>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
                Media
              </AppText>
              <AppText variant="h2" style={{ color: theme.colors.text }}>
                {assets.length}
              </AppText>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
                Tags
              </AppText>
              <AppText variant="h2" style={{ color: theme.colors.text }}>
                {tags.length}
              </AppText>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText variant="smallBold" style={{ color: theme.colors.textMuted }}>
              Current draft summary
            </AppText>
            <AppText variant="bodyBold" style={{ color: theme.colors.text }}>
              {form.title.trim() || 'Untitled design'}
            </AppText>
            <AppText variant="small" style={{ color: theme.colors.textMuted }}>
              {activeDesignId
                ? `Draft ID: ${activeDesignId}`
                : 'No draft has been created yet. The first save will create one on the backend.'}
            </AppText>
          </View>

          <View style={styles.linkRow}>
            <Pressable onPress={() => router.replace('/catalog/create-design/media' as any)}>
              <AppText variant="bodyBold" style={{ color: theme.colors.primary }}>
                Go to media →
              </AppText>
            </Pressable>
            <Pressable onPress={() => router.replace('/catalog/create-design/review' as any)}>
              <AppText variant="bodyBold" style={{ color: theme.colors.primary }}>
                Jump to review →
              </AppText>
            </Pressable>
          </View>
        </>
      ) : null}
    </DesignEditorShell>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  card: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
});
