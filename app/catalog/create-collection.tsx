import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { brandApi } from '@/src/api/BrandApi';
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
        <AppText variant="captionBold" tone="muted">🗂️ Collection Builder</AppText>

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
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.controlSurface,
                borderColor: theme.colors.controlSurfaceActive,
              },
            ]}
          >
            <AppText variant="title">Create New Collection</AppText>
            <AppText variant="small" tone="muted"> 
              Start with a title, add optional details, and save as a draft.
            </AppText>

            {loadError && <AppText variant="captionBold" tone="danger">{loadError}</AppText>}

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
              <Pressable
                onPress={() => setVisibility('PUBLIC')}
                style={[
                  styles.visibilityButton,
                  visibility === 'PUBLIC' && styles.visibilityActive,
                  {
                    borderColor: visibility === 'PUBLIC' ? '#7C3AED' : theme.colors.border,
                    backgroundColor:
                      visibility === 'PUBLIC'
                        ? 'rgba(124,58,237,0.12)'
                        : theme.colors.surface,
                  },
                ]}
              >
                <AppText variant="smallBold" tone={visibility === 'PUBLIC' ? 'primary' : 'default'}>
                  🌍 Public
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => setVisibility('PRIVATE')}
                style={[
                  styles.visibilityButton,
                  visibility === 'PRIVATE' && styles.visibilityActive,
                  {
                    borderColor: visibility === 'PRIVATE' ? '#7C3AED' : theme.colors.border,
                    backgroundColor:
                      visibility === 'PRIVATE'
                        ? 'rgba(124,58,237,0.12)'
                        : theme.colors.surface,
                  },
                ]}
              >
                <AppText variant="smallBold" tone={visibility === 'PRIVATE' ? 'primary' : 'default'}>
                  🔒 Private
                </AppText>
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => router.back()}
                style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
              >
                <AppText variant="smallBold">Cancel</AppText>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={!canSave}
                style={[styles.primaryButton, !canSave && styles.primaryDisabled]}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <AppText variant="smallBold" tone="inverse">Create</AppText>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  skeletonWrap: {
    marginTop: 10,
  },
  skeletonTextWrap: {
    marginTop: 16,
  },
  skeletonCard: {
    marginTop: 20,
  },
  card: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    marginTop: 10,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '700',
  },
  fieldWrap: {
    marginTop: 14,
  },
  visibilityRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  visibilityButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityActive: {
    borderWidth: 1.2,
  },
  visibilityText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
  },
  primaryDisabled: {
    opacity: 0.55,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
