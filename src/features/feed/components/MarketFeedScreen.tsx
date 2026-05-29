import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';

import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens, type AppTheme } from '@/src/styles/tokens';
import { useToast } from '@/src/toast/ToastContext';
import { useAuthAction } from '@/src/hooks/useAuthAction';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { NewDropBadge } from '@/components/ui/NewDropBadge';
import { SocialProofPill } from '@/components/ui/SocialProofPill';
import { Skeleton, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import ThreadlyLogoLoader from '@/components/ui/ThreadlyLogoLoader';
import ThreadRailAction from '../../../../components/catalog/ThreadRailAction';
import CollectionCommentsSheet from '@/components/catalog/CollectionCommentsSheet';
import { brandApi, type CollectionDetailMediaDto } from '@/src/api/BrandApi';
import { ProfileApi } from '@/src/api/ProfileApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { DEFAULT_MARKET_FILTER_CHIPS, type MarketFilterChip, toggleCollectionMediaThread } from '@/src/api/MarketApi';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { fetchMarketFeedPage, readCachedMarketFeed, writeCachedMarketFeed } from '@/src/features/feed/api/feedApi';
import { buildFeedCacheIdentity } from '@/src/features/feed/utils/feedKeys';
import { brandAvatarDevLog, feedDevLog, feedLoadDevLog, feedMediaDevLog, layoutDevLog, scrollDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import type { MarketItem } from '@/src/types/market';
import type { ResolvedTheme } from '@/src/types/theme';
import { FeedEmptyState } from '@/components/designs/FeedEmptyState';
import { NetworkErrorState } from '@/components/designs/NetworkErrorState';
import { isUsableImageHttpUrl, prefetchResolvedImageAsset, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { getAvatarFallback } from '@/src/utils/profileImage';
import { AppText } from '@/components/ui/AppText';
import { BagPulseIcon } from '@/components/ui/BagPulseIcon';
import { requestNativeIslandCollapse } from '@/components/navigation/nativeIslandEvents';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { BAG_IT_LABEL } from '@/src/constants/bagging';
import { perfMark } from '@/src/utils/perf';
import { fetchMarketFilterChipsQuery } from '@/src/query/bootstrapQueries';
import { MarketFeedItem } from '@/src/features/feed/components/MarketFeedItem';
import { MarketFeedList } from '@/src/features/feed/components/MarketFeedList';
import type { FeedListEntry, FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

/**
 * Module-level feed cache - stale-while-revalidate.
 * Persists across component remounts within the same app session.
 * Key: tag (null = 'all'), Value: last successful page 1 response.
 */
// Persists across tab switches / component remounts within the same app session.
let feedScrollOffset = 0;
let feedActiveIndex = 0;
let feedMountCount = 0;
const carouselIndexMap = new Map<string, number>();

const devLog = __DEV__ ? (prefix: string, ...args: any[]) => feedDevLog(prefix, { args }) : () => {};

const toCompactCount = (value: number | null | undefined) => {
  const n = typeof value === 'number' ? value : 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}m`;
};

const formatMetricCountLabel = (
  value: number | null | undefined,
  singular: string,
  plural: string,
) => {
  const n = typeof value === 'number' ? value : 0;
  return `${toCompactCount(n)} ${n === 1 ? singular : plural}`;
};

const toFeedMediaType = (rawType?: string | null): 'image' | 'video' => {
  const normalized = String(rawType ?? '').toLowerCase();
  return normalized.includes('video') ? 'video' : 'image';
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildFallbackMediaItems = (item: MarketItem): FeedViewerMedia[] => {
  const strictMediaItems = Array.isArray(item.mediaItems) && item.mediaItems.length
    ? item.mediaItems
    : item.primaryMedia
      ? [item.primaryMedia]
      : [];
  if (strictMediaItems.length) {
    return strictMediaItems
      .filter((media) => media.status === 'READY' && Boolean(normalizeStableUri(media.displayUrl)))
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((media, index) => ({
        id: media.id,
        collectionId: item.collectionId,
        mediaIndex: index,
        url: media.displayUrl,
        displayUrl: media.displayUrl,
        thumbnailUrl: media.thumbnailUrl,
        previewUrl: media.previewUrl,
        fileId: media.fileId,
        type: media.type === 'VIDEO' ? 'video' : 'image',
        label: item.title ?? item.collectionTitle,
        threadsCount: typeof item.stats?.threads === 'number' ? item.stats.threads : typeof item.threadsCount === 'number' ? item.threadsCount : 0,
        orderIndex: media.orderIndex,
        blurHash: media.blurHash,
        dominantColor: media.dominantColor,
        width: media.width,
        height: media.height,
        aspectRatio: media.aspectRatio,
      }));
  }

  const directUrl = item.media?.url ?? item.media?.previewUrl ?? '';
  return directUrl
    ? [
        {
          id: item.id,
          collectionId: item.collectionId,
          mediaIndex: 0,
          url: directUrl,
          fileId: item.media?.fileId ?? null,
          type: toFeedMediaType(item.media?.type ?? null),
          label: item.collectionTitle,
          threadsCount: typeof item.threadsCount === 'number' ? item.threadsCount : 0,
          orderIndex: 0,
          aspectRatio: item.media?.aspectRatio ?? null,
        },
      ]
    : [];
};

const isValidMediaItem = (item: MarketItem): boolean => {
  const fallback = buildFallbackMediaItems(item);
  if (fallback.length === 0) return false;
  const media = fallback[0];
  const hasUri = normalizeStableUri(media.url) || normalizeStableUri(media.fileId);
  return Boolean(hasUri);
};

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const getCollectionMediaDirectUrl = (media: CollectionDetailMediaDto) =>
  normalizeStableUri(media.url) ??
  normalizeStableUri(media.secureUrl) ??
  normalizeStableUri(media.s3Url) ??
  normalizeStableUri(media.previewUrl) ??
  normalizeStableUri(media.file?.secureUrl) ??
  normalizeStableUri(media.file?.s3Url) ??
  normalizeStableUri(media.file?.url);

const getCollectionMediaFileId = (media: CollectionDetailMediaDto) =>
  normalizeStableUri(media.fileId) ??
  normalizeStableUri(media.fileUploadId) ??
  normalizeStableUri(media.uploadFileId) ??
  normalizeStableUri(media.file?.fileId) ??
  normalizeStableUri(media.file?.id);

const FeedBrandAvatar = React.memo(function FeedBrandAvatar({
  brandId,
  brandName,
  brandLogo,
  brandLogoFileId,
  canPatch,
  isPatched,
  patchBusy,
  onPatchPress,
  onPress,
}: {
  brandId?: string | null;
  brandName?: string | null;
  brandLogo?: string | null;
  brandLogoFileId?: string | null;
  canPatch: boolean;
  isPatched: boolean;
  patchBusy: boolean;
  onPatchPress: () => void;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { uri, loading } = useResolvedImageAsset({
    src: brandLogo,
    fileId: brandLogoFileId,
    enabled: Boolean(brandId || brandLogo || brandLogoFileId),
    allowSignedFallback: false,
  });
  const initials = getAvatarFallback(brandName, brandName);

  useEffect(() => {
    if (!__DEV__) return;
    let host: string | null = null;
    const candidate = uri ?? brandLogo ?? null;
    if (candidate) {
      try {
        host = new URL(candidate).hostname;
      } catch {
        host = null;
      }
    }
    brandAvatarDevLog('summary', {
      brandId: brandId ?? null,
      hasAvatarDisplayUrl: Boolean(brandLogo),
      hasAvatarFileId: Boolean(brandLogoFileId),
      host,
    });
  }, [brandId, brandLogo, brandLogoFileId, uri]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ownerAvatarWrap, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${brandName ?? 'brand'} profile`}
    >
      <View style={[styles.ownerAvatarCircle, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primarySoft }]}>
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={styles.ownerAvatarImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={80}
          />
        ) : loading ? (
          <ThreadlyLogoLoader size={26} />
        ) : (
          <AppText variant="captionBold" tone="inverse">{initials}</AppText>
        )}
      </View>
      {brandId && canPatch ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onPatchPress();
          }}
          disabled={patchBusy}
          style={({ pressed }) => [
            styles.ownerPatchBadge,
            { backgroundColor: theme.colors.surfaceOverlay, borderColor: theme.colors.border },
            isPatched && { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
            patchBusy && styles.ownerPatchBadgeBusy,
            pressed && styles.ownerPatchBadgePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${isPatched ? 'Unpatch' : 'Patch'} ${brandName ?? 'brand'}`}
        >
          <AppText variant="captionBold">🪡</AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
});

type FeedActionRailProps = {
  item: MarketItem;
  brandName: string;
  currentMediaId: string;
  isThreaded: boolean;
  isThreading: boolean;
  threads: string;
  comments: string;
  likes: string;
  threadCountRaw: number;
  isSavedLook: boolean;
  isSavingLook: boolean;
  canPatchBrands: boolean;
  isPatched: boolean;
  patchBusy: boolean;
  bottomClearance: number;
  onPatchBrand: (brandId?: string | null, brandName?: string | null) => void;
  onOpenBrand: (brandId?: string | null) => void;
  onSaveLook: (item: MarketItem) => void;
  onThreadPress: (
    mediaId: string | null | undefined,
    collectionId?: string | null,
    fallbackThreaded?: boolean,
    fallbackCount?: number,
  ) => void;
  onOpenComments: (item: MarketItem) => void;
};

type FeedBagActionProps = {
  item: MarketItem;
};

const FeedBagAction = React.memo(function FeedBagAction({ item }: FeedBagActionProps) {
  const { bagSource, loadingByProductId } = useMobileBagging();
  const sourceId = item.collectionId;
  const loadingKey = `DESIGN:${sourceId}`;
  const isLoading = Boolean(loadingByProductId[loadingKey]);
  const feedViewerCanBag = Boolean(item.viewerState?.canBag);

  const handlePress = useCallback(() => {
    trackMobileEvent('bag_tapped', {
      sourceScreen: 'runway_feed',
      sourceType: 'DESIGN',
      sourceId,
      designId: sourceId,
      eligibilityState: item.viewerState?.canBag ? 'eligible' : 'not_eligible',
    });
    trackMobileEvent('custom_order_tapped', {
      sourceScreen: 'runway_feed',
      sourceType: 'DESIGN',
      sourceId,
      brandId: item.brandId,
      eligibilityState: item.viewerState?.canBag ? 'eligible' : 'not_eligible',
    });
    void bagSource({
      sourceType: 'DESIGN',
      sourceId,
      name: item.collectionTitle,
    });
  }, [bagSource, item.brandId, item.collectionTitle, item.viewerState?.canBag, sourceId]);

  if (!feedViewerCanBag) return null;

  const pulseStatus = isLoading
    ? 'bagging'
    : item.viewerState?.isBagged
      ? 'currently_bagged'
      : 'not_bagged';

  const mode = 'custom';

  return (
    <View style={styles.railItem}>
      <IconButton size={44} onPress={handlePress} disabled={isLoading} style={styles.railBagButton}>
        <BagPulseIcon
          status={pulseStatus}
          context="rail"
          mode={mode}
          size={38}
        />
      </IconButton>
      <AppText variant="captionBold" tone="inverse">{BAG_IT_LABEL}</AppText>
    </View>
  );
});

type FeedSaveLookActionProps = {
  item: MarketItem;
  saved: boolean;
  busy: boolean;
  onPress: (item: MarketItem) => void;
};

const FeedSaveLookAction = React.memo(function FeedSaveLookAction({
  item,
  saved,
  busy,
  onPress,
}: FeedSaveLookActionProps) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <View style={styles.railItem}>
      <IconButton size={44} onPress={handlePress} disabled={busy}>
        <AppText variant="subtitle">{saved ? '🔖' : '📌'}</AppText>
      </IconButton>
      <AppText variant="captionBold" tone="inverse" style={styles.railCountLabel} numberOfLines={1}>
        {saved ? 'Saved' : 'Save look'}
      </AppText>
    </View>
  );
});

const FeedActionRail = React.memo(function FeedActionRail({
  item,
  brandName,
  currentMediaId,
  isThreaded,
  isThreading,
  threads,
  comments,
  likes,
  threadCountRaw,
  isSavedLook,
  isSavingLook,
  canPatchBrands,
  isPatched,
  patchBusy,
  bottomClearance,
  onPatchBrand,
  onOpenBrand,
  onSaveLook,
  onThreadPress,
  onOpenComments,
}: FeedActionRailProps) {
  const handlePatchPress = useCallback(() => {
    onPatchBrand(item.brandId, brandName);
  }, [brandName, item.brandId, onPatchBrand]);

  const handleBrandPress = useCallback(() => {
    onOpenBrand(item.brandId);
  }, [item.brandId, onOpenBrand]);

  const handleThreadActionPress = useCallback(() => {
    onThreadPress(currentMediaId, item.collectionId, isThreaded, threadCountRaw);
  }, [currentMediaId, isThreaded, item.collectionId, onThreadPress, threadCountRaw]);

  const handleCommentsPress = useCallback(() => {
    onOpenComments(item);
  }, [item, onOpenComments]);

  return (
    <View style={[styles.rail, { bottom: bottomClearance + 24 }]}>
      <FeedBrandAvatar
        brandId={item.brandId}
        brandName={brandName}
        brandLogo={item.brandLogo}
        brandLogoFileId={item.brandLogoFileId}
        canPatch={canPatchBrands}
        isPatched={isPatched}
        patchBusy={patchBusy}
        onPatchPress={handlePatchPress}
        onPress={handleBrandPress}
      />

      <ThreadRailAction
        threaded={isThreaded}
        count={threads}
        busy={isThreading}
        onPress={handleThreadActionPress}
      />

      <FeedBagAction item={item} />

      <FeedSaveLookAction
        item={item}
        saved={isSavedLook}
        busy={isSavingLook}
        onPress={onSaveLook}
      />

      <View style={styles.railItem}>
        <IconButton size={44} onPress={handleCommentsPress}>
          <AppText variant="subtitle">💬</AppText>
        </IconButton>
        <AppText
          variant="captionBold"
          tone="inverse"
          style={styles.railCountLabel}
          numberOfLines={1}
        >
          {comments}
        </AppText>
      </View>

      <View style={styles.railItem}>
        <IconButton size={44}>
          <AppText variant="subtitle">{item.isLiked ? '❤️' : '🤍'}</AppText>
        </IconButton>
        <AppText variant="captionBold" tone="inverse">{likes}</AppText>
      </View>
    </View>
  );
});

type FeedMetaOverlayProps = {
  itemId: string;
  mediaId?: string | null;
  handle: string;
  title: string;
  threadCount: number;
  feedPosition?: number;
  scheme: ResolvedTheme;
  overlaySurface: {
    backgroundColor: string;
    borderColor: string;
    blurIntensity: number;
  };
  bottomClearance: number;
  visible: boolean;
  onBrandPress: () => void;
};

const FeedMetaOverlay = React.memo(function FeedMetaOverlay({
  itemId,
  mediaId,
  handle,
  title,
  threadCount,
  feedPosition,
  scheme,
  overlaySurface,
  bottomClearance,
  visible,
  onBrandPress,
}: FeedMetaOverlayProps) {
  return (
    <View
      style={[styles.meta, { bottom: bottomClearance + tokens.spacing.sm, opacity: visible ? 1 : 0 }]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <BlurView
        tint={scheme === 'dark' ? 'dark' : 'light'}
        intensity={overlaySurface.blurIntensity}
        style={[
          styles.metaCard,
          {
            backgroundColor: overlaySurface.backgroundColor,
            borderColor: overlaySurface.borderColor,
          },
        ]}
      >
        <AppText variant="subtitle" tone="inverse" numberOfLines={2} ellipsizeMode="tail">
          {title}
        </AppText>
        {handle ? (
          <Pressable
            onPress={onBrandPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Open ${handle} catalog`}
            style={({ pressed }) => pressed && styles.metaHandlePressed}
          >
            <AppText variant="captionRegular" tone="secondary" numberOfLines={1} ellipsizeMode="tail">
              by {handle}
            </AppText>
          </Pressable>
        ) : null}
        <SocialProofPill
          itemId={itemId}
          mediaId={mediaId}
          threadCount={threadCount}
          sourceScreen="runway_feed"
          feedPosition={feedPosition}
          visible={visible}
        />
      </BlurView>
    </View>
  );
});

