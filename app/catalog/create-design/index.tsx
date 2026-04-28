import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { useDesignEditor } from '@/src/features/design-editor/DesignEditorProvider';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

function EntryCard({
  emoji,
  title,
  body,
  onPress,
}: {
  emoji: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.entryPressable, pressed ? styles.pressed : null]}>
      <Card padding="lg" style={[styles.entryCard, { backgroundColor: theme.colors.surfaceAlt }]}>
        <AppText variant="display">{emoji}</AppText>
        <View style={styles.entryCopy}>
          <AppText variant="subtitle">{title}</AppText>
          <AppText variant="body" tone="muted">{body}</AppText>
        </View>
      </Card>
    </Pressable>
  );
}

export default function CreateDesignEntryScreen() {
  const {
    booting,
    loadingError,
    retryBootstrap,
    draftConflict,
    takeOverDraftConflict,
    isEditMode,
    assets,
    form,
    activeDesignId,
    pickMedia,
  } = useDesignEditor();
  const { theme } = useTheme();

  const openComposerAfterPick = React.useCallback(
    async (source: 'camera' | 'library') => {
      const didAddMedia = await pickMedia(source);
      if (didAddMedia) {
        router.replace('/catalog/create-design/composer' as any);
      }
    },
    [pickMedia],
  );

  if (booting) {
    return <AppLoaderScreen message="Loading design studio" />;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppBackButton fallbackHref="/catalog" />
          <View style={styles.headerCopy}>
            <AppText variant="title">{isEditMode ? 'Resume draft' : 'Create design'}</AppText>
            <AppText variant="body" tone="muted">
              Start with media first, then finish everything on one composer screen.
            </AppText>
          </View>
        </View>

        {loadingError ? (
          <Card padding="lg" style={[styles.stateCard, { borderColor: theme.colors.border }]}>
            <AppText variant="subtitle">Could not load the design editor</AppText>
            <AppText variant="body" tone="muted">{loadingError}</AppText>
            <Button title="Retry" onPress={() => void retryBootstrap()} />
          </Card>
        ) : null}

        {draftConflict?.hasConflict ? (
          <Card padding="lg" style={[styles.stateCard, { borderColor: theme.colors.border }]}>
            <AppText variant="subtitle">Another device is editing this draft</AppText>
            <AppText variant="body" tone="muted">
              {draftConflict.conflictDetails?.deviceName
                ? `Current lock: ${draftConflict.conflictDetails.deviceName}`
                : 'Take over the draft if you want to continue here.'}
            </AppText>
            <Button title="Take over draft" onPress={() => void takeOverDraftConflict()} />
          </Card>
        ) : null}

        {!loadingError && !draftConflict ? (
          <>
            <Card padding="lg" style={[styles.heroCard, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="subtitle">{isEditMode ? 'Draft in progress' : 'New mobile composer'}</AppText>
              <AppText variant="body" tone="muted">
                Pick from the camera or library, then edit privacy, pricing, category, sizing, and discovery options from a single TikTok-style composer.
              </AppText>
            </Card>

            <View style={styles.entryGrid}>
              <EntryCard
                emoji="📷"
                title="Camera"
                body="Capture a photo or video and jump straight into the composer."
                onPress={() => void openComposerAfterPick('camera')}
              />
              <EntryCard
                emoji="🖼️"
                title="Select from library"
                body="Choose one or more images or videos from your device."
                onPress={() => void openComposerAfterPick('library')}
              />
            </View>

            <Card padding="lg" style={[styles.stateCard, { borderColor: theme.colors.border }]}>
              <AppText variant="bodyBold">{assets.length} selected asset{assets.length === 1 ? '' : 's'}</AppText>
              <AppText variant="body" tone="muted">
                {form.title.trim() || (activeDesignId ? `Draft ${activeDesignId}` : 'No title yet')}
              </AppText>
              {assets.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assetRow}>
                  {assets.map((asset) => (
                    <View key={asset.id} style={styles.assetThumbWrap}>
                      <StableImage uri={asset.remoteUrl ?? asset.uri} containerStyle={styles.assetThumb} imageStyle={styles.assetThumb} />
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              <Button
                title={assets.length > 0 ? 'Continue to composer' : 'Open composer'}
                onPress={() => router.replace('/catalog/create-design/composer' as any)}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  heroCard: {
    gap: tokens.spacing.sm,
  },
  stateCard: {
    gap: tokens.spacing.md,
    borderWidth: 1,
  },
  entryGrid: {
    gap: tokens.spacing.md,
  },
  entryPressable: {
    borderRadius: tokens.radius.xl,
  },
  entryCard: {
    minHeight: 164,
    gap: tokens.spacing.md,
  },
  entryCopy: {
    gap: tokens.spacing.xs,
  },
  assetRow: {
    gap: tokens.spacing.sm,
  },
  assetThumbWrap: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  assetThumb: {
    width: 96,
    height: 120,
    borderRadius: tokens.radius.lg,
  },
  pressed: {
    opacity: 0.82,
  },
});
