import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ProfileHeader } from '@/components/catalog/ProfileHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { ProfileApi, type PatchedBrand, type UserProfile } from '@/src/api/ProfileApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { resolveIdentity } from '@/src/utils/identity';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';

function formatJoinLabel(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `Joined ${new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(parsed)}`;
}

function PatchRow({ brand }: { brand: PatchedBrand }) {
  const { theme } = useTheme();
  const identity = resolveIdentity(brand);
  const avatarUri = useResolvedImageUri({
    src: identity.avatarSrc ?? undefined,
    fileId: identity.avatarFileId ?? undefined,
    enabled: Boolean(identity.avatarSrc || identity.avatarFileId),
  });

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/catalog/[brandId]', params: { brandId: brand.id } } as any)}
      style={({ pressed }) => [
        styles.patchCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed ? styles.pressed : null,
      ]}
    >
      {avatarUri ? (
        <StableImage uri={avatarUri} containerStyle={styles.patchAvatar} imageStyle={styles.patchAvatar} />
      ) : (
        <View style={[styles.patchAvatar, { backgroundColor: theme.colors.primarySoft }]}>
          <AppText variant="captionBold" tone="primary">{identity.initials}</AppText>
        </View>
      )}
      <View style={styles.patchCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{identity.displayName}</AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {identity.locationLabel || identity.handle || 'Patched brand'}
        </AppText>
      </View>
      <AppText variant="subtitle" tone="muted">›</AppText>
    </Pressable>
  );
}

function PublicProfileEmpty() {
  return (
    <Card padding="lg" style={styles.emptyCard}>
      <AppText variant="subtitle">No public patches yet</AppText>
      <AppText variant="body" tone="muted" style={styles.emptyBody}>
        This profile has not patched any brands that are visible right now.
      </AppText>
      <Button title="Open discover" onPress={() => router.push('/(tabs)/discover' as any)} />
    </Card>
  );
}

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { theme, scheme } = useTheme();
  const toast = useToast();
  const { standardScreenBottomPadding } = useScreenChrome();

  const profileId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [patches, setPatches] = useState<PatchedBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) {
      setError('Profile not found.');
      setProfile(null);
      setPatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [profileResult, patchesResult] = await Promise.allSettled([
        ProfileApi.getPublicProfileById(profileId),
        ProfileApi.getPatches(profileId),
      ]);

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        throw profileResult.reason instanceof Error ? profileResult.reason : new Error('Failed to load profile');
      }

      if (patchesResult.status === 'fulfilled') {
        setPatches(patchesResult.value);
      } else {
        setPatches([]);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load profile.');
      setProfile(null);
      setPatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const identity = useMemo(() => resolveIdentity(profile), [profile]);
  const avatarUri = useResolvedImageUri({
    src: identity.avatarSrc ?? undefined,
    fileId: identity.avatarFileId ?? undefined,
    enabled: Boolean(identity.avatarSrc || identity.avatarFileId),
  });
  const joinedLabel = formatJoinLabel(profile?.createdAt);
  const locationLabel = profile?.location || profile?.address || null;
  const displayName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || profile?.username || 'Profile';
  const profileTabsLabel = patches.length === 1 ? '1 patched brand' : `${patches.length} patched brands`;

  const handleShare = useCallback(async () => {
    if (!profile) return;
    try {
      await Share.share({
        message: `View @${profile.username} on WEAZ`,
        url: `https://threadly.app/profile/${profile.id}`,
      });
    } catch {
      toast.info('Sharing is not available right now.');
    }
  }, [profile, toast]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ProfileHeader
          brandName=""
          isOwner={false}
          isLoading
          onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/discover' as any)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.colors.primary} />}
        contentInset={{ bottom: standardScreenBottomPadding }}
        scrollIndicatorInsets={{ bottom: standardScreenBottomPadding }}
        contentContainerStyle={[styles.content, { paddingBottom: standardScreenBottomPadding }]}
      >
        <ProfileHeader
          brandName={displayName}
          username={profile?.username || undefined}
          location={locationLabel}
          description={joinedLabel}
          avatarUrl={profile?.profileImage ?? undefined}
          avatarFileId={profile?.profileImageId ?? undefined}
          bannerUrl={profile?.bannerImage ?? undefined}
          isOwner={false}
          onShare={handleShare}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/discover' as any))}
        />

        <Card padding="lg" style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Username</AppText>
              <AppText variant="bodyBold">@{profile?.username || 'unknown'}</AppText>
            </View>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Patched brands</AppText>
              <AppText variant="bodyBold">{profileTabsLabel}</AppText>
            </View>
          </View>
        </Card>

        {error ? (
          <Card padding="lg" style={styles.errorCard}>
            <AppText variant="subtitle">Could not load profile</AppText>
            <AppText variant="body" tone="muted">{error}</AppText>
            <Button title="Retry" onPress={() => void load()} />
          </Card>
        ) : null}

        <View style={styles.sectionHeader}>
          <AppText variant="subtitle">Patched brands</AppText>
          <AppText variant="captionRegular" tone="muted">Public brand relationships from this profile</AppText>
        </View>

        {patches.length > 0 ? (
          <View style={styles.patchList}>
            {patches.map((brand) => (
              <PatchRow key={brand.id} brand={brand} />
            ))}
          </View>
        ) : (
          <PublicProfileEmpty />
        )}
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
  },
  summaryCard: {
    marginHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  summaryCell: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  sectionHeader: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  patchList: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  patchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  patchAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  patchCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyCard: {
    marginHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  emptyBody: {
    textAlign: 'center',
  },
  errorCard: {
    marginHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
});
