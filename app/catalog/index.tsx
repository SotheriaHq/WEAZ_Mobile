/**
 * Catalog Screen - Mobile
 * Brand catalog page with profile header, collections, reviews, and about tabs
 * Routes: /catalog (owner view) or /catalog/[brandId] (visitor view)
 * Rule 5: emoji-only markers | Rule 6: rounded-square avatars
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  BackHandler,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuth, useAuthSession } from '@/src/auth/AuthContext';
import { canManageCatalog, getActiveBrandId } from '@/src/auth/brandAccess';
import { brandApi, type BrandProfileDto, type CollectionDto } from '@/src/api/BrandApi';
import { ProfilePhotoViewApi } from '@/src/api/ProfilePhotoViewApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { OwnerCatalogMediaHeader } from '@/components/catalog/OwnerCatalogMediaHeader';
import { BrandProfileHeader, BrandProfileHeaderSkeleton, type BrandHeaderContactItem, type BrandHeaderStat } from '@/components/catalog/BrandProfileHeader';
import MobileProfileImageModal from '@/components/profile/ProfileImageModal';
import { Tabs } from '@/components/catalog/Tabs';
import { CollectionsGrid } from '@/components/catalog/CollectionsGrid';
import { VisibilityFilter } from '@/components/catalog/VisibilityFilter';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/src/toast/ToastContext';
import { useBrandPatchStatus } from '@/src/hooks/useBrandPatchStatus';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { resolveBannerImageSource, resolveProfileImageSource } from '@/src/utils/profileImage';
import { BrandShopTab } from '@/components/catalog/BrandShopTab';
import { BrandReviewsTab } from '@/components/catalog/BrandReviewsTab';
import EmailVerificationNotice from '@/components/auth/EmailVerificationNotice';
import { getBrandBadges } from '@/components/catalog/ProfileBadge';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppConfirmDialog } from '@/components/ui/AppConfirmDialog';
import { AppActionSheet, type AppActionSheetOption } from '@/components/ui/AppActionSheet';
import { AppFloatingMenu, type FloatingMenuOption } from '@/components/ui/AppFloatingMenu';
import { AppQrSheet } from '@/components/ui/AppQrSheet';
import { BrandSwitcherSheet } from '@/components/brand/BrandSwitcherSheet';
import type { DesignEditorMediaSource } from '@/src/features/design-editor/designEditorMediaFlow';
import {
  readDesignEditorBackgroundTasks,
  removeDesignEditorBackgroundTask,
  subscribeDesignEditorBackgroundTasks,
  type DesignEditorBackgroundTask,
} from '@/src/features/design-editor/designEditorBackgroundTasks';
import { tokens } from '@/src/styles/tokens';
import { catalogDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { formatCount } from '@/src/utils/formatCount';
import { env } from '@/src/config/env';
import { routeForDesignTarget, routeForStoreCollectionTarget } from '@/src/utils/mobileRouting';
import { perfMark } from '@/src/utils/perf';
import { navPerf } from '@/src/utils/navPerf';
import {
  refreshBrandCollectionsQuery,
  refreshBrandDraftsQuery,
  refreshBrandProfileQuery,
  useBrandCollectionsQuery,
  useBrandDraftsQuery,
  useBrandProfileQuery,
} from '@/src/query/catalogQueries';
import { THREADLY_SAVED_STATUS_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TabType = 'Collections' | 'Shop' | 'Reviews';
type VisibilityType = 'Public' | 'Private' | 'Drafts' | 'In Review' | 'Changes Requested' | 'Rejected';
const TAB_ORDER: TabType[] = ['Collections', 'Shop', 'Reviews'];
const REVIEW_VISIBILITY_STATUS: Partial<Record<VisibilityType, 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED'>> = {
  'In Review': 'IN_REVIEW',
  'Changes Requested': 'CHANGES_REQUESTED',
  Rejected: 'REJECTED',
};

function readMetricNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readContactValue(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProfileUrlFromConfig(brandId: string | null, username?: string | null): string | null {
  if (!brandId) return null;

  const baseUrl = env.webAppUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return null;

  if (!__DEV__ && /(?:localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    return null;
  }

  const cleanUsername = username?.trim();
  const path = cleanUsername
    ? `/u/${encodeURIComponent(cleanUsername)}`
    : `/profile/${encodeURIComponent(brandId)}`;

  return `${baseUrl}${path}`;
}

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
      <BrandProfileHeaderSkeleton />

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
        No Content Yet
      </AppText>
      <AppText variant="bodyRegular" tone="muted" style={styles.emptySubtitle}>
        {isOwner
          ? 'Start showcasing your fashion by creating your first design.'
          : 'This brand has not published content yet.'}
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
  const { width: windowWidth } = useWindowDimensions();
  const { standardScreenBottomPadding } = useScreenChrome();
  const { user } = useAuth();
  const { status, userId, userType, userEmailVerified, updateUser } = useAuthSession();
  const toast = useToast();
  const queryClient = useQueryClient();
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
    if (key === 'in review' || key === 'in_review' || key === 'in-review') return 'In Review';
    if (key === 'changes requested' || key === 'changes_requested' || key === 'changes-requested') return 'Changes Requested';
    if (key === 'rejected') return 'Rejected';
    return 'Public';
  };

  // State
  const [profile, setProfile] = useState<BrandProfileDto | null>(null);
  const profileRef = useRef<BrandProfileDto | null>(null);
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [drafts, setDrafts] = useState<CollectionDto[]>([]);
  const [designBackgroundTasks, setDesignBackgroundTasks] = useState<DesignEditorBackgroundTask[]>(
    () => readDesignEditorBackgroundTasks(),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>(() => normalizeTab(routeTab));
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityType>(() => normalizeVisibility(routeVisibility));
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<CollectionDto | null>(null);
  const [draftDeletePhrase, setDraftDeletePhrase] = useState('');
  const [draftDeleteBusy, setDraftDeleteBusy] = useState(false);
  const [savedCatalogById, setSavedCatalogById] = useState<Record<string, boolean>>({});
  const [savingCatalogById, setSavingCatalogById] = useState<Record<string, boolean>>({});
  const [shareActionsOpen, setShareActionsOpen] = useState(false);
  const [createOptionsOpen, setCreateOptionsOpen] = useState(false);
  const createAnchorRef = useRef<View | null>(null);
  const [createAnchorMetrics, setCreateAnchorMetrics] = useState<{
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null>(null);
  const [brandQrOpen, setBrandQrOpen] = useState(false);
  const [tabHeights, setTabHeights] = useState<Partial<Record<TabType, number>>>({});
  const tabPagerRef = useRef<ScrollView>(null);
  // Tracks whether the last tab change came from a user swipe. When true, the
  // activeTab effect skips the programmatic scrollTo to avoid fighting the pager.
  const tabChangeFromSwipeRef = useRef(false);
  const completedTaskRefreshKeyRef = useRef<string | null>(null);
  const tabSwipeProgress = useSharedValue(TAB_ORDER.indexOf(activeTab));
  const activeTabPagerHeight = tabHeights[activeTab];

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Determine if owner view
  const activeBrandId = getActiveBrandId(user);
  const isOwner = Boolean(canManageCatalog(user) && (!routeBrandId || routeBrandId === activeBrandId));
  const targetBrandId = routeBrandId || activeBrandId || null;
  // Patching is a REGULAR-user-only action. The backend `patches/check` endpoint
  // is guarded by UserTypeGuard(REGULAR) and 403s for BRAND/owner/guest viewers,
  // which surfaced as a runtime "Endpoint requires user type REGULAR" error.
  // Only call it when the current viewer is an authenticated REGULAR user who is
  // not the owner of this brand.
  const patchEnabled = Boolean(
    !isOwner && status === 'authenticated' && userType === 'REGULAR' && targetBrandId,
  );
  const {
    isPatched,
    loading: patchLoading,
    refresh: refreshPatchStatus,
    toggle: togglePatchStatus,
  } = useBrandPatchStatus({
    brandId: patchEnabled ? targetBrandId : undefined,
    enabled: patchEnabled,
  });

  const getCollectionOwnerId = useCallback(
    (sourceProfile?: BrandProfileDto | null) =>
      sourceProfile?.id ?? profileRef.current?.id ?? (isOwner ? userId : targetBrandId),
    [isOwner, targetBrandId, userId],
  );

  const profileQuery = useBrandProfileQuery(targetBrandId, { enabled: Boolean(targetBrandId) });
  const collectionOwnerId = getCollectionOwnerId(profileQuery.data !== undefined ? profileQuery.data : profile);
  const reviewStatusFilter = REVIEW_VISIBILITY_STATUS[visibilityFilter];
  const collectionVisibility = visibilityFilter === 'Drafts' || reviewStatusFilter
    ? undefined
    : visibilityFilter.toUpperCase() as 'PUBLIC' | 'PRIVATE';
  const collectionStatusFilter = visibilityFilter === 'Drafts'
    ? 'DRAFT'
    : reviewStatusFilter ?? 'PUBLISHED';
  const collectionsQuery = useBrandCollectionsQuery(
    {
      ownerId: collectionOwnerId,
      scope: 'all',
      visibility: collectionVisibility,
      status: collectionStatusFilter,
      limit: 80,
    },
    { enabled: Boolean(collectionOwnerId) && visibilityFilter !== 'Drafts' },
  );
  const draftsQuery = useBrandDraftsQuery({
    ownerId: collectionOwnerId,
    enabled: isOwner && visibilityFilter === 'Drafts' && Boolean(collectionOwnerId),
  });
  const effectiveProfile = profileQuery.data !== undefined ? profileQuery.data : profile;
  const effectiveCollections = collectionsQuery.data ?? collections;
  const effectiveDrafts = draftsQuery.data ?? drafts;

  const fetchProfile = useCallback(async (options?: { forceRefresh?: boolean }): Promise<BrandProfileDto | null> => {
    if (!targetBrandId) {
      profileRef.current = null;
      setProfile(null);
      return null;
    }

    try {
      const data = options?.forceRefresh
        ? await refreshBrandProfileQuery(queryClient, targetBrandId)
        : profileQuery.data !== undefined
          ? profileQuery.data
          : profileRef.current;
      if (!data) return null;
      profileRef.current = data;
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
          profilePhotoUpdatedAt: (data as any).profilePhotoUpdatedAt,
          bannerImage: (data as any).bannerImage,
          bannerImageId: (data as any).bannerImageId,
          bannerImageFile: (data as any).bannerImageMeta,
        });
      }
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Don't show toast for profile errors on initial load - will show empty state
      return null;
    }
  }, [isOwner, profileQuery.data, queryClient, targetBrandId, updateUser]);

  // Fetch collections
  const fetchCollections = useCallback(async (
    profileOverride?: BrandProfileDto | null,
    options?: { forceRefresh?: boolean },
  ) => {
    const collectionOwnerId = getCollectionOwnerId(profileOverride);
    const profileOwnerId = profileOverride?.id ?? profileRef.current?.id ?? null;

    if (!collectionOwnerId) {
      setCollections([]);
      setDrafts([]);
      return;
    }

    try {
      if (visibilityFilter === 'Drafts' && isOwner) {
        const data = options?.forceRefresh
          ? await refreshBrandDraftsQuery(queryClient, collectionOwnerId)
          : draftsQuery.data ?? drafts;
        catalogDevLog('load', {
          tab: visibilityFilter,
          routeBrandId: targetBrandId,
          profileOwnerId,
          collectionOwnerId,
          ownerId: userId,
          endpoint: '/designs/my/drafts',
          itemCount: data.length,
          status: 'DRAFT',
          visibility: null,
        });
        setDrafts(data);
      } else {
        const items = options?.forceRefresh
          ? await refreshBrandCollectionsQuery(queryClient, {
            ownerId: collectionOwnerId,
            scope: 'all',
            visibility: collectionVisibility,
            status: collectionStatusFilter,
            limit: 80,
          })
          : collectionsQuery.data ?? collections;
        catalogDevLog('load', {
          tab: visibilityFilter,
          routeBrandId: targetBrandId,
          profileOwnerId,
          collectionOwnerId,
          ownerId: userId,
          endpoint: `/collections/user/${collectionOwnerId}`,
          itemCount: items.length,
          status: collectionStatusFilter,
          visibility: collectionVisibility ?? null,
        });
        setCollections(items);
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
      // Collections error will show empty state
    }
  }, [
    collectionStatusFilter,
    collectionVisibility,
    collections,
    collectionsQuery.data,
    drafts,
    draftsQuery.data,
    getCollectionOwnerId,
    isOwner,
    queryClient,
    targetBrandId,
    userId,
    visibilityFilter,
  ]);

  useEffect(() => {
    if (profileQuery.data === undefined) return;
    const data = profileQuery.data;
    profileRef.current = data ?? null;
    setProfile(data ?? null);
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
        profilePhotoUpdatedAt: (data as any).profilePhotoUpdatedAt,
        bannerImage: (data as any).bannerImage,
        bannerImageId: (data as any).bannerImageId,
        bannerImageFile: (data as any).bannerImageMeta,
      });
    }
  }, [isOwner, profileQuery.data, updateUser]);

  useEffect(() => {
    if (collectionsQuery.data) {
      setCollections(collectionsQuery.data);
    }
  }, [collectionsQuery.data]);

  useEffect(() => {
    if (draftsQuery.data) {
      setDrafts(draftsQuery.data);
    }
  }, [draftsQuery.data]);

  useEffect(() => {
    if (profileQuery.error) {
      console.error('Error fetching profile:', profileQuery.error);
    }
    if (collectionsQuery.error) {
      console.error('Error fetching collections:', collectionsQuery.error);
    }
    if (draftsQuery.error) {
      console.error('Error fetching drafts:', draftsQuery.error);
    }
  }, [collectionsQuery.error, draftsQuery.error, profileQuery.error]);

  useEffect(() => {
    if (patchEnabled) {
      void refreshPatchStatus({ silent: true });
    }
  }, [patchEnabled, refreshPatchStatus]);

  useEffect(() => subscribeDesignEditorBackgroundTasks(() => {
    setDesignBackgroundTasks(readDesignEditorBackgroundTasks());
  }), []);

  useFocusEffect(
    useCallback(() => {
      setDesignBackgroundTasks(readDesignEditorBackgroundTasks());
    }, []),
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

  // Visitors only ever see published public content. Owner-only sub-filters
  // (Private/Drafts/In Review/Changes Requested/Rejected) must never be selected
  // for a non-owner — force the Public filter so the visitor view cannot request
  // or display owner-only statuses, and the sub-filter bar is hidden below.
  useEffect(() => {
    if (!isOwner && visibilityFilter !== 'Public') {
      setVisibilityFilter('Public');
    }
  }, [isOwner, visibilityFilter]);

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
      if (!tabChangeFromSwipeRef.current && containerWidth > 0) {
        tabPagerRef.current?.scrollTo({ x: idx * containerWidth, animated: true });
      }
      tabChangeFromSwipeRef.current = false;
    }
  }, [activeTab, containerWidth, tabSwipeProgress]);

  // Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    const loadedProfile = await fetchProfile({ forceRefresh: true });
    await Promise.all([
      fetchCollections(loadedProfile, { forceRefresh: true }),
      refreshPatchStatus({ force: true, silent: true }),
    ]);
    setIsRefreshing(false);
  };

  const handleMainTabChange = useCallback(
    (key: string) => {
      const nextTab = key as TabType;
      const index = TAB_ORDER.indexOf(nextTab);
      if (index < 0) return;
      setActiveTab(nextTab);
      if (containerWidth > 0) {
        tabPagerRef.current?.scrollTo({ x: index * containerWidth, animated: true });
      }
    },
    [containerWidth],
  );

  const handleTabPagerScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (containerWidth <= 0) return;
      tabSwipeProgress.value = event.nativeEvent.contentOffset.x / containerWidth;
    },
    [containerWidth, tabSwipeProgress],
  );

  const handleTabPagerMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (containerWidth <= 0) return;
      const nextIndex = Math.max(0, Math.min(TAB_ORDER.length - 1, Math.round(event.nativeEvent.contentOffset.x / containerWidth)));
      const nextTab = TAB_ORDER[nextIndex];
      tabSwipeProgress.value = nextIndex;
      if (nextTab && nextTab !== activeTab) {
        tabChangeFromSwipeRef.current = true;
        setActiveTab(nextTab);
      }
    },
    [activeTab, containerWidth, tabSwipeProgress],
  );

  const handleTabPageLayout = useCallback((tab: TabType, event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (height <= 0) return;

    setTabHeights((current) => (
      current[tab] === height ? current : { ...current, [tab]: height }
    ));
  }, []);

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

  // Handle collection actions
  const handleCollectionPress = useCallback((collection: CollectionDto) => {
    if (collection.clientStatus) {
      return;
    }

    router.push(
      collection.isAvailableInStore
        ? routeForStoreCollectionTarget(collection.id)
        : routeForDesignTarget(collection.id, { legacyCollectionId: collection.id }) as any,
    );
  }, []);

  const handleEditCollection = useCallback((id: string) => {
    router.push({
      pathname: '/designs/[designId]/edit',
      params: { designId: id },
    } as any);
  }, []);

  // Dismiss a failed publish/draft background task from the Needs-attention banner.
  const handleDismissFailedTask = useCallback((taskId: string) => {
    removeDesignEditorBackgroundTask(taskId);
    setDesignBackgroundTasks(readDesignEditorBackgroundTasks());
  }, []);

  // Retry a failed publish/draft: route to the editor pre-populated with the
  // previous design when we have its id, otherwise open a fresh composer. The
  // failed task is cleared so it no longer lingers.
  const handleRetryFailedTask = useCallback(
    (task: DesignEditorBackgroundTask) => {
      removeDesignEditorBackgroundTask(task.id);
      setDesignBackgroundTasks(readDesignEditorBackgroundTasks());
      if (task.designId) {
        router.push({
          pathname: '/designs/[designId]/edit',
          params: { designId: task.designId },
        } as any);
        return;
      }
      router.push('/catalog/create-design/composer' as any);
    },
    [],
  );

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
      await fetchCollections(undefined, { forceRefresh: true });
      toast.success(visibilityFilter === 'Drafts' ? 'Draft deleted.' : 'Collection deleted.');
    } catch {
      toast.error('Could not delete this collection. Please try again.');
    } finally {
      setDraftDeleteBusy(false);
    }
  }, [draftDeleteBusy, draftDeletePhrase, draftDeleteTarget, fetchCollections, toast, visibilityFilter]);

  const ownerAvatar = useMemo(() => resolveProfileImageSource(effectiveProfile as any), [effectiveProfile]);
  const visitorAvatar = useMemo(() => resolveProfileImageSource(effectiveProfile as any), [effectiveProfile]);
  const visitorBanner = useMemo(() => resolveBannerImageSource(effectiveProfile as any), [effectiveProfile]);
  const ownerAvatarUri = useResolvedImageUri({
    src: ownerAvatar.src ?? undefined,
    fileId: ownerAvatar.fileId ?? undefined,
    allowSignedFallback: true,
  });
  const visitorAvatarUri = useResolvedImageUri({
    src: visitorAvatar.src ?? undefined,
    fileId: visitorAvatar.fileId ?? undefined,
    allowSignedFallback: false,
  });
  const modalAvatarUri = isOwner
    ? ownerAvatarUri ?? ownerAvatar.src ?? null
    : visitorAvatarUri ?? visitorAvatar.src ?? null;
  const profileLocation =
    effectiveProfile?.location ||
    [effectiveProfile?.brandCity, effectiveProfile?.brandState, effectiveProfile?.brandCountry].filter(Boolean).join(', ') ||
    undefined;
  const profileShareUrl = useMemo(
    () =>
      effectiveProfile?.shareUrl ??
      effectiveProfile?.publicProfileUrl ??
      effectiveProfile?.qrTargetUrl ??
      buildProfileUrlFromConfig(targetBrandId, effectiveProfile?.username ?? user?.username ?? null),
    [
      effectiveProfile?.publicProfileUrl,
      effectiveProfile?.qrTargetUrl,
      effectiveProfile?.shareUrl,
      effectiveProfile?.username,
      targetBrandId,
      user?.username,
    ],
  );
  const profileQrTargetUrl = useMemo(
    () =>
      effectiveProfile?.qrTargetUrl ??
      effectiveProfile?.publicProfileUrl ??
      effectiveProfile?.shareUrl ??
      profileShareUrl,
    [effectiveProfile?.publicProfileUrl, effectiveProfile?.qrTargetUrl, effectiveProfile?.shareUrl, profileShareUrl],
  );
  const profileShareMessage = useMemo(() => {
    if (!profileShareUrl) return undefined;
    return `Check out ${effectiveProfile?.brandFullName || 'this brand'} on WEAZ: ${profileShareUrl}`;
  }, [effectiveProfile?.brandFullName, profileShareUrl]);

  const applyProfilePhotoViewState = useCallback(
    (nextState: NonNullable<BrandProfileDto['profilePhotoViewState']>) => {
      if (!targetBrandId) return;
      setProfile((current) => {
        const next = current
          ? {
              ...current,
              profilePhotoUpdatedAt: nextState.profilePhotoUpdatedAt,
              profilePhotoViewState: nextState,
            }
          : current;
        profileRef.current = next;
        return next;
      });
      queryClient.setQueryData(
        queryKeys.brand.profile(targetBrandId),
        (current: BrandProfileDto | null | undefined) =>
          current
            ? {
                ...current,
                profilePhotoUpdatedAt: nextState.profilePhotoUpdatedAt,
                profilePhotoViewState: nextState,
              }
            : current,
      );
      brandApi.invalidateBrandProfileCache(targetBrandId);
    },
    [queryClient, targetBrandId],
  );

  const handleViewOwnerAvatar = useCallback(() => {
    if (!ownerAvatarUri && !ownerAvatar.src) {
      return;
    }

    setIsAvatarModalOpen(true);

    if (!targetBrandId || !effectiveProfile?.profilePhotoViewState?.canMarkViewed) {
      return;
    }

    void ProfilePhotoViewApi.markViewed(targetBrandId)
      .then(applyProfilePhotoViewState)
      .catch((error) => {
        console.error('Failed to mark profile photo viewed', error);
      });
  }, [
    applyProfilePhotoViewState,
    effectiveProfile?.profilePhotoViewState,
    ownerAvatar.src,
    ownerAvatarUri,
    targetBrandId,
  ]);

  const handleViewVisitorAvatar = useCallback(() => {
    if (visitorAvatarUri || visitorAvatar.src) {
      setIsAvatarModalOpen(true);
    }
    if (!targetBrandId || !effectiveProfile?.profilePhotoViewState?.canMarkViewed) {
      return;
    }
    void ProfilePhotoViewApi.markViewed(targetBrandId)
      .then(applyProfilePhotoViewState)
      .catch((error) => {
        console.error('Failed to mark profile photo viewed', error);
      });
  }, [
    applyProfilePhotoViewState,
    effectiveProfile?.profilePhotoViewState,
    targetBrandId,
    visitorAvatar.src,
    visitorAvatarUri,
  ]);

  // Handle share
  const handleNativeShareProfile = useCallback(async () => {
    if (!profileShareUrl || !profileShareMessage) {
      toast.error('Profile link is not available yet.');
      return;
    }

    try {
      await Share.share({
        message: profileShareMessage,
        url: profileShareUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  }, [profileShareMessage, profileShareUrl, toast]);

  const handleCopyProfileLink = useCallback(async () => {
    if (!profileShareUrl) {
      toast.error('Profile link is not available yet.');
      return;
    }

    await Clipboard.setStringAsync(profileShareUrl);
    toast.success('Profile link copied.');
  }, [profileShareUrl, toast]);

  const currentCollections = visibilityFilter === 'Drafts' ? effectiveDrafts : effectiveCollections;
  const visibleDesignBackgroundTasks = useMemo(() => {
    if (!isOwner || activeTab !== 'Collections') return [];

    return designBackgroundTasks.filter((task) => {
      if (task.action === 'draft') return visibilityFilter === 'Drafts';
      if (task.visibility === 'PRIVATE') return visibilityFilter === 'Private';
      return visibilityFilter === 'Public';
    });
  }, [activeTab, designBackgroundTasks, isOwner, visibilityFilter]);
  // Failed publish/draft attempts must NEVER render as cards in the Public/Private
  // grid (they showed as "Validation failed / Image unavailable" cards). Only
  // in-progress ("running") tasks render as optimistic cards; failed tasks are
  // surfaced separately in the Needs-attention banner with Retry/Dismiss.
  const failedDesignTasks = useMemo(
    () => visibleDesignBackgroundTasks.filter((task) => task.status === 'failed'),
    [visibleDesignBackgroundTasks],
  );
  const runningDesignBackgroundTasks = useMemo(
    () => visibleDesignBackgroundTasks.filter((task) => task.status === 'running'),
    [visibleDesignBackgroundTasks],
  );
  const backgroundTaskCollections = useMemo<CollectionDto[]>(
    () =>
      runningDesignBackgroundTasks.map((task) => ({
        id: task.id,
        entityType: 'DESIGN',
        title: task.title,
        description: task.error ?? task.message,
        visibility: task.visibility,
        status: task.action === 'draft' ? 'DRAFT' : 'PUBLISHED',
        coverImage: task.previewUri ?? null,
        coverFileId: null,
        likesCount: 0,
        commentsCount: 0,
        itemCount: task.previewUri ? 1 : 0,
        postsCount: task.previewUri ? 1 : 0,
        minPrice: 0,
        maxPrice: 0,
        saleMinPrice: null,
        saleMaxPrice: null,
        saleStartAt: null,
        saleEndAt: null,
        brandName: effectiveProfile?.brandFullName ?? effectiveProfile?.username ?? null,
        username: effectiveProfile?.username ?? null,
        brandLogo: ownerAvatarUri ?? effectiveProfile?.profileImage ?? null,
        brandLogoFileId: effectiveProfile?.profileImageId ?? effectiveProfile?.logoImageId ?? null,
        isAvailableInStore: false,
        ownerId: userId ?? targetBrandId ?? '',
        createdAt: new Date(task.startedAt).toISOString(),
        updatedAt: new Date(task.updatedAt).toISOString(),
        clientStatus: 'publishing',
        clientStatusMessage: task.message,
      })),
    [effectiveProfile, ownerAvatarUri, targetBrandId, userId, runningDesignBackgroundTasks],
  );
  const currentCollectionsWithBackgroundTasks = useMemo(() => {
    if (backgroundTaskCollections.length === 0) return currentCollections;

    const taskDesignIds = new Set(
      runningDesignBackgroundTasks
        .map((task) => task.designId)
        .filter((id): id is string => Boolean(id)),
    );

    return [
      ...backgroundTaskCollections,
      ...currentCollections.filter((collection) => !taskDesignIds.has(collection.id)),
    ];
  }, [backgroundTaskCollections, currentCollections, runningDesignBackgroundTasks]);
  const savedCatalogIds = useMemo(
    () =>
      Array.from(
        new Set(
          currentCollectionsWithBackgroundTasks
            .map((collection) => collection.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ).sort(),
    [currentCollectionsWithBackgroundTasks],
  );
  const savedCatalogIdsKey = savedCatalogIds.join('|');

  useEffect(() => {
    if (isOwner || status !== 'authenticated') {
      setSavedCatalogById({});
      return;
    }

    if (savedCatalogIds.length === 0) {
      setSavedCatalogById({});
      return;
    }

    let cancelled = false;
    queryClient.fetchQuery({
      queryKey: queryKeys.saved.batch('COLLECTION', savedCatalogIds),
      queryFn: () => SavedItemsApi.checkBatch('COLLECTION', savedCatalogIds),
      staleTime: THREADLY_SAVED_STATUS_STALE_TIME_MS,
    })
      .then((result) => {
        if (cancelled) return;
        setSavedCatalogById(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isOwner, queryClient, savedCatalogIds, savedCatalogIdsKey, status]);

  useEffect(() => {
    const completedVisibleTasks = visibleDesignBackgroundTasks.filter((task) => task.status === 'complete');
    if (completedVisibleTasks.length === 0) return;
    const completedTaskIds = completedVisibleTasks.map((task) => task.id).sort();
    const refreshKey = `${visibilityFilter}:${completedTaskIds.join('|')}`;
    if (completedTaskRefreshKeyRef.current === refreshKey) return;
    completedTaskRefreshKeyRef.current = refreshKey;

    completedVisibleTasks.forEach((task) => removeDesignEditorBackgroundTask(task.id));
    setDesignBackgroundTasks(readDesignEditorBackgroundTasks());

    let cancelled = false;
    void (async () => {
      try {
        await fetchCollections(undefined, { forceRefresh: true });
      } catch {
        if (!cancelled) {
          completedTaskRefreshKeyRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchCollections, visibilityFilter, visibleDesignBackgroundTasks]);

  const headerStats = useMemo<BrandHeaderStat[]>(() => {
    const backendDesigns = readMetricNumber(effectiveProfile?.designsCount) ?? readMetricNumber(effectiveProfile?.collectionsCount);
    const localDesigns = Math.max(effectiveCollections.length, currentCollectionsWithBackgroundTasks.length);
    const designsCount = backendDesigns ?? localDesigns;
    const patchesCount = readMetricNumber(effectiveProfile?.patchesCount) ?? readMetricNumber(effectiveProfile?.followersCount) ?? 0;
    const totalThreads = readMetricNumber(effectiveProfile?.totalThreads) ?? readMetricNumber(effectiveProfile?.totalLikes) ?? 0;
    const totalReviews = readMetricNumber(effectiveProfile?.totalReviews) ?? 0;
    const stats: BrandHeaderStat[] = [];

    stats.push({ value: formatCount(patchesCount), label: patchesCount === 1 ? 'Patch' : 'Patches' });

    if (Number.isFinite(designsCount)) {
      stats.push({ value: formatCount(designsCount), label: designsCount === 1 ? 'Design' : 'Designs' });
    }

    stats.push({ value: formatCount(totalThreads), label: totalThreads === 1 ? 'Thread' : 'Threads' });

    stats.push({ value: formatCount(totalReviews), label: totalReviews === 1 ? 'Review' : 'Reviews' });

    return stats.slice(0, 4);
  }, [
    effectiveCollections.length,
    currentCollectionsWithBackgroundTasks.length,
    effectiveProfile?.collectionsCount,
    effectiveProfile?.designsCount,
    effectiveProfile?.followersCount,
    effectiveProfile?.patchesCount,
    effectiveProfile?.totalLikes,
    effectiveProfile?.totalThreads,
    effectiveProfile?.totalReviews,
  ]);
  const headerContactItems = useMemo<BrandHeaderContactItem[]>(() => {
    const candidates: BrandHeaderContactItem[] = [
      { label: 'Email', value: readContactValue(effectiveProfile?.email) ?? '' },
      { label: 'Phone', value: readContactValue(effectiveProfile?.phoneNumber) ?? '' },
      { label: 'Website', value: readContactValue(effectiveProfile?.socialWebsite) ?? '' },
      { label: 'Instagram', value: readContactValue(effectiveProfile?.socialInstagram) ?? '' },
      { label: 'Facebook', value: readContactValue(effectiveProfile?.socialFacebook) ?? '' },
      { label: 'X', value: readContactValue(effectiveProfile?.socialTwitter) ?? '' },
    ];

    return candidates.filter((item) => item.value.length > 0);
  }, [
    effectiveProfile?.email,
    effectiveProfile?.phoneNumber,
    effectiveProfile?.socialFacebook,
    effectiveProfile?.socialInstagram,
    effectiveProfile?.socialTwitter,
    effectiveProfile?.socialWebsite,
  ]);
  const headerBadges = useMemo(
    () =>
      getBrandBadges({
        brandVerified: Boolean(effectiveProfile?.verified || effectiveProfile?.verificationBadgeVisible),
        storeVerified: effectiveProfile?.verificationStatus === 'APPROVED',
        isStoreOpen: effectiveProfile?.isStoreOpen,
        storeStatus: effectiveProfile?.storeStatus,
        verificationStatus: effectiveProfile?.verificationStatus,
      }),
    [
      effectiveProfile?.isStoreOpen,
      effectiveProfile?.storeStatus,
      effectiveProfile?.verificationBadgeVisible,
      effectiveProfile?.verificationStatus,
      effectiveProfile?.verified,
    ],
  );
  const profileInitialLoading = profileQuery.isLoading && !effectiveProfile && !profileRef.current;
  const listInitialLoading = visibilityFilter === 'Drafts'
    ? draftsQuery.isLoading && effectiveDrafts.length === 0
    : collectionsQuery.isLoading && effectiveCollections.length === 0;
  const showInitialSkeleton = Boolean(
    targetBrandId &&
    !effectiveProfile &&
    effectiveCollections.length === 0 &&
    effectiveDrafts.length === 0 &&
    (profileInitialLoading || listInitialLoading),
  );
  const overlayScrollPadding = standardScreenBottomPadding;

  // Tab configuration
  const tabs = [
    { key: 'Collections', label: 'Content' },
    { key: 'Shop', label: 'Shop' },
    { key: 'Reviews', label: 'Reviews' },
  ];

  const handleMessageBrand = useCallback(() => {
    if (!targetBrandId) {
      toast.error('Brand profile is not ready yet.');
      return;
    }

    if (status !== 'authenticated') {
      router.push({ pathname: '/(auth)/login', params: { next: `/catalog/${targetBrandId}` } } as any);
      return;
    }

    router.push({ pathname: '/messages/[threadId]', params: { threadId: 'brand', brandId: targetBrandId } } as any);
  }, [status, targetBrandId, toast]);

  const handleShareCollection = useCallback(
    async (collectionId: string) => {
      const collection = currentCollectionsWithBackgroundTasks.find((item) => item.id === collectionId);
      const title = collection?.title?.trim() || 'WEAZ catalog item';
      const profileUrl = profileShareUrl ?? '';
      const url = profileUrl ? `${profileUrl}${profileUrl.includes('?') ? '&' : '?'}collectionId=${encodeURIComponent(collectionId)}` : '';

      try {
        await Share.share({
          title,
          message: url ? `${title}\n${url}` : title,
          url: url || undefined,
        });
      } catch {
        toast.error('Could not share this catalog item.');
      }
    },
    [currentCollectionsWithBackgroundTasks, profileShareUrl, toast],
  );

  const handleToggleSaveCollection = useCallback(
    async (collection: CollectionDto) => {
      if (isOwner) return;
      if (status !== 'authenticated') {
        router.push({ pathname: '/(auth)/login', params: { next: `/catalog/${targetBrandId ?? ''}` } } as any);
        return;
      }

      const wasSaved = Boolean(savedCatalogById[collection.id]);
      const savedBatchQueryKey = queryKeys.saved.batch('COLLECTION', savedCatalogIds);
      setSavedCatalogById((current) => ({ ...current, [collection.id]: !wasSaved }));
      queryClient.setQueryData<Record<string, boolean>>(savedBatchQueryKey, (current) => ({
        ...(current ?? {}),
        [collection.id]: !wasSaved,
      }));
      setSavingCatalogById((current) => ({ ...current, [collection.id]: true }));

      try {
        if (wasSaved) {
          await SavedItemsApi.unsaveCatalogTarget({
            targetType: collection.entityType === 'DESIGN' ? 'DESIGN' : 'COLLECTION',
            collectionId: collection.id,
            legacyCollectionId: collection.id,
            designId: collection.entityType === 'DESIGN' ? collection.id : undefined,
          });
          toast.success('Removed from saved.');
        } else {
          await SavedItemsApi.saveCatalogTarget({
            targetType: collection.entityType === 'DESIGN' ? 'DESIGN' : 'COLLECTION',
            collectionId: collection.id,
            legacyCollectionId: collection.id,
            designId: collection.entityType === 'DESIGN' ? collection.id : undefined,
          });
          toast.success('Saved for later.');
        }
      } catch {
        setSavedCatalogById((current) => ({ ...current, [collection.id]: wasSaved }));
        queryClient.setQueryData<Record<string, boolean>>(savedBatchQueryKey, (current) => ({
          ...(current ?? {}),
          [collection.id]: wasSaved,
        }));
        toast.error('Could not update saved items.');
      } finally {
        setSavingCatalogById((current) => {
          const next = { ...current };
          delete next[collection.id];
          return next;
        });
      }
    },
    [isOwner, queryClient, savedCatalogById, savedCatalogIds, status, targetBrandId, toast],
  );

  const shareActionOptions = useMemo(
    () => [
      {
        key: 'share-profile',
        icon: '↗',
        title: 'Share profile',
        description: profileShareUrl ?? undefined,
        onPress: () => void handleNativeShareProfile(),
        disabled: !profileShareUrl,
      },
      {
        key: 'copy-profile-link',
        icon: '🔗',
        title: 'Copy profile link',
        description: profileShareUrl ?? undefined,
        onPress: () => void handleCopyProfileLink(),
        disabled: !profileShareUrl,
      },
      {
        key: 'show-qr-code',
        icon: '▦',
        title: 'Show QR code',
        description: 'Open a scannable public brand profile QR.',
        onPress: () => setBrandQrOpen(true),
        disabled: !profileQrTargetUrl,
      },
    ],
    [handleCopyProfileLink, handleNativeShareProfile, profileQrTargetUrl, profileShareUrl],
  );

  const captureCreateAnchorMetrics = useCallback(() => {
    requestAnimationFrame(() => {
      createAnchorRef.current?.measureInWindow((pageX, pageY, width, height) => {
        if (width <= 0 || height <= 0) return;
        setCreateAnchorMetrics({ pageX, pageY, width, height });
      });
    });
  }, []);

  // Continue into the composer, optionally auto-opening the media picker for the
  // chosen source. Called only AFTER the user picks an option in the sheet — the
  // `+` button itself must never route straight into the composer.
  const launchComposer = useCallback(
    (opts: { source?: DesignEditorMediaSource; openPicker: boolean }) => {
      setCreateOptionsOpen(false);
      navPerf.mark('create_design_option_selected');
      navPerf.mark('create_design_navigation_called');
      navPerf.navigationCalled();
      router.push({
        pathname: '/catalog/create-design/composer',
        params: opts.openPicker
          ? { openPicker: '1', pickerSource: opts.source ?? 'library' }
          : { blank: '1' },
      } as any);
    },
    [],
  );

  // The catalogue `+` opens an option sheet immediately; it does NOT route.
  const handleCreatePress = useCallback(() => {
    if (canManageCatalog(user) && userEmailVerified === false) {
      toast.error('Verify your email before creating designs.');
      return;
    }
    perfMark('catalog-plus-tap');
    navPerf.tap('create_design');
    navPerf.mark('options_sheet_opened');
    captureCreateAnchorMetrics();
    setCreateOptionsOpen(true);
  }, [captureCreateAnchorMetrics, toast, user, userEmailVerified]);

  const createDesignOptions = useMemo<FloatingMenuOption[]>(
    () => [
      {
        key: 'camera',
        icon: '📷',
        title: 'Camera',
        onPress: () => launchComposer({ source: 'camera', openPicker: true }),
      },
      {
        key: 'library',
        icon: '🖼️',
        title: 'Photo library',
        onPress: () => launchComposer({ source: 'library', openPicker: true }),
      },
      {
        key: 'blank',
        icon: '🧵',
        title: 'Start blank',
        onPress: () => launchComposer({ openPicker: false }),
      },
    ],
    [launchComposer],
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
            profile={effectiveProfile}
            isLoading={false}
            stats={headerStats}
            contactItems={headerContactItems}
            badges={headerBadges}
            onEditProfile={() => {
              if (!targetBrandId) return;
              router.push({ pathname: '/catalog/edit-profile', params: { brandId: targetBrandId } } as any);
            }}
            onCreate={handleCreatePress}
            createAnchorRef={createAnchorRef}
            onCreateAnchorLayout={captureCreateAnchorMetrics}
            onViewAvatar={handleViewOwnerAvatar}
            onShare={() => setShareActionsOpen(true)}
            qrTargetUrl={profileQrTargetUrl}
            onOpenQr={() => setBrandQrOpen(true)}
            onBack={handleBackNavigation}
            onSearch={() => router.push('/search')}
          />
        ) : (
          <BrandProfileHeader
            brandName={effectiveProfile?.brandFullName || 'Your Brand'}
            username={effectiveProfile?.username || undefined}
            location={profileLocation}
            description={effectiveProfile?.brandDescription ?? null}
            contactItems={headerContactItems}
            tags={effectiveProfile?.brandTags || []}
            stats={headerStats}
            badges={headerBadges}
            avatarUrl={visitorAvatarUri ?? visitorAvatar.src ?? undefined}
            avatarFileId={visitorAvatar.fileId ?? undefined}
            profilePhotoViewState={effectiveProfile?.profilePhotoViewState ?? null}
            bannerUrl={visitorBanner.src ?? undefined}
            bannerFileId={visitorBanner.fileId ?? undefined}
            isOwner={false}
            isLoading={false}
            isPatched={isPatched}
            patchLoading={patchLoading}
            onPatch={patchEnabled ? handlePatch : undefined}
            onViewAvatar={handleViewVisitorAvatar}
            onShare={() => setShareActionsOpen(true)}
            qrTargetUrl={profileQrTargetUrl}
            onOpenQr={() => setBrandQrOpen(true)}
            onMessage={handleMessageBrand}
            onBack={handleBackNavigation}
            onSearch={() => router.push('/search')}
          />
        )}

        {isOwner ? (
          <View style={styles.brandSwitcherWrap}>
            <BrandSwitcherSheet />
          </View>
        ) : null}

        {isOwner ? (
          <View style={styles.verificationNoticeWrap}>
            <EmailVerificationNotice
              context="catalog"
              userId={userId}
              email={user?.email}
              emailVerified={userEmailVerified}
            />
          </View>
        ) : null}

        {/* Tabs */}
        <View style={[styles.tabsWrapper, { borderBottomColor: theme.colors.border }]}>
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleMainTabChange}
            swipeProgress={tabSwipeProgress}
          />
        </View>



        <ScrollView
          ref={tabPagerRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleTabPagerScroll}
          onMomentumScrollEnd={handleTabPagerMomentumEnd}
          style={[styles.tabPager, activeTabPagerHeight ? { height: activeTabPagerHeight } : null]}
          contentContainerStyle={styles.tabPagerContent}
        >
          <View
            onLayout={(event) => handleTabPageLayout('Collections', event)}
            style={[styles.tabPage, { width: Math.max(containerWidth, 1) }]}
          >
              {isOwner ? (
                <View style={styles.catalogControls}>
                  <VisibilityFilter
                    selected={visibilityFilter}
                    onChange={setVisibilityFilter}
                    showDrafts={isOwner}
                    draftsCount={drafts.length}
                  />
                </View>
              ) : null}

              {isOwner && failedDesignTasks.length > 0 ? (
                <View style={styles.failedTaskList}>
                  {failedDesignTasks.map((task) => (
                    <View
                      key={task.id}
                      style={[
                        styles.failedTaskCard,
                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger },
                      ]}
                    >
                      <AppText variant="captionBold" tone="danger" numberOfLines={1}>
                        ⚠️ {task.action === 'draft' ? 'Draft failed' : 'Publish failed'}
                      </AppText>
                      <AppText variant="bodyBold" numberOfLines={1}>
                        {task.title}
                      </AppText>
                      <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
                        {task.error ?? task.message ?? 'Something went wrong. Please try again.'}
                      </AppText>
                      <View style={styles.failedTaskActions}>
                        <Button
                          title="Retry / Edit"
                          variant="primary"
                          size="sm"
                          onPress={() => handleRetryFailedTask(task)}
                        />
                        <Button
                          title="Dismiss"
                          variant="outline"
                          size="sm"
                          onPress={() => handleDismissFailedTask(task.id)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <CollectionsGrid
                collections={currentCollectionsWithBackgroundTasks}
                isLoading={false}
                isOwner={isOwner}
                showDrafts={visibilityFilter === 'Drafts'}
                onCollectionPress={handleCollectionPress}
                onEdit={handleEditCollection}
                onDelete={handleDeleteCollection}
                onShare={handleShareCollection}
                onSave={handleToggleSaveCollection}
                savedById={savedCatalogById}
                saveBusyById={savingCatalogById}
                emptyComponent={
                  <EmptyCollections
                    isOwner={isOwner}
                    onAdd={handleCreatePress}
                  />
                }
              />
          </View>

          <View
            onLayout={(event) => handleTabPageLayout('Shop', event)}
            style={[styles.tabPage, { width: Math.max(containerWidth, 1) }]}
          >
            {containerWidth > 0 && targetBrandId ? (
              <BrandShopTab
                brandId={targetBrandId}
                isOwner={isOwner}
                containerWidth={containerWidth}
                initialProductId={routeProductId ?? null}
                enabled={activeTab === 'Shop' || Boolean(routeProductId)}
              />
            ) : null}
          </View>

          <View
            onLayout={(event) => handleTabPageLayout('Reviews', event)}
            style={[styles.tabPage, { width: Math.max(containerWidth, 1) }]}
          >
            {targetBrandId && activeTab === 'Reviews' ? (
              <BrandReviewsTab brandId={targetBrandId} enabled={activeTab === 'Reviews'} />
            ) : (
              <View style={styles.tabContent} />
            )}
          </View>
        </ScrollView>
      </ScrollView>

      <MobileProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={modalAvatarUri}
        onClose={() => setIsAvatarModalOpen(false)}
      />

      <AppActionSheet
        visible={shareActionsOpen}
        title="Share brand"
        subtitle={profileShareUrl ?? 'Profile link is not available yet.'}
        options={shareActionOptions}
        onClose={() => setShareActionsOpen(false)}
      />

      <AppFloatingMenu
        visible={createOptionsOpen}
        anchorRef={createAnchorRef}
        anchorMetrics={createAnchorMetrics}
        options={createDesignOptions}
        onClose={() => setCreateOptionsOpen(false)}
      />

      <AppQrSheet
        visible={brandQrOpen}
        title={`${effectiveProfile?.brandFullName || 'Brand'} QR code`}
        subtitle="Scan to open this public brand profile."
        qrValue={profileQrTargetUrl}
        displayUrl={profileShareUrl}
        shareMessage={profileShareMessage}
        onClose={() => setBrandQrOpen(false)}
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
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  skeletonTabsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
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
  verificationNoticeWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
  },
  catalogControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  failedTaskList: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  failedTaskCard: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  failedTaskActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
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
  // Tab content
  tabPager: {
    width: '100%',
  },
  tabPagerContent: {
    alignItems: 'flex-start',
  },
  tabPage: {
    overflow: 'hidden',
  },
  tabContent: {
    paddingVertical: tokens.spacing.lg,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.lg,
  },
  emptyTitle: {
    marginTop: tokens.spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: tokens.spacing.sm,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: tokens.spacing.lg,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
});
