import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { backOrNavigate, drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';
import { useAuth } from '@/src/auth/AuthContext';
import { isBrandAccount, isSelfIdentity } from '@/src/auth/brandAccess';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ProfileHeader } from '@/components/catalog/ProfileHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import ProfileImageModal from '@/components/profile/ProfileImageModal';
import { ProfileApi, type PatchedBrand, type UserProfile } from '@/src/api/ProfileApi';
import { ProfilePhotoViewApi } from '@/src/api/ProfilePhotoViewApi';
import { useFrameBatchedItems } from '@/src/hooks/useFrameBatchedItems';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { resolveIdentity } from '@/src/utils/identity';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import {
  useDataUsable,
  useFirstMeaningfulRender,
  useScreenArrival,
  useSkeletonTiming,
} from '@/src/perf/usePerfStages';
import { readWarmScreenState, writeWarmScreenState } from '@/src/state/screenWarmState';
import { navPerf } from '@/src/utils/navPerf';
import { prefetchDetailOnPress } from '@/src/prefetch/navPrefetch';

type PublicProfileSnapshot = {
  profile: UserProfile;
  patches: PatchedBrand[];
};

const PUBLIC_PROFILE_INITIAL_PATCHES = 6;
const PUBLIC_PROFILE_PATCH_BATCH = 8;

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
      onPressIn={() =>
        prefetchDetailOnPress({
          href: { pathname: '/catalog/[brandId]', params: { brandId: brand.id } },
          hero: { src: identity.avatarSrc, fileId: identity.avatarFileId },
        })
      }
      onPress={() => drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId: brand.id } } as any)}
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
      <Button title="Open discover" onPress={() => topLevelNavigate('/(tabs)/discover' as any)} />
    </Card>
  );
}

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { user } = useAuth();
  const { theme, scheme } = useTheme();
  const toast = useToast();
  const { standardScreenBottomPadding } = useScreenChrome();

  const profileId = Array.isArray(params.id) ? params.id[0] : params.id;
  const warmProfileStateKey = profileId ? `public-profile:${profileId}` : null;
  const initialWarmProfileState = warmProfileStateKey ? readWarmScreenState<PublicProfileSnapshot>(warmProfileStateKey) : null;
  const hasInitialWarmProfileSnapshot = Boolean(initialWarmProfileState?.profile);
  const [profile, setProfile] = useState<UserProfile | null>(() => initialWarmProfileState?.profile ?? null);
  const [patches, setPatches] = useState<PatchedBrand[]>(() => initialWarmProfileState?.patches ?? []);
  const [loading, setLoading] = useState(() => !hasInitialWarmProfileSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [hasWarmProfileSnapshot, setHasWarmProfileSnapshot] = useState(() => hasInitialWarmProfileSnapshot);

  useEffect(() => {
    if (!warmProfileStateKey || !profile) return;
    writeWarmScreenState(warmProfileStateKey, { profile, patches });
  }, [patches, profile, warmProfileStateKey]);

  useEffect(() => {
    navPerf.screenMounted('profile_detail');
    navPerf.shellVisible('profile_detail');
    navPerf.firstVisibleUi('profile_detail');
  }, []);

  // T4 / T9 / T10. This screen's own warm snapshot makes it the clearest
  // cached-vs-cold comparison in the app: the same tap either opens on content
  // or opens on a skeleton, depending only on whether this profile has been
  // visited before.
  useScreenArrival('profile_detail');
  useFirstMeaningfulRender(Boolean(profile), 'profile_detail');
  useDataUsable(Boolean(profile), 'profile_detail');
  useSkeletonTiming(loading, 'profile_detail');

  const load = useCallback(async () => {
    if (!profileId) {
      setError('Profile not found.');
      setProfile(null);
      setPatches([]);
      setLoading(false);
      return;
    }

    const cachedState = warmProfileStateKey ? readWarmScreenState<PublicProfileSnapshot>(warmProfileStateKey) : null;
    const cachedProfile = cachedState?.profile ?? null;
    if (!cachedProfile) {
      setLoading(true);
    }
    setError(null);

    try {
      const [profileResult, patchesResult] = await Promise.allSettled([
        ProfileApi.getPublicProfileById(profileId),
        ProfileApi.getPatches(profileId),
      ]);

      const nextProfile =
        profileResult.status === 'fulfilled' && profileResult.value
          ? profileResult.value
          : cachedProfile;
      const nextPatches =
        patchesResult.status === 'fulfilled'
          ? patchesResult.value
          : cachedState?.patches ?? [];

      setProfile(nextProfile);
      setPatches(nextPatches);

      if (nextProfile && warmProfileStateKey) {
        setHasWarmProfileSnapshot(true);
        writeWarmScreenState(warmProfileStateKey, {
          profile: nextProfile,
          patches: nextPatches,
        });
      }

      if (profileResult.status === 'rejected' && !cachedProfile) {
        throw profileResult.reason instanceof Error ? profileResult.reason : new Error('Failed to load profile');
      }
      if (!nextProfile && !cachedProfile) {
        throw new Error('Profile not found.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load profile.');
      if (!cachedProfile) {
        setProfile(null);
        setPatches([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId, warmProfileStateKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  useEffect(() => {
    if (!loading) {
      navPerf.mark('cached_or_empty_state_visible', 'profile_detail');
      navPerf.dataReady('profile_detail');
    }
  }, [loading]);

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
  const visiblePatches = useFrameBatchedItems(patches, {
    initialCount: PUBLIC_PROFILE_INITIAL_PATCHES,
    batchCount: PUBLIC_PROFILE_PATCH_BATCH,
    resetKey: `${profileId ?? 'unknown'}:${patches.length}:${patches[0]?.id ?? ''}:${patches[patches.length - 1]?.id ?? ''}`,
  });

  const handleShare = useCallback(async () => {
    if (!profile) return;
    try {
      await Share.share({
        message: profile.username ? `View @${profile.username} on WIEZ` : `Check out ${displayName} on WIEZ`,
        url: `https://wiez.app/profile/${profile.id}`,
      });
    } catch {
      toast.info('Sharing is not available right now.');
    }
  }, [profile, toast]);

  const handleViewAvatar = useCallback(() => {
    if (!profile || (!avatarUri && !profile.profileImage && !profile.profileImageId)) return;
    setIsAvatarModalOpen(true);

    if (!profile.profilePhotoViewState?.canMarkViewed) return;

    void ProfilePhotoViewApi.markViewed(profile.id)
      .then((nextState) => {
        setProfile((current) =>
          current
            ? {
                ...current,
                profilePhotoUpdatedAt: nextState.profilePhotoUpdatedAt,
                profilePhotoViewState: nextState,
              }
            : current,
        );
      })
      .catch((markError) => {
        console.error('Failed to mark profile photo viewed', markError);
      });
  }, [avatarUri, profile]);

  /*
    Your own profile is not a visitor surface.

    This screen renders `isOwner={false}` in both of its branches, which is
    correct for what it is — the public, patched-brands view of SOMEONE ELSE.
    It has no session identity at all, so opening it with your own id showed
    you yourself as a stranger: no owner controls, no edit, no drafts. The
    Runway reaches it exactly that way, by pushing the id on the tapped card.

    The owner surfaces already exist and the island routes to them by the same
    rule, so send the request there rather than teaching this screen a second
    identity. `replace`, not push, so Back still returns where the user came
    from instead of landing back on a screen that would redirect again.

    This runs after every hook above it, so the hook order is unconditional.
  */
  if (isSelfIdentity(user, profileId)) {
    return <Redirect href={(isBrandAccount(user) ? '/catalog' : '/(tabs)/me') as never} />;
  }

  if (loading && !hasWarmProfileSnapshot) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ProfileHeader
          brandName=""
          isOwner={false}
          isLoading
          onBack={() => backOrNavigate('/(tabs)/discover' as any)}
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
          profilePhotoViewState={profile?.profilePhotoViewState ?? null}
          bannerUrl={profile?.bannerImage ?? undefined}
          isOwner={false}
          onViewAvatar={handleViewAvatar}
          onShare={handleShare}
          onBack={() => backOrNavigate('/(tabs)/discover' as any)}
        />

        <Card padding="lg" style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <AppText variant="captionRegular" tone="muted">Username</AppText>
              {profile?.username ? (
                <AppText variant="bodyBold">@{profile.username}</AppText>
              ) : (
                <AppText variant="bodyBold" tone="muted">Hidden 🙈</AppText>
              )}
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
            {visiblePatches.map((brand) => (
              <PatchRow key={brand.id} brand={brand} />
            ))}
          </View>
        ) : (
          <PublicProfileEmpty />
        )}
      </ScrollView>
      <ProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={avatarUri ?? profile?.profileImage ?? null}
        onClose={() => setIsAvatarModalOpen(false)}
      />
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
