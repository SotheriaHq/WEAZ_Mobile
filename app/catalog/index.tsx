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
import { useFocusEffect } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuth, useAuthSession } from '@/src/auth/AuthContext';
import { canManageCatalog, getActiveBrandId } from '@/src/auth/brandAccess';
import { brandApi, type BrandProfileDto, type CollectionDto } from '@/src/api/BrandApi';
import { OwnerCatalogMediaHeader } from '@/components/catalog/OwnerCatalogMediaHeader';
import { BrandProfileHeader, BrandProfileHeaderSkeleton, type BrandHeaderStat } from '@/components/catalog/BrandProfileHeader';
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
import { getBrandBadges } from '@/components/catalog/ProfileBadge';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppFloatingMenu } from '@/components/ui/AppFloatingMenu';
import { AppConfirmDialog } from '@/components/ui/AppConfirmDialog';
import { AppActionSheet } from '@/components/ui/AppActionSheet';
import { AppQrSheet } from '@/components/ui/AppQrSheet';
import { BrandSwitcherSheet } from '@/components/brand/BrandSwitcherSheet';
import {
  pickDesignEditorMediaAssets,
  stageDesignEditorAssetBundle,
  type DesignEditorMediaSource,
} from '@/src/features/design-editor/designEditorMediaFlow';
import { tokens } from '@/src/styles/tokens';
import { catalogDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { formatCount } from '@/src/utils/formatCount';
import { env } from '@/src/config/env';
import { routeForDesignTarget, routeForStoreCollectionTarget } from '@/src/utils/mobileRouting';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TabType = 'Collections' | 'Shop' | 'Reviews';
type VisibilityType = 'Public' | 'Private' | 'Drafts';
const TAB_ORDER: TabType[] = ['Collections', 'Shop', 'Reviews'];

function readMetricNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStoreMetricValue(
  status: BrandProfileDto['storeStatus'],
  isStoreOpen?: boolean | null,
): string | null {
  const normalized = String(status ?? '').toUpperCase();

  if (normalized === 'PENDING_VERIFICATION') return 'Pending';
  if (normalized === 'OPEN' || isStoreOpen === true) return 'Open';
  if (normalized === 'CLOSED' || isStoreOpen === false) return 'Closed';

  return null;
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
  const [shareActionsOpen, setShareActionsOpen] = useState(false);
  const [brandQrOpen, setBrandQrOpen] = useState(false);
  const [tabHeights, setTabHeights] = useState<Partial<Record<TabType, number>>>({});
  const [createMenuAnchorMetrics, setCreateMenuAnchorMetrics] = useState<{
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null>(null);
  const createMenuAnchorRef = useRef<View>(null);
  const tabPagerRef = useRef<ScrollView>(null);
  const tabSwipeProgress = useSharedValue(TAB_ORDER.indexOf(activeTab));
  const activeTabPagerHeight = tabHeights[activeTab];

  // Determine if owner view
  const activeBrandId = getActiveBrandId(user);
  const isOwner = Boolean(canManageCatalog(user) && (!routeBrandId || routeBrandId === activeBrandId));
  const targetBrandId = routeBrandId || activeBrandId || null;
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
      if (containerWidth > 0) {
        tabPagerRef.current?.scrollTo({ x: idx * containerWidth, animated: true });
      }
    }
  }, [activeTab, containerWidth, tabSwipeProgress]);

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
    profile?.location ||
    [profile?.brandCity, profile?.brandState, profile?.brandCountry].filter(Boolean).join(', ') ||
    undefined;
  const profileShareUrl = useMemo(
    () =>
      profile?.shareUrl ??
      profile?.publicProfileUrl ??
      profile?.qrTargetUrl ??
      buildProfileUrlFromConfig(targetBrandId, profile?.username ?? user?.username ?? null),
    [
      profile?.publicProfileUrl,
      profile?.qrTargetUrl,
      profile?.shareUrl,
      profile?.username,
      targetBrandId,
      user?.username,
    ],
  );
  const profileQrTargetUrl = useMemo(
    () =>
      profile?.qrTargetUrl ??
      profile?.publicProfileUrl ??
      profile?.shareUrl ??
      profileShareUrl,
    [profile?.publicProfileUrl, profile?.qrTargetUrl, profile?.shareUrl, profileShareUrl],
  );
  const profileShareMessage = useMemo(() => {
    if (!profileShareUrl) return undefined;
    return `Check out ${profile?.brandFullName || 'this brand'} on Threadly: ${profileShareUrl}`;
  }, [profile?.brandFullName, profileShareUrl]);

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

  const currentCollections = visibilityFilter === 'Drafts' ? drafts : collections;
  const headerStats = useMemo<BrandHeaderStat[]>(() => {
    const backendDesigns = readMetricNumber(profile?.designsCount) ?? readMetricNumber(profile?.collectionsCount);
    const localDesigns = Math.max(collections.length, currentCollections.length);
    const designsCount = backendDesigns ?? localDesigns;
    const followersCount = readMetricNumber(profile?.followersCount) ?? readMetricNumber(profile?.patchesCount);
    const totalThreads = readMetricNumber(profile?.totalThreads) ?? readMetricNumber(profile?.totalLikes);
    const averageRating = readMetricNumber(profile?.averageRating);
    const totalReviews = readMetricNumber(profile?.totalReviews);
    const storeMetric = getStoreMetricValue(profile?.storeStatus, profile?.isStoreOpen);
    const metricLimit = windowWidth < 390 ? 3 : 4;
    const stats: BrandHeaderStat[] = [];

    if (Number.isFinite(designsCount)) {
      stats.push({ value: formatCount(designsCount), label: designsCount === 1 ? 'Design' : 'Designs' });
    }

    if (followersCount !== null) {
      stats.push({ value: formatCount(followersCount), label: followersCount === 1 ? 'Follower' : 'Followers' });
    }

    if (totalThreads !== null) {
      stats.push({ value: formatCount(totalThreads), label: totalThreads === 1 ? 'Thread' : 'Threads' });
    }

    if (storeMetric) {
      stats.push({ value: storeMetric, label: 'Store' });
    } else if (averageRating !== null && averageRating > 0 && totalReviews !== null && totalReviews > 0) {
      stats.push({ value: `⭐ ${averageRating.toFixed(1)}`, label: 'Rating' });
    }

    return stats.slice(0, metricLimit);
  }, [
    collections.length,
    currentCollections.length,
    profile?.averageRating,
    profile?.collectionsCount,
    profile?.designsCount,
    profile?.followersCount,
    profile?.isStoreOpen,
    profile?.patchesCount,
    profile?.storeStatus,
    profile?.totalLikes,
    profile?.totalThreads,
    profile?.totalReviews,
    windowWidth,
  ]);
  const headerBadges = useMemo(
    () =>
      getBrandBadges({
        brandVerified: Boolean(profile?.verified || profile?.verificationBadgeVisible),
        storeVerified: profile?.verificationStatus === 'APPROVED',
        isStoreOpen: profile?.isStoreOpen,
        storeStatus: profile?.storeStatus,
        verificationStatus: profile?.verificationStatus,
      }),
    [
      profile?.isStoreOpen,
      profile?.storeStatus,
      profile?.verificationBadgeVisible,
      profile?.verificationStatus,
      profile?.verified,
    ],
  );
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
            stats={headerStats}
            badges={headerBadges}
            onEditProfile={() => {
              if (!targetBrandId) return;
              router.push({ pathname: '/catalog/edit-profile', params: { brandId: targetBrandId } } as any);
            }}
            onCreate={handleCreatePress}
            createAnchorRef={createMenuAnchorRef}
            onCreateAnchorLayout={handleCreateAnchorLayout}
            onViewAvatar={() => {
              if (ownerAvatarUri || ownerAvatar.src) {
                setIsAvatarModalOpen(true);
              }
            }}
            onShare={() => setShareActionsOpen(true)}
            onBack={handleBackNavigation}
            onSearch={() => router.push('/search')}
          />
        ) : (
          <BrandProfileHeader
            brandName={profile?.brandFullName || 'Your Brand'}
            username={profile?.username || undefined}
            location={profileLocation}
            description={profile?.brandDescription ?? null}
            tags={profile?.brandTags || []}
            stats={headerStats}
            badges={headerBadges}
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
            onShare={() => setShareActionsOpen(true)}
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
              <View style={styles.catalogControls}>
                <VisibilityFilter
                  selected={visibilityFilter}
                  onChange={setVisibilityFilter}
                  showDrafts={isOwner}
                  draftsCount={drafts.length}
                />
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
              />
            ) : (
              <View style={styles.tabContent} />
            )}
          </View>

          <View
            onLayout={(event) => handleTabPageLayout('Reviews', event)}
            style={[styles.tabPage, { width: Math.max(containerWidth, 1) }]}
          >
            {targetBrandId ? (
              <BrandReviewsTab brandId={targetBrandId} />
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

      <AppFloatingMenu
        visible={createMenuOpen}
        anchorRef={createMenuAnchorRef}
        anchorMetrics={createMenuAnchorMetrics}
        onClose={() => setCreateMenuOpen(false)}
        options={createMenuOptions}
      />

      <AppActionSheet
        visible={shareActionsOpen}
        title="Share brand"
        subtitle={profileShareUrl ?? 'Profile link is not available yet.'}
        options={shareActionOptions}
        onClose={() => setShareActionsOpen(false)}
      />

      <AppQrSheet
        visible={brandQrOpen}
        title={`${profile?.brandFullName || 'Brand'} QR code`}
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
  catalogControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
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