// Feed Skeleton Component for loading state
const FeedSkeleton = ({
  theme,
  pageHeight,
  topOffset,
  bottomClearance,
}: {
  theme: AppTheme;
  pageHeight: number;
  topOffset: number;
  bottomClearance: number;
}) => {
  return (
    <View style={styles.feedSkeletonRoot}>
      <View style={[styles.feedSkeletonHeader, { paddingTop: topOffset + 8 }]}>
        <View style={[styles.feedSkeletonLogoWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
          <ThreadlyLogo size={28} style={{ opacity: 0.92 }} />
        </View>
        <View style={styles.feedSkeletonHeaderActions}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <Skeleton width={40} height={40} borderRadius={20} />
        </View>
      </View>

      <View style={[styles.feedSkeletonChips, { top: topOffset + 56 }]}> 
        <Skeleton width={68} height={34} borderRadius={999} />
        <Skeleton width={88} height={34} borderRadius={999} />
        <Skeleton width={76} height={34} borderRadius={999} />
        <Skeleton width={92} height={34} borderRadius={999} />
      </View>

      <View style={{ height: pageHeight, width: '100%', position: 'relative' }}>
        {/* Main image skeleton */}
        <Skeleton width="100%" height="100%" borderRadius={0} />

        {/* Right rail skeleton (action buttons) */}
        <View style={{ position: 'absolute', right: 12, bottom: bottomClearance + 44, alignItems: 'center', gap: 20 }}>
          {/* Avatar skeleton */}
          <View style={{ marginBottom: 8 }}>
            <SkeletonAvatar size={44} />
          </View>

          {/* Like button skeleton */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Skeleton width={30} height={30} borderRadius={15} />
            <Skeleton width={24} height={12} borderRadius={4} />
          </View>

          {/* Comment button skeleton */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Skeleton width={30} height={30} borderRadius={15} />
            <Skeleton width={24} height={12} borderRadius={4} />
          </View>

          {/* Share button skeleton */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Skeleton width={30} height={30} borderRadius={15} />
            <Skeleton width={24} height={12} borderRadius={4} />
          </View>

          {/* Save button skeleton */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Skeleton width={30} height={30} borderRadius={15} />
          </View>
        </View>

        {/* Bottom info skeleton */}
        <View style={{ position: 'absolute', left: 16, right: 88, bottom: bottomClearance, gap: 8 }}>
          {/* Brand name skeleton */}
          <Skeleton width={120} height={18} borderRadius={4} />
          {/* Price skeleton */}
          <Skeleton width={80} height={22} borderRadius={4} />
          {/* Description skeleton */}
          <SkeletonText lines={2} lineHeight={14} spacing={8} lastLineWidth="70%" />
        </View>
      </View>
    </View>
  );
};

export function MarketFeedScreen() {
  const { scheme, theme } = useTheme();
  const { status, user } = useAuth();
  const toast = useToast();
  const requireAuth = useAuthAction();
  const {
    insets,
    windowHeight,
    immersiveOverlayBottomClearance,
  } = useScreenChrome();
  const feedListRef = useRef<FlatList<FeedListEntry> | null>(null);
  const initializedLoopKeyRef = useRef<string | null>(null);
  const [filterChips, setFilterChips] = useState<MarketFilterChip[]>(DEFAULT_MARKET_FILTER_CHIPS);
  const [selectedFilterId, setSelectedFilterId] = useState(DEFAULT_MARKET_FILTER_CHIPS[0].id);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [rootViewportHeight, setRootViewportHeight] = useState(0);
  const [measuredFeedViewportHeight, setFeedViewportHeight] = useState(0);
  const [commentsTarget, setCommentsTarget] = useState<{ collectionId: string; title: string } | null>(null);
  const pendingCollectionIdsRef = useRef(new Set<string>());
  const hydratedCollectionIdsRef = useRef(new Set<string>());
  const feedTeleportingRef = useRef(false);
  const loadingMoreInFlightRef = useRef(false);
  const patchedBrandIdsRef = useRef<Set<string>>(new Set());
  const lastLoggedPageHeightRef = useRef<number | null>(null);
  const hasLoggedInitialPageHeightRef = useRef(false);
  const previousActivePageIndexRef = useRef(0);
  const metaOverlayHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleMetaCollectionId, setVisibleMetaCollectionId] = useState<string | null>(null);

  const [items, setItems] = useState<MarketItem[]>([]);
  const [collectionMediaMap, setCollectionMediaMap] = useState<Record<string, FeedViewerMedia[]>>({});
  const collectionMediaMapRef = useRef<Record<string, FeedViewerMedia[]>>({});
  // Carousel index is tracked in module-level carouselIndexMap (persists across remounts).
  const [threadStateByMedia, setThreadStateByMedia] = useState<Record<string, { threaded: boolean; count: number }>>({});
  const [threadingMediaById, setThreadingMediaById] = useState<Record<string, boolean>>({});
  const [savedLookByCollectionId, setSavedLookByCollectionId] = useState<Record<string, boolean>>({});
  const [savingLookByCollectionId, setSavingLookByCollectionId] = useState<Record<string, boolean>>({});
  const threadStateByMediaRef = useRef<Record<string, { threaded: boolean; count: number }>>({});
  const threadingMediaByIdRef = useRef<Record<string, boolean>>({});
  const savedLookByCollectionIdRef = useRef<Record<string, boolean>>({});
  const lastSavedCheckKeyRef = useRef<string | null>(null);
  const savingLookByCollectionIdRef = useRef<Record<string, boolean>>({});
  const queuedThreadIntentByMediaRef = useRef<Record<string, boolean>>({});
  const viewedFeedItemKeysRef = useRef<Set<string>>(new Set());
  const [patchedBrandIds, setPatchedBrandIds] = useState<Set<string>>(new Set());
  const [patchingBrandIds, setPatchingBrandIds] = useState<Record<string, boolean>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  // Staleness guards - prevent refetch on every tab focus
  const lastPatchFetchRef = useRef<number>(0);
  const STALE_THRESHOLD_MS = 60_000; // 60 seconds

  const showBlockingLoader = loading && items.length === 0;

  const skeletonOpacity = useRef(new Animated.Value(1)).current;
  const [isSkeletonFadingOut, setIsSkeletonFadingOut] = useState(false);

  useEffect(() => {
    if (!showBlockingLoader) {
      setIsSkeletonFadingOut(true);
      Animated.timing(skeletonOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsSkeletonFadingOut(false);
      });
    } else {
      skeletonOpacity.setValue(1);
    }
  }, [showBlockingLoader, skeletonOpacity]);

  const loadPatchedBrands = useCallback(async () => {
    if (status !== 'authenticated' || !user?.id || user?.type === 'BRAND') {
      setPatchedBrandIds(new Set());
      return;
    }

    try {
      const items = await ProfileApi.getPatches(user.id);
      setPatchedBrandIds(new Set(items.map((brand) => brand.id).filter(Boolean)));
      lastPatchFetchRef.current = Date.now();
    } catch (error) {
      console.warn('Failed to load patched brands', error);
      setPatchedBrandIds(new Set());
    }
  }, [status, user?.id, user?.type]);

  const fallbackPageHeight = useMemo(() => Math.max(1, Math.round(windowHeight || 0)), [windowHeight]);
  const measuredBasePageHeight = measuredFeedViewportHeight > 0 ? measuredFeedViewportHeight : fallbackPageHeight;
  const pageHeight = Math.max(1, Math.round(measuredBasePageHeight || fallbackPageHeight));
  const feedViewportHeight = pageHeight;
  const feedViewportReady = pageHeight > 0;

  const activeFilter = useMemo(
    () => filterChips.find((chip) => chip.id === selectedFilterId) ?? filterChips[0] ?? DEFAULT_MARKET_FILTER_CHIPS[0],
    [filterChips, selectedFilterId],
  );
  const visibleFilterChips = useMemo(() => filterChips, [filterChips]);
  const activeTag = activeFilter?.tag ?? null;
  const feedLoopEnabled = false;
  const itemsRef = useRef(items);
  const activeTagRef = useRef(activeTag);
  const feedLoopEnabledRef = useRef(feedLoopEnabled);
  const hydrateCollectionMediaRef = useRef<(item: MarketItem | null | undefined) => void | Promise<void>>(() => undefined);
  const fallbackMediaByCollection = useMemo(() => {
    const next: Record<string, FeedViewerMedia[]> = {};
    items.forEach((item) => {
      next[item.collectionId] = buildFallbackMediaItems(item).map((media) => ({
        ...media,
        url: normalizeStableUri(media.url) ?? media.url,
        fileId: normalizeStableUri(media.fileId),
      }));
    });
    return next;
  }, [items]);
  const feedListKey = useMemo(
    () => `market-feed-${feedLoopEnabled ? 'loop' : 'linear'}-${activeTag ?? 'all'}`,
    [activeTag, feedLoopEnabled],
  );

  /**
   * Circular buffer: [ghost(last)] [item0...itemN] [ghost(first)]
   *
   * When user scrolls to ghost(first) at index N+2, we silently teleport to
  * item0 at index 1 - same content, zero visual difference.
   * When user scrolls to ghost(last) at index 0, we teleport to itemN at
  * index N+1 - same content, zero visual difference.
   *
   * The teleport uses scrollToOffset({ animated: false }) SYNCHRONOUSLY inside
  * the same onMomentumScrollEnd handler - no RAF gap, no frame flash.
   */
  const canPatchBrands = user?.type !== 'BRAND';

  const feedItems = useMemo<FeedListEntry[]>(() => {
    const realEntries = items.map((item, realIndex) => ({
      item,
      realIndex,
      listKey: `real-${item.collectionId}`,
      isGhost: false,
    }));

    if (!feedLoopEnabled || realEntries.length < 2) {
      return realEntries;
    }

    const firstEntry = realEntries[0];
    const lastEntry = realEntries[realEntries.length - 1];

    return [
      {
        ...lastEntry,
        listKey: `ghost-head-${lastEntry.item.collectionId}`,
        isGhost: true,
      },
      ...realEntries,
      {
        ...firstEntry,
        listKey: `ghost-tail-${firstEntry.item.collectionId}`,
        isGhost: true,
      },
    ];
  }, [feedLoopEnabled, items]);
  const feedLoopHeadOffset = feedLoopEnabled ? 1 : 0;
  const currentLoopKey = useMemo(
    () => `${activeTag ?? 'all'}-${items.length}-${pageHeight}`,
    [activeTag, items.length, pageHeight],
  );
  const bottomClearance = immersiveOverlayBottomClearance;
  const overlayScrollPadding = bottomClearance;
  const overlaySurface = useMemo(
    () => ({
      backgroundColor: theme.colors.glassSurfaceStrong,
      borderColor: theme.colors.glassBorder,
      blurIntensity: theme.colors.glassBlur as number,
    }),
    [theme.colors.glassBlur, theme.colors.glassBorder, theme.colors.glassSurfaceStrong],
  );

  useEffect(() => {
    feedMountCount += 1;
    devLog('HomeFeed', 'Feed mounted', {
      feedMountCount,
      restoredScrollOffset: feedScrollOffset,
    });
    return () => {
      devLog('HomeFeed', 'Feed unmounted', {
        feedMountCount,
        savedScrollOffset: feedScrollOffset,
      });
    };
  }, []);

  useEffect(() => {
    if (hasLoggedInitialPageHeightRef.current) return;
    hasLoggedInitialPageHeightRef.current = true;
    devLog('HomeFeed', 'Initial page height candidate', {
      windowHeight,
      insetsTop: insets.top,
      insetsBottom: insets.bottom,
      fallbackPageHeight,
      measuredPageHeight: measuredFeedViewportHeight || null,
      feedViewportHeight,
      snapToInterval: pageHeight || null,
      itemLayoutLength: pageHeight || null,
      bottomClearance,
      model: 'measured-visible-viewport',
    });
  }, [bottomClearance, fallbackPageHeight, feedViewportHeight, insets.bottom, insets.top, measuredFeedViewportHeight, pageHeight, windowHeight]);

  useEffect(() => {
    if (!pageHeight || lastLoggedPageHeightRef.current === pageHeight) return;
    lastLoggedPageHeightRef.current = pageHeight;
    layoutDevLog('feed-page-height', {
      windowHeight,
      insetsTop: insets.top,
      insetsBottom: insets.bottom,
      measuredPageHeight: measuredFeedViewportHeight || null,
      feedViewportHeight,
      pageHeight,
      snapToInterval: pageHeight,
      itemHeight: pageHeight,
      bottomClearance,
      model: 'measured-visible-viewport',
    });
  }, [bottomClearance, feedViewportHeight, insets.bottom, insets.top, measuredFeedViewportHeight, pageHeight, windowHeight]);

  useEffect(() => {
    if (!feedLoopEnabled || feedViewportHeight <= 0 || pageHeight <= 1 || feedItems.length < 3) {
      return;
    }
    if (initializedLoopKeyRef.current === currentLoopKey) {
      return;
    }

    devLog('HomeFeed', 'Scroll to offset', { offset: feedLoopHeadOffset * pageHeight, reason: 'loop init', currentLoopKey });
    initializedLoopKeyRef.current = currentLoopKey;
    requestAnimationFrame(() => {
      feedListRef.current?.scrollToOffset({
        offset: feedLoopHeadOffset * pageHeight,
        animated: false,
      });
    });
  }, [currentLoopKey, feedItems.length, feedLoopEnabled, feedLoopHeadOffset, feedViewportHeight, pageHeight]);

  useEffect(() => {
    collectionMediaMapRef.current = collectionMediaMap;
  }, [collectionMediaMap]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    activeTagRef.current = activeTag;
  }, [activeTag]);

  useEffect(() => {
    feedLoopEnabledRef.current = feedLoopEnabled;
  }, [feedLoopEnabled]);

  useEffect(() => {
    patchedBrandIdsRef.current = patchedBrandIds;
  }, [patchedBrandIds]);

  useEffect(() => {
    threadStateByMediaRef.current = threadStateByMedia;
  }, [threadStateByMedia]);

  useEffect(() => {
    threadingMediaByIdRef.current = threadingMediaById;
  }, [threadingMediaById]);

  useEffect(() => {
    savedLookByCollectionIdRef.current = savedLookByCollectionId;
  }, [savedLookByCollectionId]);

  useEffect(() => {
    savingLookByCollectionIdRef.current = savingLookByCollectionId;
  }, [savingLookByCollectionId]);

  useEffect(() => {
    if (status !== 'authenticated' || items.length === 0) {
      if (status !== 'authenticated') {
        savedLookByCollectionIdRef.current = {};
        lastSavedCheckKeyRef.current = null;
        setSavedLookByCollectionId({});
      }
      return undefined;
    }

    const ids = Array.from(new Set(items.map((item) => item.collectionId).filter(Boolean))).sort();
    const savedCheckKey = `${user?.id ?? 'authenticated'}:${ids.join('|')}`;
    if (lastSavedCheckKeyRef.current === savedCheckKey) {
      return undefined;
    }
    lastSavedCheckKeyRef.current = savedCheckKey;
    let cancelled = false;
    SavedItemsApi.checkBatch('COLLECTION', ids)
      .then((result) => {
        if (cancelled) return;
        setSavedLookByCollectionId((current) => {
          const next = { ...current };
          ids.forEach((id) => {
            next[id] = Boolean(result[id]);
          });
          savedLookByCollectionIdRef.current = next;
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) {
          lastSavedCheckKeyRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items, status, user?.id]);

  useEffect(() => {
    void loadPatchedBrands();
  }, [loadPatchedBrands]);

  useEffect(() => {
      const activeItem = items[activePageIndex];
    const previousIndex = previousActivePageIndexRef.current;
    const jumpDistance = Math.abs(activePageIndex - previousIndex);
    previousActivePageIndexRef.current = activePageIndex;
    scrollDevLog('active-index', {
      visibleIndex: activePageIndex,
      previousIndex,
      jumpDistance,
      itemId: activeItem?.id,
      itemTitle: activeItem?.collectionTitle,
      snapToInterval: pageHeight || null,
      itemLayoutLength: pageHeight || null,
      isModernAdre: activeItem?.collectionTitle?.includes('Modern Ad') || false,
    });
  }, [activePageIndex, items, pageHeight]);

  useEffect(() => {
    const nextItem = items[activePageIndex + 1];
    const nextMedia = nextItem ? buildFallbackMediaItems(nextItem)[0] : null;
    if (!nextMedia) return;
    const nextDirectUrl = normalizeStableUri(nextMedia.displayUrl) ?? normalizeStableUri(nextMedia.url);
    if (!nextDirectUrl || !isUsableImageHttpUrl(nextDirectUrl)) return;
    void prefetchResolvedImageAsset({
      src: nextDirectUrl,
      fileId: null,
      allowSignedFallback: false,
      debugContext: {
        designId: nextMedia.id,
        mediaIndex: 0,
        sourceField: 'feed.next.displayUrl',
      },
    });
  }, [activePageIndex, items]);

  useEffect(() => {
    let mounted = true;

    void fetchMarketFilterChipsQuery().then((chips) => {
      if (!mounted || !chips.length) return;
      devLog('HomeFeed', 'Filter chips loaded', chips.map(c => ({ id: c.id, label: c.label, tag: c.tag })));
      setFilterChips(chips);
      setSelectedFilterId((current) => {
        if (chips.some((chip) => chip.id === current)) {
          return current;
        }
        return DEFAULT_MARKET_FILTER_CHIPS[0].id;
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    devLog('HomeFeed', 'Filter change', { activeTag, oldIndex: activePageIndex, reason: 'activeTag changed' });
    setActivePageIndex(0);
    initializedLoopKeyRef.current = null;
    setCommentsTarget(null);
    setCollectionMediaMap({});
    collectionMediaMapRef.current = {};
    carouselIndexMap.clear();
    feedScrollOffset = 0;
    feedActiveIndex = 0;
    setThreadStateByMedia({});
    setThreadingMediaById({});
    setSavingLookByCollectionId({});
    threadStateByMediaRef.current = {};
    threadingMediaByIdRef.current = {};
    savingLookByCollectionIdRef.current = {};
    queuedThreadIntentByMediaRef.current = {};
    viewedFeedItemKeysRef.current.clear();
    pendingCollectionIdsRef.current.clear();
    hydratedCollectionIdsRef.current.clear();
  }, [activeTag]);

  const toErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
  const isLikelyNetworkError = (msg: string) => /network|timeout|failed to fetch|connection/i.test(msg);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    setIsNetworkError(false);
    setCommentsTarget(null);

    // Stale-while-revalidate: serve cached data immediately, skip the loading spinner.
    const cacheIdentity = buildFeedCacheIdentity({
      tag: activeTag,
      userId: status === 'authenticated' ? user?.id ?? null : null,
    });
    const cached = await readCachedMarketFeed(cacheIdentity);
    const startedAt = Date.now();
    if (cached) {
      // Sort cached items to prioritize valid media
      const sortedCachedItems = [...cached.snapshot.items].sort((a, b) => {
        const aValid = isValidMediaItem(a);
        const bValid = isValidMediaItem(b);
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        return 0;
      });
      devLog('HomeFeed', 'Cache applied', sortedCachedItems.slice(0, 5).map((item, idx) => ({
        index: idx,
        id: item.id,
        collectionId: item.collectionId,
        title: item.collectionTitle,
        brand: item.brandName,
        username: item.username,
        mediaUrl: item.media.url,
        mediaFileId: item.media.fileId,
        mediaType: item.media.type,
        validity: isValidMediaItem(item) ? 'valid' : 'invalid',
        isModernAdre: item.collectionTitle?.includes('Modern Ad') || false,
      })));
      setItems(sortedCachedItems);
      setNextCursor(cached.snapshot.nextCursor);
      setHasNextPage(cached.snapshot.hasNextPage);
      feedLoadDevLog('summary', {
        cacheHit: true,
        blockingSkeleton: false,
        fetchMs: 0,
        itemCount: sortedCachedItems.length,
      });
      if (cached.isFresh) {
        // Cache is fresh - no need to revalidate
        setLoading(false);
        return;
      }
      // Stale cache - show content immediately but revalidate silently
      setLoading(false);
    } else {
      // No cache - show skeleton on first load
      setLoading(true);
      feedLoadDevLog('summary', {
        cacheHit: false,
        blockingSkeleton: true,
        fetchMs: 0,
        itemCount: 0,
      });
    }

    try {
      const res = await fetchMarketFeedPage({ cursor: null, tag: activeTag, counts: 'combined' });
      devLog('HomeFeed', 'API response', res.items.slice(0, 5).map((item, idx) => ({
        index: idx,
        id: item.id,
        collectionId: item.collectionId,
        title: item.collectionTitle,
        brand: item.brandName,
        username: item.username,
        mediaUrl: item.media.url,
        mediaFileId: item.media.fileId,
        mediaType: item.media.type,
        validity: isValidMediaItem(item) ? 'valid' : 'invalid',
        isModernAdre: item.collectionTitle?.includes('Modern Ad') || false,
      })));
      // Sort items to prioritize valid media (invalid items moved to end)
      const sortedItems = [...res.items].sort((a, b) => {
        const aValid = isValidMediaItem(a);
        const bValid = isValidMediaItem(b);
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        return 0;
      });
      devLog('HomeFeed', 'After sort', sortedItems.slice(0, 5).map((item, idx) => ({
        index: idx,
        id: item.id,
        title: item.collectionTitle,
        isModernAdre: item.collectionTitle?.includes('Modern Ad') || false,
      })));
      await writeCachedMarketFeed(cacheIdentity, {
        items: sortedItems,
        nextCursor: res.nextCursor ?? null,
        hasNextPage: res.hasNextPage,
      });
      setItems(sortedItems);
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
      feedLoadDevLog('summary', {
        cacheHit: Boolean(cached),
        blockingSkeleton: !cached && sortedItems.length === 0,
        fetchMs: Date.now() - startedAt,
        itemCount: sortedItems.length,
      });
    } catch (err) {
      // If we already have cached content, don't overwrite with an error state
      if (!cached) {
        const message = toErrorMessage(err);
        setError(message);
        setIsNetworkError(isLikelyNetworkError(message));
      }
    } finally {
      setLoading(false);
    }
  }, [activeTag, status, user?.id]);

  const hydrateCollectionMedia = useCallback(async (item: MarketItem | null | undefined) => {
    const collectionId = item?.collectionId?.trim();
    if (!collectionId) return;
    if (!item) return;
    const strictFeedMedia = buildFallbackMediaItems(item);
    if (strictFeedMedia.length > 0) {
      setCollectionMediaMap((prev) => {
        if (prev[collectionId]?.length) return prev;
        return {
          ...prev,
          [collectionId]: strictFeedMedia,
        };
      });
      hydratedCollectionIdsRef.current.add(collectionId);
      return;
    }
    if (collectionMediaMapRef.current[collectionId]?.length) {
      return;
    }
    if (hydratedCollectionIdsRef.current.has(collectionId)) return;
    if (pendingCollectionIdsRef.current.has(collectionId)) return;

    pendingCollectionIdsRef.current.add(collectionId);
    try {
      const detail = await brandApi.getCollectionDetail(collectionId, { scope: 'design' });
      if (!detail) {
        hydratedCollectionIdsRef.current.add(collectionId);
        return;
      }

      const medias = Array.isArray(detail.medias) ? detail.medias : [];
      const validMedias = medias.filter((media) => {
        const directUrl = getCollectionMediaDirectUrl(media);
        const fileId = getCollectionMediaFileId(media);
        return directUrl || fileId;
      });
      const nextMediaItems = validMedias.map((media: CollectionDetailMediaDto, index) => {
        const directUrl = getCollectionMediaDirectUrl(media);
        const fileId = getCollectionMediaFileId(media);
        const url = directUrl ?? '';
        const rawMedia = media as unknown as Record<string, unknown>;
        const rawFile = media.file as unknown as Record<string, unknown> | undefined;
        const width = toFiniteNumber(rawMedia.width ?? rawFile?.width);
        const height = toFiniteNumber(rawMedia.height ?? rawFile?.height);
        const aspectRatio =
          toFiniteNumber(rawMedia.aspectRatio ?? rawFile?.aspectRatio) ??
          (width && height ? width / height : null);
        return {
          id: media.id || media.file?.id || `${collectionId}-${index}`,
          collectionId,
          mediaIndex: index,
          url,
          displayUrl: url,
          fileId,
          type: toFeedMediaType(media.mediaType ?? null),
          label: media.caption ?? detail.title ?? item?.collectionTitle ?? 'Runway view',
          orderIndex: typeof media.orderIndex === 'number' ? media.orderIndex : index,
          width,
          height,
          aspectRatio,
          threadsCount:
            typeof media.threadsCount === 'number'
              ? media.threadsCount
              : media.id === item?.id && typeof item?.threadsCount === 'number'
                ? item.threadsCount
                : 0,
        } satisfies FeedViewerMedia;
      });

      const normalizedMediaItems = nextMediaItems
        .filter((media) => Boolean(media.id))
        .map((media) => ({
          ...media,
          url: normalizeStableUri(media.url) ?? media.url,
          displayUrl: normalizeStableUri(media.displayUrl) ?? normalizeStableUri(media.url),
          fileId: normalizeStableUri(media.fileId),
        }))
        .sort((a, b) => (a.orderIndex ?? a.mediaIndex) - (b.orderIndex ?? b.mediaIndex));
      if (!normalizedMediaItems.length) {
        hydratedCollectionIdsRef.current.add(collectionId);
        return;
      }

      setCollectionMediaMap((prev) => {
        if (prev[collectionId]?.length) return prev;
        return {
          ...prev,
          [collectionId]: normalizedMediaItems,
        };
      });
      setThreadStateByMedia((prev) => {
        const next = { ...prev };
        normalizedMediaItems.forEach((media) => {
          if (!next[media.id]) {
            next[media.id] = {
              threaded: media.id === item?.id ? Boolean(item?.isThreaded) : false,
              count: media.threadsCount,
            };
          }
        });
        return next;
      });
      hydratedCollectionIdsRef.current.add(collectionId);
    } catch {
      // Keep the feed on its current fallback media if hydration fails.
    } finally {
      pendingCollectionIdsRef.current.delete(collectionId);
    }
  }, []);

  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 80,
    minimumViewTime: 120,
  });

  useEffect(() => {
    hydrateCollectionMediaRef.current = hydrateCollectionMedia;
  }, [hydrateCollectionMedia]);

  const stableOnViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: FeedListEntry | null; index?: number | null }> }) => {
      const currentItems = itemsRef.current;
      const currentActiveTag = activeTagRef.current;
      const currentFeedLoopEnabled = feedLoopEnabledRef.current;
      const currentHydrateCollectionMedia = hydrateCollectionMediaRef.current;

      const primaryEntry = viewableItems[0]?.item;
      if (primaryEntry && !primaryEntry.isGhost) {
        feedActiveIndex = primaryEntry.realIndex;
        setActivePageIndex((current) => (current === primaryEntry.realIndex ? current : primaryEntry.realIndex));
        const viewedKey = `${primaryEntry.item.collectionId}:${primaryEntry.realIndex}`;
        if (!viewedFeedItemKeysRef.current.has(viewedKey)) {
          viewedFeedItemKeysRef.current.add(viewedKey);
          const mediaItems = collectionMediaMapRef.current[primaryEntry.item.collectionId] ?? buildFallbackMediaItems(primaryEntry.item);
          const media = mediaItems[carouselIndexMap.get(primaryEntry.item.collectionId) ?? 0] ?? mediaItems[0] ?? null;
          trackMobileEvent('feed_item_viewed', {
            sourceScreen: 'runway_feed',
            itemId: primaryEntry.item.collectionId,
            itemType: primaryEntry.item.entityType,
            feedPosition: primaryEntry.realIndex,
            collectionId: primaryEntry.item.collectionId,
            mediaId: media?.id ?? null,
            brandId: primaryEntry.item.brandId,
            categoryFilter: currentActiveTag,
          });
        }
      }
      viewableItems.forEach(({ item: entry }) => {
        const collectionId = entry?.item.collectionId?.trim();
        if (!collectionId) return;
        if (!currentItems.length) return;

        const realIndex = entry?.realIndex ?? currentItems.findIndex((candidate) => candidate.collectionId === collectionId);
        if (realIndex < 0) return;

        for (let offset = -1; offset <= 2; offset += 1) {
          const nextIndex = currentFeedLoopEnabled
            ? (realIndex + offset + currentItems.length) % currentItems.length
            : realIndex + offset;
          if (nextIndex < 0 || nextIndex >= currentItems.length) continue;
          void currentHydrateCollectionMedia(currentItems[nextIndex]);
        }
      });
    },
  );

  useEffect(() => {
    if (!items.length) return;

    for (let offset = -1; offset <= 2; offset += 1) {
      const nextIndex = feedLoopEnabled
        ? (activePageIndex + offset + items.length) % items.length
        : activePageIndex + offset;
      if (nextIndex < 0 || nextIndex >= items.length) continue;

      const item = items[nextIndex];
      void hydrateCollectionMedia(item);
    }
  }, [activePageIndex, feedLoopEnabled, hydrateCollectionMedia, items]);

  const openCommentsSheet = useCallback((item: MarketItem) => {
    if (!item.collectionId) return;
    setCommentsTarget({
      collectionId: item.collectionId,
      title: item.collectionTitle,
    });
    void hydrateCollectionMedia(item);
  }, [hydrateCollectionMedia]);

  const closeCommentsSheet = useCallback(() => {
    setCommentsTarget(null);
  }, []);

  const executeThreadIntent = useCallback(
    async (
      mediaId: string,
      collectionId: string | null,
      nextThreaded: boolean,
      baselineState?: { threaded: boolean; count: number },
    ) => {
      const previousState =
        baselineState ??
        threadStateByMediaRef.current[mediaId] ?? {
          threaded: false,
          count: 0,
        };
      const optimisticCount = Math.max(0, previousState.count + (nextThreaded ? 1 : -1));

      const optimisticState = {
        threaded: nextThreaded,
        count: optimisticCount,
      };

      if (!nextThreaded) {
        threadStateByMediaRef.current = {
          ...threadStateByMediaRef.current,
          [mediaId]: optimisticState,
        };

        setThreadStateByMedia((prev) => ({
          ...prev,
          [mediaId]: optimisticState,
        }));
      }

      threadingMediaByIdRef.current = {
        ...threadingMediaByIdRef.current,
        [mediaId]: true,
      };
      setThreadingMediaById((prev) => ({ ...prev, [mediaId]: true }));

      let finalState = previousState;

      try {
        const result = await toggleCollectionMediaThread(mediaId);
        finalState = {
          threaded: result.threaded,
          count: result.threads,
        };
        trackMobileEvent('thread_toggled', {
          sourceScreen: 'runway_feed',
          itemId: collectionId ?? mediaId,
          mediaId,
          collectionId,
          previousThreaded: previousState.threaded,
          nextThreaded: result.threaded,
          threadCount: result.threads,
          result: 'success',
        });

        threadStateByMediaRef.current = {
          ...threadStateByMediaRef.current,
          [mediaId]: finalState,
        };

        setThreadStateByMedia((prev) => ({
          ...prev,
          [mediaId]: finalState,
        }));

      } catch {
        finalState = previousState;
        trackMobileEvent('thread_toggled', {
          sourceScreen: 'runway_feed',
          itemId: collectionId ?? mediaId,
          mediaId,
          collectionId,
          previousThreaded: previousState.threaded,
          nextThreaded,
          threadCount: previousState.count,
          result: 'failure',
          errorCode: 'thread_toggle_failed',
        });

        threadStateByMediaRef.current = {
          ...threadStateByMediaRef.current,
          [mediaId]: previousState,
        };

        setThreadStateByMedia((prev) => ({
          ...prev,
          [mediaId]: previousState,
        }));
      } finally {
        const nextBusy = { ...threadingMediaByIdRef.current };
        delete nextBusy[mediaId];
        threadingMediaByIdRef.current = nextBusy;

        setThreadingMediaById((prev) => {
          const next = { ...prev };
          delete next[mediaId];
          return next;
        });

        const queuedIntent = queuedThreadIntentByMediaRef.current[mediaId];
        delete queuedThreadIntentByMediaRef.current[mediaId];

        if (typeof queuedIntent === 'boolean' && queuedIntent !== finalState.threaded) {
          void executeThreadIntent(mediaId, collectionId, queuedIntent, finalState);
        }
      }
    },
    [],
  );

  const handleThreadPress = useCallback(
    (
      mediaId: string | null | undefined,
      collectionId?: string | null,
      fallbackThreaded = false,
      fallbackCount = 0,
    ) => {
      const normalizedMediaId = typeof mediaId === 'string' ? mediaId.trim() : '';
      if (!normalizedMediaId) return;
      if (status !== 'authenticated') return;

      const normalizedCollectionId = typeof collectionId === 'string' ? collectionId.trim() : '';
      const currentState =
        threadStateByMediaRef.current[normalizedMediaId] ?? {
          threaded: fallbackThreaded,
          count: fallbackCount,
        };

      if (!threadStateByMediaRef.current[normalizedMediaId]) {
        threadStateByMediaRef.current = {
          ...threadStateByMediaRef.current,
          [normalizedMediaId]: currentState,
        };
      }

      const nextThreaded = !currentState.threaded;

      trackMobileEvent('thread_tapped', {
        sourceScreen: 'runway_feed',
        itemId: normalizedCollectionId || normalizedMediaId,
        mediaId: normalizedMediaId,
        collectionId: normalizedCollectionId || null,
        currentThreaded: currentState.threaded,
        threadCount: currentState.count,
        feedPosition: activePageIndex,
      });

      if (threadingMediaByIdRef.current[normalizedMediaId]) {
        queuedThreadIntentByMediaRef.current[normalizedMediaId] = nextThreaded;
        trackMobileEvent('thread_toggled', {
          sourceScreen: 'runway_feed',
          itemId: normalizedCollectionId || normalizedMediaId,
          mediaId: normalizedMediaId,
          collectionId: normalizedCollectionId || null,
          previousThreaded: currentState.threaded,
          nextThreaded,
          threadCount: currentState.count,
          result: 'queued',
        });
        return;
      }

      void executeThreadIntent(normalizedMediaId, normalizedCollectionId || null, nextThreaded, currentState);
    },
    [activePageIndex, executeThreadIntent, status],
  );

  const handlePatchBrand = useCallback(
    (brandId?: string | null, brandName?: string | null) => {
      const normalizedBrandId = typeof brandId === 'string' ? brandId.trim() : '';
      if (!normalizedBrandId) return;

      requireAuth(
        async () => {
          const isPatched = patchedBrandIdsRef.current.has(normalizedBrandId);
          setPatchingBrandIds((prev) => ({ ...prev, [normalizedBrandId]: true }));

          try {
            if (isPatched) {
              await brandApi.unpatchBrand(normalizedBrandId);
              setPatchedBrandIds((prev) => {
                const next = new Set(prev);
                next.delete(normalizedBrandId);
                return next;
              });
              toast.success(`Unpatched ${brandName ?? 'brand'}`);
            } else {
              await brandApi.patchBrand(normalizedBrandId);
              setPatchedBrandIds((prev) => {
                const next = new Set(prev);
                next.add(normalizedBrandId);
                return next;
              });
              toast.success(`Patched ${brandName ?? 'brand'}`);
            }
          } catch (error) {
            toast.error(`Failed to ${isPatched ? 'unpatch' : 'patch'} ${brandName ?? 'brand'}`);
          } finally {
            setPatchingBrandIds((prev) => {
              const next = { ...prev };
              delete next[normalizedBrandId];
              return next;
            });
          }
        },
        { message: 'Sign in to patch brands' },
      );
    },
    [requireAuth, toast],
  );

  const handleOpenBrand = useCallback((brandId?: string | null) => {
    const normalizedBrandId = typeof brandId === 'string' ? brandId.trim() : '';
    if (!normalizedBrandId) return;
    trackMobileEvent('brand_opened', {
      sourceScreen: 'runway_feed',
      brandId: normalizedBrandId,
      feedPosition: activePageIndex,
    });
    router.push({ pathname: '/catalog/[brandId]', params: { brandId: normalizedBrandId } } as any);
  }, [activePageIndex]);

  const handleOpenSearch = useCallback(() => {
    perfMark('runway-search-tap');
    router.push('/search' as any);
  }, []);

  const handleSaveLook = useCallback((item: MarketItem) => {
    const collectionId = item.collectionId?.trim();
    if (!collectionId) return;

    requireAuth(
      async () => {
        if (savingLookByCollectionIdRef.current[collectionId]) return;

        const wasSaved = Boolean(savedLookByCollectionIdRef.current[collectionId]);
        const nextSaved = !wasSaved;

        savedLookByCollectionIdRef.current = {
          ...savedLookByCollectionIdRef.current,
          [collectionId]: nextSaved,
        };
        savingLookByCollectionIdRef.current = {
          ...savingLookByCollectionIdRef.current,
          [collectionId]: true,
        };
        setSavedLookByCollectionId((current) => ({ ...current, [collectionId]: nextSaved }));
        setSavingLookByCollectionId((current) => ({ ...current, [collectionId]: true }));

        try {
          if (wasSaved) {
            await SavedItemsApi.unsaveCatalogTarget({
              targetType: 'DESIGN',
              designId: collectionId,
              legacyCollectionId: collectionId,
            });
            trackMobileEvent('design_unsaved', {
              sourceScreen: 'runway_feed',
              targetType: 'DESIGN',
              targetId: collectionId,
              collectionId,
              brandId: item.brandId,
              feedPosition: activePageIndex,
            });
            toast.success('Removed from Saved Looks.');
          } else {
            await SavedItemsApi.saveCatalogTarget({
              targetType: 'DESIGN',
              designId: collectionId,
              legacyCollectionId: collectionId,
            });
            trackMobileEvent('design_saved', {
              sourceScreen: 'runway_feed',
              targetType: 'DESIGN',
              targetId: collectionId,
              collectionId,
              brandId: item.brandId,
              feedPosition: activePageIndex,
            });
            toast.success('Saved to Saved Looks.');
          }
        } catch (error) {
          savedLookByCollectionIdRef.current = {
            ...savedLookByCollectionIdRef.current,
            [collectionId]: wasSaved,
          };
          setSavedLookByCollectionId((current) => ({ ...current, [collectionId]: wasSaved }));
          toast.error(toErrorMessage(error));
        } finally {
          const nextBusy = { ...savingLookByCollectionIdRef.current };
          delete nextBusy[collectionId];
          savingLookByCollectionIdRef.current = nextBusy;
          setSavingLookByCollectionId((current) => {
            const next = { ...current };
            delete next[collectionId];
            return next;
          });
        }
      },
      { message: 'Sign in to save looks' },
    );
  }, [activePageIndex, requireAuth, toast]);

  const handleCarouselIndexChange = useCallback((collectionId: string, nextIndex: number) => {
    carouselIndexMap.set(collectionId, nextIndex);
  }, []);

  const hideMetaOverlay = useCallback(() => {
    if (metaOverlayHideTimerRef.current) {
      clearTimeout(metaOverlayHideTimerRef.current);
      metaOverlayHideTimerRef.current = null;
    }
    setVisibleMetaCollectionId(null);
  }, []);

  const showMetaOverlay = useCallback((collectionId: string) => {
    if (metaOverlayHideTimerRef.current) {
      clearTimeout(metaOverlayHideTimerRef.current);
    }
    setVisibleMetaCollectionId(collectionId);
    metaOverlayHideTimerRef.current = setTimeout(() => {
      setVisibleMetaCollectionId((current) => (current === collectionId ? null : current));
      metaOverlayHideTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (metaOverlayHideTimerRef.current) {
        clearTimeout(metaOverlayHideTimerRef.current);
      }
    };
  }, []);

  const renderFeedItem = useCallback(
    ({ item: entry }: { item: FeedListEntry }) => {
      const item = entry.item;
      const fallbackMediaItems = fallbackMediaByCollection[item.collectionId] ?? [];
      const hydratedMediaItems = collectionMediaMap[item.collectionId] ?? [];
      const mediaItems =
        hydratedMediaItems.length > fallbackMediaItems.length
          ? hydratedMediaItems
          : fallbackMediaItems.length
            ? fallbackMediaItems
            : hydratedMediaItems;
      const brandName = item.brandName ?? item.username ?? 'Brand';
      const handle = item.username ? `@${item.username}` : '';
      const activeMediaIndex = mediaItems.length
        ? Math.min(carouselIndexMap.get(item.collectionId) ?? 0, mediaItems.length - 1)
        : 0;
      if (__DEV__) {
        const uniqueSources = new Set(
          mediaItems.map((media) => normalizeStableUri(media.displayUrl) ?? normalizeStableUri(media.url) ?? normalizeStableUri(media.fileId) ?? media.id),
        );
        feedMediaDevLog('carousel-summary', {
          collectionId: item.collectionId,
          mediaCount: mediaItems.length,
          uniqueMediaIds: Array.from(new Set(mediaItems.map((media) => media.id))),
          uniqueDisplayUrls: uniqueSources.size,
          activeIndex: activeMediaIndex,
          nextIndex: mediaItems.length > 1 ? Math.min(mediaItems.length - 1, activeMediaIndex + 1) : null,
          strictMediaCount: fallbackMediaItems.length,
          hydratedMediaCount: hydratedMediaItems.length,
        });
      }
      const currentMedia = mediaItems[activeMediaIndex] ?? fallbackMediaItems[0] ?? null;
      const currentMediaId = currentMedia?.id ?? item.id;
      const currentMediaThreadState = currentMedia ? threadStateByMedia[currentMedia.id] : undefined;
      const isThreaded = currentMedia
        ? currentMediaThreadState?.threaded ?? (currentMedia.id === item.id ? Boolean(item.isThreaded) : false)
        : Boolean(item.isThreaded);
      const isThreading = Boolean(threadingMediaById[currentMediaId]);
      const likes = toCompactCount(item.likesCount ?? 0);
      const commentCountRaw = item.combinedCommentsCount ?? item.commentsCount ?? 0;
      const comments = formatMetricCountLabel(commentCountRaw, 'comment', 'comments');
      const threadCountRaw =
        currentMediaThreadState?.count ??
        currentMedia?.threadsCount ??
        item.threadsCount ??
        0;
      const threads = formatMetricCountLabel(threadCountRaw, 'thread', 'threads');
      const isSavedLook = Boolean(savedLookByCollectionId[item.collectionId]);
      const isSavingLook = Boolean(savingLookByCollectionId[item.collectionId]);

      return (
        <MarketFeedItem
          collectionId={item.collectionId}
          pageHeight={pageHeight}
          mediaItems={mediaItems}
          activeMediaIndex={activeMediaIndex}
          onCarouselIndexChange={handleCarouselIndexChange}
          onContentPress={() => showMetaOverlay(item.collectionId)}
          badgeOverlay={
            <NewDropBadge
              itemId={item.collectionId}
              createdAt={item.createdAt ?? item.media?.createdAt}
              sourceScreen="runway_feed"
              feedPosition={entry.realIndex}
              style={styles.newDropBadge}
            />
          }
          actionRail={
            <FeedActionRail
              item={item}
              brandName={brandName}
              currentMediaId={currentMediaId}
              isThreaded={isThreaded}
              isThreading={isThreading}
              likes={likes}
              comments={comments}
              threads={threads}
              threadCountRaw={threadCountRaw}
              isSavedLook={isSavedLook}
              isSavingLook={isSavingLook}
              canPatchBrands={canPatchBrands}
              isPatched={Boolean(item.brandId && patchedBrandIds.has(item.brandId))}
              patchBusy={Boolean(item.brandId && patchingBrandIds[item.brandId])}
              bottomClearance={bottomClearance}
              onPatchBrand={handlePatchBrand}
              onOpenBrand={handleOpenBrand}
              onSaveLook={handleSaveLook}
              onThreadPress={handleThreadPress}
              onOpenComments={openCommentsSheet}
            />
          }
          metaOverlay={
            <FeedMetaOverlay
              itemId={item.collectionId}
              mediaId={currentMediaId}
              handle={handle}
              title={item.collectionTitle}
              threadCount={threadCountRaw}
              feedPosition={entry.realIndex}
              scheme={scheme}
              overlaySurface={overlaySurface}
              bottomClearance={bottomClearance}
              visible={visibleMetaCollectionId === item.collectionId}
              onBrandPress={() => handleOpenBrand(item.brandId)}
            />
          }
        />
      );
    },
    [
      bottomClearance,
      canPatchBrands,
      collectionMediaMap,
      fallbackMediaByCollection,
      handleCarouselIndexChange,
      handleOpenBrand,
      handlePatchBrand,
      handleSaveLook,
      handleThreadPress,
      openCommentsSheet,
      overlaySurface,
      pageHeight,
      patchedBrandIds,
      patchingBrandIds,
      savedLookByCollectionId,
      savingLookByCollectionId,
      scheme,
      showMetaOverlay,
      threadStateByMedia,
      threadingMediaById,
      visibleMetaCollectionId,
    ],
  );

  const handleFeedScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      feedScrollOffset = event.nativeEvent.contentOffset.y;
      feedActiveIndex = Math.max(0, Math.min(feedItems.length - 1, Math.round(feedScrollOffset / pageHeight)));
    },
    [feedItems.length, pageHeight],
  );

  const handleFeedScrollBeginDrag = useCallback(() => {
    hideMetaOverlay();
    requestNativeIslandCollapse();
  }, [hideMetaOverlay]);

  const handleFeedMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const rawIndex = Math.max(
        0,
        Math.min(feedItems.length - 1, Math.round(e.nativeEvent.contentOffset.y / pageHeight)),
      );
      const previousIndex = activePageIndex;
      const measuredRealIndex = feedItems[rawIndex]?.realIndex ?? rawIndex;
      const jumpDistance = Math.abs(measuredRealIndex - previousIndex);
      const shouldCorrectJump = !feedLoopEnabled && jumpDistance > 1;
      const correctedRealIndex = shouldCorrectJump
        ? Math.max(0, Math.min(items.length - 1, previousIndex + Math.sign(measuredRealIndex - previousIndex)))
        : measuredRealIndex;

      scrollDevLog('vertical-momentum', {
        measuredIndex: measuredRealIndex,
        previousIndex,
        jumpDistance,
        corrected: shouldCorrectJump,
        pageHeight,
        contentOffsetY: e.nativeEvent.contentOffset.y,
      });

      if (shouldCorrectJump) {
        const correctedListIndex = feedItems.findIndex((entry) => entry.realIndex === correctedRealIndex && !entry.isGhost);
        if (correctedListIndex >= 0) {
          feedListRef.current?.scrollToIndex({ index: correctedListIndex, animated: false });
        }
      }

      if (!feedLoopEnabled && correctedRealIndex !== previousIndex) {
        trackMobileEvent('feed_item_swiped', {
          sourceScreen: 'runway_feed',
          fromItemId: items[previousIndex]?.collectionId ?? null,
          toItemId: items[correctedRealIndex]?.collectionId ?? null,
          direction: correctedRealIndex > previousIndex ? 'down' : correctedRealIndex < previousIndex ? 'up' : 'none',
          fromPosition: previousIndex,
          toPosition: correctedRealIndex,
          categoryFilter: activeTag,
        });
      }

      if (feedLoopEnabled) {
        if (rawIndex === feedItems.length - 1) {
          const targetOffset = feedLoopHeadOffset * pageHeight;
          feedTeleportingRef.current = true;
          feedListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
          setActivePageIndex(0);
          setTimeout(() => {
            feedTeleportingRef.current = false;
          }, 80);
          return;
        }

        if (rawIndex === 0) {
          const realLastIndex = items.length;
          const targetOffset = realLastIndex * pageHeight;
          feedTeleportingRef.current = true;
          feedListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
          setActivePageIndex(items.length - 1);
          setTimeout(() => {
            feedTeleportingRef.current = false;
          }, 80);
          return;
        }

        const realIndex = feedItems[rawIndex]?.realIndex ?? 0;
        setActivePageIndex(Math.min(realIndex, items.length - 1));
        return;
      }

      feedActiveIndex = correctedRealIndex;
      setActivePageIndex(correctedRealIndex);
      if (rawIndex >= items.length - 1 && hasNextPage) {
        void loadMore();
      }
    },
    [activePageIndex, activeTag, feedItems, feedLoopEnabled, feedLoopHeadOffset, hasNextPage, items, pageHeight],
  );

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !nextCursor || loading || refreshing || loadingMoreInFlightRef.current) return;
    loadingMoreInFlightRef.current = true;

    try {
      const res = await fetchMarketFeedPage({ cursor: nextCursor, tag: activeTag, counts: 'combined' });
      setItems((prev) => {
        const seenCollectionIds = new Set(prev.map((item) => item.collectionId));
        const nextItems = res.items.filter((item) => !seenCollectionIds.has(item.collectionId));
        return [...prev, ...nextItems];
      });
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
    } catch {
      // Best-effort pagination; keep current items.
    } finally {
      loadingMoreInFlightRef.current = false;
    }
  }, [activeTag, hasNextPage, loading, nextCursor, refreshing]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setIsNetworkError(false);
    setCommentsTarget(null);

    try {
      const res = await fetchMarketFeedPage({ cursor: null, tag: activeTag, counts: 'combined' });
      // Sort items to prioritize valid media (invalid items moved to end)
      const sortedItems = [...res.items].sort((a, b) => {
        const aValid = isValidMediaItem(a);
        const bValid = isValidMediaItem(b);
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        return 0;
      });
      await writeCachedMarketFeed(buildFeedCacheIdentity({
        tag: activeTag,
        userId: status === 'authenticated' ? user?.id ?? null : null,
      }), {
        items: sortedItems,
        nextCursor: res.nextCursor ?? null,
        hasNextPage: res.hasNextPage,
      });
      setItems(sortedItems);
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
    } catch (err) {
      if (items.length === 0) {
        const message = toErrorMessage(err);
        setError(message);
        setIsNetworkError(isLikelyNetworkError(message));
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTag, items.length, status, user?.id]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Only refetch if data is stale (> 60s old) - prevents redundant calls on every tab visit
      if (now - lastPatchFetchRef.current > STALE_THRESHOLD_MS) {
        void loadPatchedBrands();
      }
      // Clear any stale comments target on tab focus
      setCommentsTarget(null);
      // Only restore scroll when the FlatList has drifted from the expected snap position.
      // Skips the call when the list is already at the right page (prevents jarring teleport on tab refocus).
      if (feedScrollOffset > 0 && pageHeight > 0) {
        const safeIndex = Math.max(0, Math.min(feedActiveIndex, feedItems.length - 1));
        const expectedOffset = safeIndex * pageHeight;
        const drift = Math.abs(feedScrollOffset - expectedOffset);
        if (drift > pageHeight * 0.3) {
          requestAnimationFrame(() => {
            feedListRef.current?.scrollToIndex({ index: safeIndex, animated: false });
          });
        }
      }
    }, [feedItems.length, loadPatchedBrands, pageHeight]),
  );

  return (
    <SafeAreaView
      edges={[]}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
      onLayout={(event) => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        if (nextHeight > 0 && nextHeight !== rootViewportHeight) {
          setRootViewportHeight(nextHeight);
        }
      }}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {!loading ? (
        <>
          <View
            style={[
              styles.header,
              {
                paddingTop: insets.top + tokens.spacing.xs,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.headerRow} pointerEvents="box-none">
                <View style={styles.headerLeftGroup}>
                <Pressable
                  onPress={() => { router.push('/'); }}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.headerLogoButton,
                    pressed && { backgroundColor: theme.colors.surfaceOverlay, opacity: 0.82 },
                  ]}
                    accessibilityRole="button"
                    accessibilityLabel="Go to home">
                    <ThreadlyLogo size={30} style={styles.brandLogo} />
                  </Pressable>
                </View>

                <View style={styles.headerCenterGroup}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.headerChipsContent}
                    style={styles.headerChipsScroll}>
                    {visibleFilterChips.map((chip) => (
                      <Chip
                        key={chip.id}
                        label={chip.label}
                        variant="nav"
                        selected={chip.id === selectedFilterId}
                        onPress={() => setSelectedFilterId(chip.id)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.headerRightGroup}>
                <Pressable
                  onPress={handleOpenSearch}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    pressed && { backgroundColor: theme.colors.surfaceOverlay, opacity: 0.8 },
                  ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search">
                    <AppText variant="subtitle" style={styles.headerEmoji}>🔍</AppText>
                  </Pressable>
                </View>
            </View>
          </View>
        </>
      ) : null}

      {(showBlockingLoader || isSkeletonFadingOut) ? (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 100, opacity: skeletonOpacity }]} pointerEvents={showBlockingLoader ? 'auto' : 'none'}>
          <FeedSkeleton theme={theme} pageHeight={pageHeight || fallbackPageHeight} topOffset={insets.top} bottomClearance={bottomClearance} />
        </Animated.View>
      ) : null}

      {error && isNetworkError && !showBlockingLoader ? (
        <View style={styles.loadingWrap}>
          <NetworkErrorState onRetry={loadFirstPage} />
        </View>
      ) : error && !showBlockingLoader ? (
        <View style={[styles.loadingWrap, { paddingHorizontal: 20, gap: 12 }]}>
          <AppText variant="subtitle" style={{ textAlign: 'center' }}>Unable to load feed</AppText>
          <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>{error}</AppText>
          <Button title="Retry" variant="primary" onPress={loadFirstPage} fullWidth />
        </View>
      ) : items.length === 0 && !showBlockingLoader ? (
        <ScrollView
          contentInset={Platform.OS === 'ios' ? { bottom: overlayScrollPadding } : undefined}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: overlayScrollPadding }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>
          <FeedEmptyState onStartExploring={() => setSelectedFilterId(visibleFilterChips[0]?.id ?? DEFAULT_MARKET_FILTER_CHIPS[0].id)} />
        </ScrollView>
      ) : (
        <View
          style={styles.feedListContainer}
          onLayout={(event) => {
            const nextHeight = Math.round(event.nativeEvent.layout.height);
            if (nextHeight > 0 && measuredFeedViewportHeight !== nextHeight) {
              devLog('HomeFeed', 'Measured feed viewport', {
                measuredPageHeight: nextHeight,
                pageHeightModel: pageHeight,
                previousPageHeight: measuredFeedViewportHeight || null,
              });
              setFeedViewportHeight(nextHeight);
            }
          }}
        >
          {!feedViewportReady ? (
            <FeedSkeleton theme={theme} pageHeight={fallbackPageHeight} topOffset={insets.top} bottomClearance={bottomClearance} />
          ) : (
          <MarketFeedList
            ref={feedListRef}
            key={feedListKey}
            data={feedItems}
            keyExtractor={(entry) => entry.listKey}
            snapToInterval={pageHeight}
            snapToAlignment="start"
            disableIntervalMomentum
            getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
            decelerationRate="fast"
            directionalLockEnabled
            nestedScrollEnabled={false}
            scrollEventThrottle={32}
            bounces={false}
            overScrollMode="never"
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={3}
            maxToRenderPerBatch={2}
            updateCellsBatchingPeriod={100}
            windowSize={3}
            initialScrollIndex={feedActiveIndex > 0 ? Math.min(feedActiveIndex, feedItems.length - 1) : undefined}
            scrollEnabled={!commentsTarget}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={handleFeedScroll}
            onScrollBeginDrag={handleFeedScrollBeginDrag}
            style={{ backgroundColor: 'transparent' }}
            viewabilityConfig={viewabilityConfigRef.current}
            onViewableItemsChanged={stableOnViewableItemsChangedRef.current}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                feedListRef.current?.scrollToOffset({
                  offset: index * pageHeight,
                  animated: false,
                });
              });
            }}
            onMomentumScrollEnd={(e) => {
              handleFeedMomentumEnd(e);
            }}
            onEndReachedThreshold={0.6}
            onEndReached={() => {
              if (hasNextPage) {
                void loadMore();
              }
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            renderItem={renderFeedItem}
          />
          )}
        </View>
      )}

      <CollectionCommentsSheet
        visible={Boolean(commentsTarget)}
        collectionId={commentsTarget?.collectionId ?? null}
        collectionTitle={commentsTarget?.title ?? null}
        onClose={closeCommentsSheet}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    zIndex: 20,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenterGroup: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerChipsScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  headerChipsContent: {
    flexGrow: 1,
    gap: tokens.spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: tokens.spacing.sm,
  },
  headerLogoButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: {
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedSkeletonWrap: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  feedSkeletonRoot: {
    flex: 1,
    position: 'relative',
  },
  feedSkeletonHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  feedSkeletonHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedSkeletonLogoWrap: {
    width: 64,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedSkeletonChips: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 15,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  feedListContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  rail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 14,
  },
  newDropBadge: {
    position: 'absolute',
    top: 92,
    left: 16,
    zIndex: 7,
  },
  ownerAvatarWrap: {
    position: 'relative',
    marginBottom: 2,
  },
  ownerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  ownerPatchBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  ownerPatchBadgeBusy: {
    opacity: 0.75,
  },
  ownerPatchBadgePressed: {
    transform: [{ scale: 0.95 }],
  },
  ownerAvatarImage: {
    ...StyleSheet.absoluteFill,
  },
  avatarWrap: {
    marginBottom: 8,
  },
  userAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  userAvatarImage: {
    ...StyleSheet.absoluteFill,
  },
  profileMenuWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  profileMenu: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 28,
  },
  profileMenuIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  profileMenuAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  profileMenuAvatarImage: {
    ...StyleSheet.absoluteFill,
  },
  profileMenuAvatarText: {
    fontSize: 18,
    fontWeight: '900',
  },
  profileMenuChevron: {
    fontSize: 22,
    fontWeight: '700',
  },
  profileMenuTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  profileMenuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  profileMenuItemLast: {
    borderBottomWidth: 0,
  },
  profileMenuEmoji: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  profileMenuTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  profileMenuItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  profileMenuItemSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 15,
  },
  railItem: {
    width: 88,
    alignItems: 'center',
    gap: 6,
  },
  railBagButton: {
    borderRadius: tokens.radius.md,
    overflow: 'visible',
  },
  railCountLabel: {
    width: 88,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  meta: {
    position: 'absolute',
    left: 16,
    right: 96,
  },
  metaCard: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  metaHandlePressed: {
    opacity: 0.72,
  },
  brandLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.95,
  },
});
