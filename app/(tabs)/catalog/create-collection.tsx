import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { brandApi } from '@/src/api/BrandApi';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

export default function CreateCollectionScreen() {
  const { theme } = useTheme();
  const toast = useToast();

  const [booting, setBooting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await brandApi.getCategories();
      } catch {
        if (mounted) {
          setLoadError('Could not preload categories. You can still create a collection.');
        }
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const canSave = useMemo(() => title.trim().length > 0 && !saving, [saving, title]);

  const openStudioBuilder = () => {
    router.push({ pathname: '/studio/webview', params: { routeKey: 'createCollection' } } as any);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Collection title is required.');
      return;
    }

    setSaving(true);
    try {
      const created = await brandApi.createCollection({
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
      });

      if (!created?.id) {
        throw new Error('Collection could not be created.');
      }

      toast.success('Collection draft created.');
      router.replace('/catalog?tab=Collections');
    } catch {
      toast.error('Failed to create collection. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <AppBackButton emoji={'\u{1F448}'} fallbackHref="/catalog" />
          <View style={styles.headerText}>
            <AppText variant="title">Create Collection</AppText>
            <AppText variant="body" tone="muted">
              Group products for a drop, edit product membership in Studio, or save a quick draft here.
            </AppText>
          </View>
        </View>

        {booting ? (
          <View style={styles.skeletonWrap}>
            <Skeleton width="64%" height={28} borderRadius={10} />
            <View style={styles.skeletonTextWrap}>
              <SkeletonText lines={2} lineHeight={12} spacing={8} lastLineWidth="66%" />
            </View>
            <View style={styles.skeletonCard}>
              <Skeleton width="100%" height={44} borderRadius={12} />
              <Skeleton width="100%" height={96} borderRadius={12} style={{ marginTop: 12 }} />
              <Skeleton width="45%" height={40} borderRadius={12} style={{ marginTop: 16 }} />
            </View>
          </View>
        ) : (
          <View style={styles.formSurface}>
            <Button
              title="Open Studio Builder"
              variant="secondary"
              fullWidth
              onPress={openStudioBuilder}
              style={styles.studioButton}
            />

            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

            <AppText variant="subtitle">Quick draft</AppText>
            <AppText variant="body" tone="muted">
              Use this lightweight native form when you only need the collection shell.
            </AppText>

            {loadError ? (
              <AppText variant="captionBold" tone="danger" style={styles.statusText}>
                {loadError}
              </AppText>
            ) : null}

            <Input
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Summer Capsule 2026"
              containerStyle={styles.fieldWrap}
            />

            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="What this collection is about"
              multiline
              containerStyle={styles.fieldWrap}
            />

            <View style={styles.visibilityRow}>
              <VisibilityOption
                label="Public"
                selected={visibility === 'PUBLIC'}
                onPress={() => setVisibility('PUBLIC')}
              />
              <VisibilityOption
                label="Private"
                selected={visibility === 'PRIVATE'}
                onPress={() => setVisibility('PRIVATE')}
              />
            </View>

            <View style={styles.actions}>
              <View style={styles.actionButton}>
                <Button title="Cancel" variant="outline" fullWidth onPress={() => router.back()} />
              </View>
              <View style={styles.actionButton}>
                <Button title="Create" fullWidth onPress={handleCreate} disabled={!canSave} loading={saving} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VisibilityOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.visibilityButton,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <AppText variant="smallBold" tone={selected ? 'primary' : 'default'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    paddingTop: tokens.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  headerText: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  skeletonWrap: {
    marginTop: tokens.spacing.xl,
  },
  skeletonTextWrap: {
    marginTop: tokens.spacing.lg,
  },
  skeletonCard: {
    marginTop: tokens.spacing.xl2,
  },
  formSurface: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  studioButton: {
    marginTop: tokens.spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.sm,
  },
  statusText: {
    marginTop: tokens.spacing.xs,
  },
  fieldWrap: {
    marginTop: tokens.spacing.xs,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  visibilityButton: {
    flex: 1,
    minHeight: tokens.button.md.height,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
