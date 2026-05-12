/**
 * Catalog Screen - Mobile
 * Brand catalog page with profile header, collections, reviews, and about tabs
 * Routes: /catalog (owner view) or /catalog/[brandId] (visitor view)
 * Rule 5: emoji-only markers | Rule 6: rounded-square avatars
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { BackHandler, LayoutChangeEvent, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuth, useAuthSession } from '@/src/auth/AuthContext';
import { canManageCatalog, getActiveBrandId } from '@/src/auth/brandAccess';
import { brandApi, type BrandProfileDto, type CollectionDto } from '@/src/api/BrandApi';
import { OwnerCatalogMediaHeader } from '@/components/catalog/OwnerCatalogMediaHeader';
import { ProfileHeader } from '@/components/catalog/ProfileHeader';
import MobileProfileImageModal from '@/components/profile/ProfileImageModal';
import { Tabs } from '@/components/catalog/Tabs';
import { CollectionsGrid } from '@/components/catalog/CollectionsGrid';
import { VisibilityFilter } from '@/components/catalog/VisibilityFilter';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/src/toast/ToastContext';
import { useBrandPatchStatus } from '@/src/hooks/useBrandPatchStatus';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { resolveBannerImageSource, resolveProfileImageSource } from '@/src/utils/profileImage';
import { BrandShopTab } from '@/components/catalog/BrandShopTab';
import { BrandReviewsTab } from '@/components/catalog/BrandReviewsTab';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppFloatingMenu } from '@/components/ui/AppFloatingMenu';
import { AppConfirmDialog } from '@/components/ui/AppConfirmDialog';
import { BrandSwitcherSheet } from '@/components/brand/BrandSwitcherSheet';
import {
  pickDesignEditorMediaAssets,
  stageDesignEditorAssetBundle,
  type DesignEditorMediaSource,
} from '@/src/features/design-editor/designEditorMediaFlow';
import { tokens } from '@/src/styles/tokens';
import { catalogDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { useScreenChrome } from '@/src/system/ScreenChrome';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TabType = 'Collections' | 'Shop' | 'Reviews';
type VisibilityType = 'Public' | 'Private' | 'Drafts';
const TAB_ORDER: TabType[] = ['Collections', 'Shop', 'Reviews'];

function CatalogLoadingSkeleton({ bottomPadding }: { bottomPadding: number }) {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={styles.scrollView}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.skeletonScrollContent,
        { paddingBottom: bottomPadding + tokens.spacing.xl },
      ]}
    >
      <View style={[styles.skeletonHero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Skeleton width="100%" height={168} borderRadius={tokens.radius.xl} />
        <View style={styles.skeletonHeroRow}>
          <Skeleton width={68} height={68} borderRadius={tokens.radius.xl} />
          <View style={styles.skeletonHeroCopy}>
            <Skeleton width="58%" height={18} borderRadius={tokens.radius.sm} />
            <SkeletonText lines={2} lineHeight={tokens.typography.caption.lineHeight} spacing={tokens.spacing.sm} lastLineWidth="72%" />
          </View>
        </View>
      </View>

      <View style={styles.skeletonTabsRow}>
        <Skeleton width={72} height={32} borderRadius={tokens.radius.full} />
        <Skeleton width={64} height={32} borderRadius={tokens.radius.full} />
        <Skeleton width={72} height={32} borderRadius={tokens.radius.full} />
      </View>

      <View style={styles.skeletonGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={index} style={[styles.skeletonCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Skeleton width="100%" height={180} borderRadius={tokens.radius.lg} />
            <Skeleton width="72%" height={14} borderRadius={tokens.radius.sm} style={styles.skeletonCardTitle} />
            <Skeleton width="48%" height={12} borderRadius={tokens.radius.sm} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty States
// ─────────────────────────────────────────────────────────────

const EmptyCollections = ({ isOwner, onAdd }: { isOwner: boolean; onAdd?: () => void }) => {
  return (
    <View style={styles.emptyState}>
      <AppText variant="display" tone="muted">+</AppText>
      <AppText variant="subtitle" style={styles.emptyTitle}>
        {isOwner ? 'No Content Yet' : 'No Public Content'}
      </AppText>
      <AppText variant="bodyRegular" tone="muted" style={styles.emptySubtitle}>
        {isOwner
          ? 'Start showcasing your fashion by creating your first design'
          : "This brand hasn't published any content yet"}
      </AppText>
      {isOwner && onAdd && (
        <Button title="Create Design" onPress={onAdd} size="md" style={styles.emptyButton} />
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function CatalogScreen() {
  const { brandId: routeBrandId, tab: routeTabParam, visibility: routeVisibilityParam, productId: routeProductIdParam } = useLocalSearchParams<{
    brandId?: string;
    tab?: string | string[];
    visibility?: string | string[];
    productId?: string | string[];
  }>();
  const { theme, scheme } = useTheme();
  const { standardScreenBottomPadding } = useScreenChrome();
  const { user } = useAuth();
  const { status, userId, userEmailVerified, updateUser } = useAuthSession();
  const toast = useToast();
  const isDark = scheme === 'dark';

  const routeTab = Array.isArray(routeTabParam) ? routeTabParam[0] : routeTabParam;
  const routeVisibility = Array.isArray(routeVisibilityParam) ? routeVisibilityParam[0] : routeVisibilityParam;
  const routeProductId = Array.isArray(routeProductIdParam) ? routeProductIdParam[0] : routeProductIdParam;
  const normalizeTab = (value?: string): TabType => {
    const key = String(value ?? '').trim().toLowerCase();
    if (key === 'shop' || key === 'store') return 'Shop';
    if (key === 'reviews') return 'Reviews';
    return 'Collections';
  };
  const normalizeVisibility = (value?: string): VisibilityType => {
    const key = String(value ?? '').trim().toLowerCase();
    if (key === 'private') return 'Private';
    if (key === 'drafts' || key === 'draft') return 'Drafts';
    return 'Public';
  };

  // State
  const [profile, setProfile] = useState<BrandProfileDto | null>(null);
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [drafts, setDrafts] = useState<CollectionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>(() => normalizeTab(routeTab));
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityType>(() => normalizeVisibility(routeVisibility));
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<CollectionDto | null>(null);
  const [draftDeletePhrase, setDraftDeletePhrase] = useState('');
  const [draftDeleteBusy, setDraftDeleteBusy] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuAnchorMetrics, setCreateMenuAnchorMetrics] = useState<{
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null>(null);
  const createMenuAnchorRef = useRef<View>(null);
  const tabSwipeProgress = useSharedValue(TAB_ORDER.indexOf(activeTab));

  // Determine if owner view
  const activeBrandId = getActiveBrandId(user);
  const isOwner = Boolean(canManageCatalog(user) && (!routeBrandId || routeBrandId === activeBrandId));
  const targetBrandId = routeBrandId || activeBrandId || userId;
  const patchEnabled = Boolean(!isOwner && status === 'authenticated' && targetBrandId);
  const {
    isPatched,
    loading: patchLoading,
    refresh: refreshPatchStatus,
    toggle: togglePatchStatus,
  } = useBrandPatchStatus({
    brandId: patchEnabled ? targetBrandId : undefined,
    enabled: patchEnabled,
  });

  // Fetch profile data
  const fetchProfile = useCallback(async () => {
    if (!targetBrandId) {
      setProfile(null);
      return;
    }

    try {
      const data = await brandApi.getProfileById(targetBrandId);
      setProfile(data);
      if (isOwner && data) {
        updateUser({
          firstName: (data as any).firstName,
          lastName: (data as any).lastName,
          username: (data as any).username,
          brandFullName: (data as any).brandFullName,
          phoneNumber: data?.phoneNumber ?? undefined,
          profileImage: (data as any).profileImage,
          profileImageId: (data as any).profileImageId,
          profileImageFile: (data as any).profileImageFile,
          bannerImage: (data as any).bannerImage,
          bannerImageId: (data as any).bannerImageId,
          bannerImageFile: (data as any).bannerImageMeta,
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Don't show toast for profile errors on initial load - will show empty state
    }
  }, [targetBrandId, isOwner, updateUser]);

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    if (!targetBrandId) {
      setCollections([]);
      setDrafts([]);
      return;
    }

    try {
      const visibility = visibilityFilter === 'Drafts' ? undefined : visibilityFilter.toUpperCase() as 'PUBLIC' | 'PRIVATE';
      const statusFilter = visibilityFilter === 'Drafts' ? 'DRAFT' : 'PUBLISHED';
      
      if (visibilityFilter === 'Drafts' && isOwner) {
        const data = await brandApi.getDrafts();
        catalogDevLog('load', {
          tab: visibilityFilter,
          brandId: targetBrandId,
          ownerId: userId,
          endpoint: '/designs/my/drafts',
          itemCount: data.length,
          status: 'DRAFT',
          visibility: null,
        });
        setDrafts(data);
      } else {
        const { items } = await brandApi.getCollections({
          brandId: targetBrandId,
          scope: 'all',
          visibility,
          status: statusFilter,
        });
        catalogDevLog('load', {
          tab: visibilityFilter,
          brandId: targetBrandId,
          ownerId: userId,
          endpoint: `/collections/user/${targetBrandId}`,
          itemCount: items.length,
          status: statusFilter,
          visibility: visibility ?? null,
        });
        setCollections(items);
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
      // Collections error will show empty state
    }
  }, [targetBrandId, visibilityFilter, isOwner, userId]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchProfile(),
        fetchCollections(),
        refreshPatchStatus({ silent: true }),
      ]);
      setIsLoading(false);
    };
    load();
  }, [fetchCollections, fetchProfile, refreshPatchStatus]);

  useFocusEffect(
    useCallback(() => {
      void fetchProfile();
    }, [fetchProfile]),
  );

  useEffect(() => {
    setActiveTab(normalizeTab(routeTab));
  }, [routeTab]);

  useEffect(() => {
    if (routeProductId) {
      setActiveTab('Shop');
    }
  }, [routeProductId]);

  useEffect(() => {
    if (!routeVisibility) return;
    setVisibilityFilter(normalizeVisibility(routeVisibility));
  }, [routeVisibility]);

  useEffect(() => {
    setIsAvatarModalOpen(false);
  }, [isOwner, targetBrandId]);

  const handleBackNavigation = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack()) {
          router.back();
          return true;
        }

        router.replace('/(tabs)');
        toast.info('Returned to Home. Press back again there to exit.');
        return true;
      });

      return () => subscription.remove();
    }, [toast]),
  );

  useEffect(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx >= 0) {
      tabSwipeProgress.value = idx;
    }
  }, [activeTab, tabSwipeProgress]);

  // Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchProfile(),
      fetchCollections(),
      refreshPatchStatus({ force: true, silent: true }),
    ]);
    setIsRefreshing(false);
  };

  // Handle patch/unpatch
  const handlePatch = async () => {
    if (!targetBrandId || patchLoading) return;
    try {
      const nextPatched = await togglePatchStatus();
      toast.success(nextPatched ? '🪡 Brand patched!' : 'Unpatched brand');
    } catch {
      toast.error('Could not update patch status. Please try again.');
    }
  };

  // Handle share
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${profile?.brandFullName || 'this brand'} on Threadly!`,
        url: `https://threadly.app/brand/${targetBrandId}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Handle collection actions
  const handleCollectionPress = useCallback((collection: CollectionDto) => {
    router.push({
      pathname: '/catalog/view/[collectionId]',
      params: {
        collectionId: collection.id,
        scope: collection.isAvailableInStore ? 'store' : 'design',
      },
    } as any);
  }, []);

  const handleEditCollection = useCallback((id: string) => {
    router.push({
      pathname: '/catalog/create-design',
      params: { designId: id },
    } as any);
  }, []);

  const handleDeleteCollection = useCallback((id: string) => {
    const target = [...drafts, ...collections].find((collection) => collection.id === id);
    setDraftDeleteTarget(target ?? ({ id, title: 'Untitled collection' } as CollectionDto));
    setDraftDeletePhrase('');
  }, [collections, drafts]);

  const confirmDraftDelete = useCallback(async () => {
    if (!draftDeleteTarget || draftDeletePhrase !== 'DELETE' || draftDeleteBusy) return;

    setDraftDeleteBusy(true);
    try {
      await brandApi.deleteCollection(draftDeleteTarget.id);
      setDraftDeleteTarget(null);
      setDraftDeletePhrase('');
      await fetchCollections();
      toast.success(visibilityFilter === 'Drafts' ? 'Draft deleted.' : 'Collection deleted.');
    } catch {
      toast.error('Could not delete this collection. Please try again.');
    } finally {
      setDraftDeleteBusy(false);
    }
  }, [draftDeleteBusy, draftDeletePhrase, draftDeleteTarget, fetchCollections, toast, visibilityFilter]);

  const ownerAvatar = useMemo(() => resolveProfileImageSource(profile as any), [profile]);
  const visitorAvatar = useMemo(() => resolveProfileImageSource(profile as any), [profile]);
  const visitorBanner = useMemo(() => resolveBannerImageSource(profile as any), [profile]);
  const ownerAvatarUri = useResolvedImageUri({
    src: ownerAvatar.src ?? undefined,
    fileId: ownerAvatar.fileId ?? undefined,
  });
  const visitorAvatarUri = useResolvedImageUri({
    src: visitorAvatar.src ?? undefined,
    fileId: visitorAvatar.fileId ?? undefined,
  });
  const modalAvatarUri = isOwner
    ? ownerAvatarUri ?? ownerAvatar.src ?? null
    : visitorAvatarUri ?? visitorAvatar.src ?? null;
  const profileLocation =
    [profile?.brandCity, profile?.brandState, profile?.brandCountry].filter(Boolean).join(', ') || undefined;

  const isStoreOpen = Boolean(profile?.isStoreOpen);

  const currentCollections = visibilityFilter === 'Drafts' ? drafts : collections;
  const showInitialSkeleton = isLoading && !profile && collections.length === 0 && drafts.length === 0;
  const overlayScrollPadding = standardScreenBottomPadding;

  // Tab configuration
  const tabs = [
    { key: 'Collections', label: 'Content' },
    { key: 'Shop', label: 'Shop' },
    { key: 'Reviews', label: 'Reviews' },
  ];

  const handleCreatePress = () => {
    if (canManageCatalog(user) && userEmailVerified === false) {
      toast.error('Verify your email before creating designs.');
      return;
    }
    setCreateMenuOpen(true);
  };

  const handleCreateAnchorLayout = useCallback(() => {
    if (!createMenuAnchorRef.current?.measureInWindow) return;

    createMenuAnchorRef.current.measureInWindow((pageX: number, pageY: number, width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setCreateMenuAnchorMetrics({ pageX, pageY, width, height });
    });
  }, []);

  const handleLaunchCreateDesign = useCallback(
    async (source: DesignEditorMediaSource) => {
      if (canManageCatalog(user) && userEmailVerified === false) {
        toast.error('Verify your email before creating designs.');
        return;
      }

      const pickResult = await pickDesignEditorMediaAssets({
        source,
        existingCount: 0,
      });

      if (pickResult.status === 'cancelled') {
        return;
      }

      if (pickResult.status === 'limit') {
        toast.error(pickResult.message);
        return;
      }

      if (pickResult.status === 'permission') {
        toast.error(pickResult.issue.message);
        return;
      }

      const handoffToken = stageDesignEditorAssetBundle(pickResult.assets);
      router.push({ pathname: '/catalog/create-design', params: { handoffToken } } as any);
    },
    [toast, user, userEmailVerified],
  );

  const createMenuOptions = useMemo(
    () => [
      {
        key: 'camera',
        icon: '📷',
        title: 'Camera',
        onPress: () => void handleLaunchCreateDesign('camera'),
      },
      {
        key: 'media',
        icon: '🖼️',
        title: 'Media',
        onPress: () => void handleLaunchCreateDesign('library'),
      },
      {
        key: 'attachment',
        icon: '📎',
        title: 'Attachment',
        onPress: () => void handleLaunchCreateDesign('library'),
      },
    ],
    [handleLaunchCreateDesign],
  );

  if (showInitialSkeleton) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CatalogLoadingSkeleton bottomPadding={overlayScrollPadding} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        style={styles.scrollView}
        contentInset={{ bottom: overlayScrollPadding }}
        scrollIndicatorInsets={{ bottom: overlayScrollPadding }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: overlayScrollPadding + tokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Profile Header */}
        {isOwner ? (
          <OwnerCatalogMediaHeader
            profile={profile}
            isLoading={false}
            onEditProfile={() => {
              if (!targetBrandId) return;
              router.push({ pathname: '/catalog/edit-profile', params: { brandId: targetBrandId } } as any);
            }}
            onViewAvatar={() => {
              if (ownerAvatarUri || ownerAvatar.src) {
                setIsAvatarModalOpen(true);
              }
            }}
            onShare={handleShare}
            onBack={handleBackNavigation}
          />
        ) : (
          <ProfileHeader
            brandName={profile?.brandFullName || 'Your Brand'}
            username={profile?.username || undefined}
            location={profileLocation}
            description={profile?.brandDescription ?? null}
            tags={profile?.brandTags || []}
            avatarUrl={visitorAvatarUri ?? visitorAvatar.src ?? undefined}
            avatarFileId={visitorAvatar.fileId ?? undefined}
            bannerUrl={visitorBanner.src ?? undefined}
            bannerFileId={visitorBanner.fileId ?? undefined}
            isOwner={false}
            isLoading={false}
            isPatched={isPatched}
            patchLoading={patchLoading}
            onPatch={status === 'authenticated' ? handlePatch : undefined}
            onViewAvatar={() => {
              if (visitorAvatarUri || visitorAvatar.src) {
                setIsAvatarModalOpen(true);
              }
            }}
            onShare={handleShare}
            onBack={handleBackNavigation}
          />
        )}

        {isOwner ? (
          <View style={styles.brandSwitcherWrap}>
            <BrandSwitcherSheet />
          </View>
        ) : null}

        {/* Tabs */}
        <View style={[styles.tabsWrapper, { borderBottomColor: theme.colors.border }]}>
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(key) => {
              setActiveTab(key as TabType);
            }}
            swipeProgress={tabSwipeProgress}
          />
        </View>



        <View style={styles.tabPane}>
          {activeTab === 'Collections' ? (
            <>
              <View style={styles.catalogControls}>
                <VisibilityFilter
                  selected={visibilityFilter}
                  onChange={setVisibilityFilter}
                  showDrafts={isOwner}
                  draftsCount={drafts.length}
                />

                {isOwner && (
                  <View ref={createMenuAnchorRef} onLayout={handleCreateAnchorLayout} collapsable={false}>
                    <Pressable
                      onPress={handleCreatePress}
                      style={({ pressed }) => [
                        styles.addButton,
                        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                      ]}
                      accessibilityLabel="Create menu"
                    >
                      <View style={[styles.addButtonSolid, { backgroundColor: theme.colors.primary }]}>
                        <AppText variant="subtitle" tone="inverse">+</AppText>
                      </View>
                    </Pressable>
                  </View>
                )}
              </View>

              <CollectionsGrid
                collections={currentCollections}
                isLoading={false}
                isOwner={isOwner}
                showDrafts={visibilityFilter === 'Drafts'}
                onCollectionPress={handleCollectionPress}
                onEdit={handleEditCollection}
                onDelete={handleDeleteCollection}
                emptyComponent={
                  <EmptyCollections
                    isOwner={isOwner}
                    onAdd={handleCreatePress}
                  />
                }
              />
            </>
          ) : null}

          {activeTab === 'Shop' ? (
            containerWidth > 0 && targetBrandId ? (
              <BrandShopTab
                brandId={targetBrandId}
                isOwner={isOwner}
                containerWidth={containerWidth}
                initialProductId={routeProductId ?? null}
              />
            ) : (
              <View style={styles.tabContent} />
            )
          ) : null}

          {activeTab === 'Reviews' ? (
            targetBrandId ? (
              <BrandReviewsTab brandId={targetBrandId} />
            ) : (
              <View style={styles.tabContent} />
            )
          ) : null}
        </View>
      </ScrollView>

      <MobileProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={modalAvatarUri}
        onClose={() => setIsAvatarModalOpen(false)}
      />

      <AppFloatingMenu
        visible={createMenuOpen}
        anchorRef={createMenuAnchorRef}
        anchorMetrics={createMenuAnchorMetrics}
        onClose={() => setCreateMenuOpen(false)}
        options={createMenuOptions}
      />

      <AppConfirmDialog
        visible={Boolean(draftDeleteTarget)}
        title={visibilityFilter === 'Drafts' ? 'Delete draft?' : 'Delete collection?'}
        description={`This permanently deletes "${draftDeleteTarget?.title || 'Untitled collection'}". This action cannot be reversed.`}
        confirmLabel={visibilityFilter === 'Drafts' ? 'Delete Draft' : 'Delete Collection'}
        destructive
        loading={draftDeleteBusy}
        confirmDisabled={draftDeletePhrase !== 'DELETE'}
        onCancel={() => {
          if (!draftDeleteBusy) {
            setDraftDeleteTarget(null);
            setDraftDeletePhrase('');
          }
        }}
        onConfirm={confirmDraftDelete}
      >
        <Input
          label="Type DELETE to confirm"
          value={draftDeletePhrase}
          onChangeText={setDraftDeletePhrase}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </AppConfirmDialog>


    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: tokens.spacing.xl,
  },
  skeletonScrollContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  skeletonHero: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  skeletonHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.lg,
  },
  skeletonHeroCopy: {
    flex: 1,
    gap: tokens.spacing.md,
  },
  skeletonTabsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  skeletonCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  skeletonCardTitle: {
    marginTop: tokens.spacing.xs,
  },
  tabsWrapper: {
    borderBottomWidth: 0,
  },
  brandSwitcherWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.xs,
  },
  catalogControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  addButton: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  addButtonSolid: {
    width: tokens.button.md.height,
    height: tokens.button.md.height,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tab content
  tabPane: {
    width: '100%',
    minHeight: 300,
  },
  tabContent: {
    flex: 1,
    minHeight: 300,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing['2xl'],
    paddingVertical: tokens.spacing['4xl'],
  },
  emptyTitle: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: tokens.spacing.sm,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: tokens.spacing.xl,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
});
