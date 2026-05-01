/**
 * Catalog Screen - Mobile
 * Brand catalog page with profile header, collections, reviews, and about tabs
 * Routes: /catalog (owner view) or /catalog/[brandId] (visitor view)
 * Rule 5: emoji-only markers | Rule 6: rounded-square avatars
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { BackHandler, LayoutChangeEvent, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Reanimated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuthSession } from '@/src/auth/AuthContext';
import { brandApi, type BrandProfileDto, type CollectionDto } from '@/src/api/BrandApi';
import { OwnerCatalogMediaHeader } from '@/components/catalog/OwnerCatalogMediaHeader';
import { ProfileHeader } from '@/components/catalog/ProfileHeader';
import MobileProfileImageModal from '@/components/profile/ProfileImageModal';
import { Tabs } from '@/components/catalog/Tabs';
import { CollectionsGrid } from '@/components/catalog/CollectionsGrid';
import { VisibilityFilter } from '@/components/catalog/VisibilityFilter';
import { SkeletonText } from '@/components/ui/Skeleton';
import { LoaderBlock } from '@/components/ui/AppLoader';
import { useToast } from '@/src/toast/ToastContext';
import { useBrandPatchStatus } from '@/src/hooks/useBrandPatchStatus';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { resolveBannerImageSource, resolveProfileImageSource } from '@/src/utils/profileImage';
import { BrandShopTab } from '@/components/catalog/BrandShopTab';
import { BrandReviewsTab } from '@/components/catalog/BrandReviewsTab';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppActionSheet } from '@/components/ui/AppActionSheet';
import { AppConfirmDialog } from '@/components/ui/AppConfirmDialog';
import { NATIVE_ISLAND_NAV } from '@/components/navigation/NativeIslandBottomNav';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TabType = 'Collections' | 'Shop' | 'Reviews';
type VisibilityType = 'Public' | 'Private' | 'Drafts';
const TAB_ORDER: TabType[] = ['Collections', 'Shop', 'Reviews'];

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
      <AppText variant="body" tone="muted" style={styles.emptySubtitle}>
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
  const insets = useSafeAreaInsets();
  const { status, userId, userType, updateUser } = useAuthSession();
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
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const tabSwipeProgress = useSharedValue(TAB_ORDER.indexOf(activeTab));

  // Determine if owner view
  const isOwner = Boolean(userType === 'BRAND' && (!routeBrandId || routeBrandId === userId));
  const targetBrandId = routeBrandId || userId;
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
        setDrafts(data);
      } else {
        const { items } = await brandApi.getCollections({
          brandId: targetBrandId,
          visibility,
          status: statusFilter,
        });
        setCollections(items);
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
      // Collections error will show empty state
    }
  }, [targetBrandId, visibilityFilter, isOwner]);

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
    if (idx >= 0 && containerWidth <= 0) {
      tabSwipeProgress.value = idx;
    }
    if (idx >= 0 && horizontalScrollRef.current && containerWidth > 0) {
      horizontalScrollRef.current.scrollTo({ x: idx * containerWidth, animated: true });
    }
  }, [activeTab, containerWidth, tabSwipeProgress]);

  const handleHorizontalScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        if (containerWidth <= 0) return;
        tabSwipeProgress.value = event.contentOffset.x / containerWidth;
      },
    },
    [containerWidth],
  );

  const handleHorizontalScrollEnd = useCallback((e: any) => {
    if (containerWidth <= 0) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / containerWidth);
    if (TAB_ORDER[idx] && TAB_ORDER[idx] !== activeTab) {
      setActiveTab(TAB_ORDER[idx]);
    }
  }, [containerWidth, activeTab]);

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
  const overlayScrollPadding = useMemo(
    () => NATIVE_ISLAND_NAV.contentClearance + insets.bottom,
    [insets.bottom],
  );

  // Tab configuration
  const tabs = [
    { key: 'Collections', label: 'Content' },
    { key: 'Shop', label: 'Shop' },
    { key: 'Reviews', label: 'Reviews' },
  ];

  const handleCreatePress = () => {
    setCreateSheetOpen(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {showInitialSkeleton ? (
        <View style={styles.initialSkeletonWrap}>
          <LoaderBlock message="Loading catalog" minHeight={360} />
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentInset={{ bottom: overlayScrollPadding }}
        scrollIndicatorInsets={{ bottom: overlayScrollPadding }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: overlayScrollPadding }]}
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



        {/* Tab Content inside Horizontal ScrollView */}
        <Reanimated.ScrollView
          ref={horizontalScrollRef as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleHorizontalScroll}
          onMomentumScrollEnd={handleHorizontalScrollEnd}
          onScrollEndDrag={handleHorizontalScrollEnd}
          scrollEventThrottle={16}
        >
          {/* Collections Tab */}
          <View style={{ width: containerWidth || '100%' }}>
            <View style={styles.catalogControls}>
              <VisibilityFilter
                selected={visibilityFilter}
                onChange={setVisibilityFilter}
                showDrafts={isOwner}
                draftsCount={drafts.length}
              />

              {isOwner && (
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
              )}
            </View>

            {/* Collections Grid */}
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
          </View>

          {/* Shop Tab */}
          <View style={{ width: containerWidth || '100%' }}>
            {containerWidth > 0 && targetBrandId ? (
              <BrandShopTab
                brandId={targetBrandId}
                isOwner={isOwner}
                containerWidth={containerWidth}
                initialProductId={routeProductId ?? null}
              />
            ) : (
              <View style={styles.tabContent} />
            )}
          </View>

          {/* Reviews Tab */}
          <View style={{ width: containerWidth || '100%' }}>
            {targetBrandId ? <BrandReviewsTab brandId={targetBrandId} /> : <View style={styles.tabContent} />}
          </View>
        </Reanimated.ScrollView>
      </ScrollView>

      <MobileProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={modalAvatarUri}
        onClose={() => setIsAvatarModalOpen(false)}
      />

      <AppActionSheet
        visible={createSheetOpen}
        title="Create"
        subtitle="Choose a media source for this design."
        onClose={() => setCreateSheetOpen(false)}
        options={[
          {
            key: 'camera',
            icon: '📷',
            title: 'Camera',
            description: 'Capture a new photo or video.',
            onPress: () => router.push({ pathname: '/catalog/create-design', params: { source: 'camera' } } as any),
          },
          {
            key: 'media',
            icon: '🖼️',
            title: 'Media',
            description: 'Pick images or videos from your library.',
            onPress: () => router.push({ pathname: '/catalog/create-design', params: { source: 'library' } } as any),
          },
          {
            key: 'attachment',
            icon: '📎',
            title: 'Attachment',
            description: 'Attach an existing photo or video from your device.',
            onPress: () => router.push({ pathname: '/catalog/create-design', params: { source: 'library' } } as any),
          },
        ]}
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
  initialSkeletonWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  tabsWrapper: {
    borderBottomWidth: 0,
  },
  catalogControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  addButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  addButtonGradient: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonSolid: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tab content
  tabContent: {
    flex: 1,
    minHeight: 300,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // About tab
  aboutContent: {
    padding: 16,
    gap: 16,
  },
  aboutCard: {
    borderRadius: 16,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  contactCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 14,
  },
  contactText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },

});
