/**
 * RunwayFeedScreen — native design feed (UI label: Runway).
 * Backend domain: Design. Not the commerce Market tab (`MarketScreen` / discover).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, InteractionManager, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';

import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { useToast } from '@/src/toast/ToastContext';
import { useShopperOnlyAction } from '@/src/features/bagging/useShopperOnlyAction';
import { useAuthAction } from '@/src/hooks/useAuthAction';
import { useAppStateListener } from '@/src/hooks/useAppStateListener';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { NewDropBadge } from '@/components/ui/NewDropBadge';
import { SocialProofPill } from '@/components/ui/SocialProofPill';
import { Skeleton, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton';
import { WiezLogo } from '@/components/ui/WiezLogo';
import WiezLogoLoader from '@/components/ui/WiezLogoLoader';
import ThreadRailAction from '../../../../components/catalog/ThreadRailAction';
import CollectionCommentsSheet from '@/components/catalog/CollectionCommentsSheet';
import { brandApi, type CollectionDetailMediaDto } from '@/src/api/BrandApi';
import { ProfileApi } from '@/src/api/ProfileApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { DEFAULT_MARKET_FILTER_CHIPS, type MarketFilterChip, toggleCollectionMediaThread } from '@/src/api/MarketApi';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { consumeMarketFeedDirty, fetchMarketFeedPage, readCachedMarketFeed, readMemoryCachedMarketFeed, writeCachedMarketFeed } from '@/src/features/feed/api/feedApi';
import { buildFeedCacheIdentity } from '@/src/features/feed/utils/feedKeys';
import { brandAvatarDevLog, feedDevLog, feedLoadDevLog, feedMediaDevLog, isWiezDebugEnabled, layoutDevLog, scrollDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import type { MarketItem } from '@/src/types/market';
import { FeedEmptyState } from '@/components/designs/FeedEmptyState';
import { NetworkErrorState } from '@/components/designs/NetworkErrorState';
import { ScreenState } from '@/components/ui/ScreenState';
import { isUsableImageHttpUrl, prefetchResolvedImageAsset, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { useReduceMotion } from '@/src/hooks/useReduceMotion';
import { RUNWAY_PAGE_SCALE_MIN } from '@/src/features/feed/utils/runwayTransitCurves';
import { getAvatarFallback } from '@/src/utils/profileImage';
import { AppText } from '@/components/ui/AppText';
import { BagPulseIcon } from '@/components/ui/BagPulseIcon';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useUnreadNotificationCount } from '@/src/realtime/notifications';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { BAG_IT_LABEL } from '@/src/constants/bagging';
import { perfMark } from '@/src/utils/perf';
import { navPerf } from '@/src/utils/navPerf';
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';
import { fetchMarketFilterChipsQuery } from '@/src/query/bootstrapQueries';
import { RunwayFeedItem } from '@/src/features/feed/components/RunwayFeedItem';
import { RunwayFeedList } from '@/src/features/feed/components/RunwayFeedList';
import type { FeedListEntry, FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';
import { formatMoney } from '@/src/utils/money';

/**
 * Module-level feed cache - stale-while-revalidate.
 * Persists across component remounts within the same app session.
 * Key: tag (null = 'all'), Value: last successful page 1 response.
 */
// Persists across tab switches / component remounts within the same app session.
let feedScrollOffset = 0;
let feedActiveIndex = 0;
let feedMountCount = 0;

/**
 * Has the feed been revalidated against the network yet in THIS app session?
 *
 * Module scope on purpose: it survives screen remounts (tab hops must stay
 * cheap) but resets when the process does, which is exactly the boundary we
 * need. Opening the app is when a user expects a fresh feed, and without this
 * the persisted cache was served whole for its 5-minute TTL — so every restart
 * inside that window replayed the identical order, while a pull-to-refresh
 * reshuffled correctly because it always hits the network. That is the
 * "same content in the same stream" report.
 */
let feedRevalidatedThisSession = false;
const carouselIndexMap = new Map<string, number>();

const devLog = __DEV__ ? (prefix: string, ...args: any[]) => feedDevLog(prefix, { args }) : () => {};

/**
 * Whether the feed pays for scroll instrumentation this session.
 *
 * Read once, at module load, because the FlatList viewability props derived from
 * it must keep a stable identity for the list's whole lifetime — FlatList throws
 * on `onViewableItemsChanged` changing on the fly.
 */
const SCROLL_DIAGNOSTICS_ENABLED = isWiezDebugEnabled('scroll');

/** How many pages from the end the next page request fires. */
const FEED_PREFETCH_LEAD_PAGES = 4;

const toCompactCount = (value: number | null | undefined) => {
  const n = typeof value === 'number' ? value : 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}m`;
};

/** How long chrome stays up after a tap before it bows out on its own. */
const META_OVERLAY_AUTO_HIDE_MS = 6000;

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

  const detailUrl = item.media?.url ?? item.media?.previewUrl ?? '';
  return detailUrl
    ? [
        {
          id: item.id,
          collectionId: item.collectionId,
          mediaIndex: 0,
          url: detailUrl,
          displayUrl: item.media?.url ?? null,
          previewUrl: item.media?.previewUrl ?? null,
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

/**
 * The feed's price line.
 *
 * Returns null rather than a placeholder when there is no price: a design that
 * is not for sale is a normal case on the Runway, and "—" or "Price on request"
 * would be inventing a commercial state the brand never set. Sale price wins
 * when present, and a genuine range renders as a range instead of collapsing to
 * a single number the buyer might not actually be able to pay.
 */
const formatFeedAmount = (amount: number, currency = 'NGN') => {
  return formatMoney(amount, currency);
};

const formatFeedPrice = (item: MarketItem): string | null => {
  const isAmount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

  const min = isAmount(item.saleMinPrice) ? item.saleMinPrice : item.minPrice;
  const max = isAmount(item.saleMaxPrice) ? item.saleMaxPrice : item.maxPrice;

  if (!isAmount(min)) return null;
  if (isAmount(max) && max > min) {
    return `${formatFeedAmount(min)} – ${formatFeedAmount(max)}`;
  }
  return formatFeedAmount(min);
};

/**
 * Fresh every app launch, stable within it.
 *
 * The persisted feed cache exists so the Runway paints instantly instead of
 * showing a skeleton — but it stores the PREVIOUS session's order, so the very
 * first design a user saw on every restart was the same one they were shown
 * last time. Revalidation swaps in a freshly-shuffled server order a moment
 * later, which is why it is "95%, not 100%": what they are reporting is the
 * first paint, and the first paint was always the old head.
 *
 * The cache's job is a fast first frame. Nothing about that requires the same
 * ORDER, so the cached page is re-shuffled once per launch before it is
 * painted. Instant paint is kept, the server still has the last word, and the
 * feed stops opening on the same design.
 */
const FEED_COLD_START_SEED = `${Date.now().toString(36)}${Math.floor(
  Math.random() * 0xffffffff,
).toString(36)}`;

/** FNV-1a of seed+id mapped to (0,1) — mirrors the server's `seededUnit`. */
const coldStartUnit = (id: string): number => {
  const input = `${FEED_COLD_START_SEED}:${id}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) + 0.5) / 4294967296.5;
};

const rotateCachedFeedForColdStart = (feedItems: MarketItem[]): MarketItem[] => {
  if (feedItems.length < 2) return feedItems;
  return [...feedItems]
    .map((item) => ({ item, key: coldStartUnit(item.id) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
};

const sortFeedItemsForDisplay = (feedItems: MarketItem[]) =>
  [...feedItems].sort((a, b) => {
    const aValid = isValidMediaItem(a);
    const bValid = isValidMediaItem(b);
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return 0;
  });

/**
 * Merge a revalidated first page into what is already on screen WITHOUT moving
 * the design the viewer is currently looking at.
 *
 * `GET /collections/market` is a ranked + ROTATED feed: it reseeds a weighted
 * shuffle per request, so two calls seconds apart legitimately return the same
 * designs in a different order. Stale-while-revalidate then painted cache order
 * A and replaced it wholesale with network order B — the design under the
 * viewer's eyes changed identity mid-look. That is the "one content was shown,
 * the system blinked, then another content, different from the first" report;
 * it was never an image-loading bug.
 *
 * Everything up to and including the active page is held exactly as-is; the
 * fresh page supplies everything below it, minus anything already held. Cold
 * loads (no previous items) return `incoming` untouched, and explicit
 * pull-to-refresh deliberately does NOT come through here — asking for new
 * content is exactly when a reshuffle is wanted.
 */
const reconcileFeedItems = (
  previous: MarketItem[],
  incoming: MarketItem[],
  keepThroughIndex: number,
): MarketItem[] => {
  if (previous.length === 0) return incoming;
  const keepCount = Math.min(previous.length, Math.max(1, keepThroughIndex + 1));
  const head = previous.slice(0, keepCount);
  const heldIds = new Set(head.map((item) => item.id));
  return [...head, ...incoming.filter((item) => !heldIds.has(item.id))];
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
          <WiezLogoLoader size={26} />
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

    </View>
  );
});

type FeedMetaOverlayProps = {
  itemId: string;
  mediaId?: string | null;
  handle: string;
  title: string;
  priceLabel: string | null;
  threadCount: number;
  feedPosition?: number;
  bottomClearance: number;
  visible: boolean;
  onBrandPress: () => void;
};

/**
 * The caption band.
 *
 * This was a bordered, blurred card floating over the media. Two problems: the
 * hairline border drew a hard rectangle around the text — the "too compact"
 * look — and a fixed-size card cannot guarantee contrast, because the media
 * behind it is arbitrary.
 *
 * A full-width gradient wash solves both. It has no edge to read as a box, and
 * because it darkens the media itself rather than covering it with a panel, the
 * text stays legible over a white dress and a night shot alike. The band spans
 * the full page width so the gradient has nowhere to terminate visibly; the
 * text keeps its own inset (clear of the action rail) inside it.
 */
const FeedMetaOverlay = React.memo(function FeedMetaOverlay({
  itemId,
  mediaId,
  handle,
  title,
  priceLabel,
  threadCount,
  feedPosition,
  bottomClearance,
  visible,
  onBrandPress,
}: FeedMetaOverlayProps) {
  // The stage matte is themed; the meta's legibility depends on which one is
  // behind it whenever the media is letterboxed rather than full-bleed.
  const { scheme } = useTheme();
  const isLightStage = scheme !== 'dark';

  return (
    <View
      style={[styles.meta, { paddingBottom: bottomClearance + tokens.spacing.sm, opacity: visible ? 1 : 0 }]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <LinearGradient
        pointerEvents="none"
        /*
         * Ramp fast, then hold — and hold harder on a light stage.
         *
         * Two things were wrong. First, the ramp's steep section was in the
         * WRONG PLACE: the band is bottom-anchored with
         * `paddingBottom: bottomClearance + sm` (~110pt of island clearance),
         * so the text actually sits between roughly 25% and 55% down the band
         * while the gradient did not pass 0.46 until 68%. The darkest part of
         * the wash was spent on empty padding below the text.
         *
         * Second, the premise in the screen-level comment above — "chrome that
         * sits on the media stays light-on-dark, because a photograph is dark
         * in either theme" — does not hold for LETTERBOXED media. A portrait
         * that does not fill the page leaves `runwayStage` matte top and
         * bottom, and in the light theme that matte is a pale neutral. The meta
         * then sits on near-white, and at 0.18 scrim white text on white is
         * exactly the reported "you can't see anything".
         *
         * So: reach full strength by the top of the text and stay flat through
         * it (a constant tail has no edge to read as a panel, which is what the
         * full-width wash was chosen to avoid), and take the light theme to
         * 0.86 because it has to survive a white ground. The dark theme keeps a
         * lighter tail since its matte is already near-black.
         */
        colors={
          isLightStage
            ? [tokens.scrim(0), tokens.scrim(0.5), tokens.scrim(0.86), tokens.scrim(0.86)]
            : [tokens.scrim(0), tokens.scrim(0.34), tokens.scrim(0.72), tokens.scrim(0.72)]
        }
        locations={[0, 0.16, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.metaContent} pointerEvents="box-none">
        <AppText
          variant="subtitle"
          tone="inverse"
          numberOfLines={2}
          ellipsizeMode="tail"
          style={styles.metaTextShadow}
        >
          {title}
        </AppText>
        {priceLabel ? (
          <AppText variant="bodyBold" tone="inverse" numberOfLines={1} style={styles.metaTextShadow}>
            {priceLabel}
          </AppText>
        ) : null}
        {handle ? (
          <Pressable
            onPress={onBrandPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Open ${handle} catalog`}
            style={({ pressed }) => pressed && styles.metaHandlePressed}
          >
            <AppText
              variant="captionRegular"
              tone="inverse"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.metaTextShadow, styles.metaHandle]}
            >
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
      </View>
    </View>
  );
});

// Feed Skeleton Component for loading state.
//
// Placeholders resolve the ambient scheme. They used to be pinned `onDarkStage`
// because the stage was black in both themes and the light palette's 90%-white
// shimmer strobed across it on cold start — the "shiny black and white" report.
// Now the stage is themed, so the light sweep lands on a light matte and the
// dark sweep on a dark one; the placeholder recedes into the stage either way.
const FeedSkeleton = ({
  pageHeight,
  topOffset,
  bottomClearance,
}: {
  pageHeight: number;
  topOffset: number;
  bottomClearance: number;
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.feedSkeletonRoot, { backgroundColor: theme.colors.runwayStage }]}>
      <View style={[styles.feedSkeletonHeader, { paddingTop: topOffset + 8 }]}>
        <View style={styles.feedSkeletonLogoWrap}>
          <WiezLogo size={28} style={{ opacity: 0.92 }} />
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

/**
 * The runway follows the ambient theme like every other screen.
 *
 * It used to be a deep-black stage in BOTH themes, which is why the chrome on it
 * is threaded with dark-stage overrides — the island resolved dark tokens for
 * this route, placeholders forced their dark shimmer, and the WIEZ mark tinted
 * itself with `theme.colors.text` and vanished into the black. All of that goes
 * away here: the stage is `theme.colors.runwayStage`, a token with a value per
 * theme, so the same components read correctly in both without opting in.
 *
 * Chrome that sits on the *media* rather than on the stage — the meta card, the
 * action rail, the bottom gradient — stays light-on-dark, because a photograph
 * is dark in either theme.
 */
export function RunwayFeedScreen() {
  const flowKey = 'runway';
  // Phase 1 instrumentation - safe, gated, no behavior change
  React.useEffect(() => {
    navPerf.screenMounted(flowKey);
  }, []);

  React.useLayoutEffect(() => {
    navPerf.shellVisible(flowKey);
  }, []);

  React.useEffect(() => {
    // Approximate first visible UI on initial mount (shell + basic structure)
    // More precise placement (e.g. after first media or list item layout) can be added later.
    navPerf.firstVisibleUi(flowKey);
  }, []);

  const { scheme, theme } = useTheme();
  const { status, user } = useAuth();
  const toast = useToast();
  const { refuseIfBrand } = useShopperOnlyAction();
  const requireAuth = useAuthAction();
  // Single shared notification source — same store the catalog/profile bell and
  // the island "Me" badge read from, so every 🔔 count stays in sync with web.
  const unreadNotificationCount = useUnreadNotificationCount();
  const {
    insets,
    windowWidth,
    windowHeight,
    immersiveOverlayBottomClearance,
  } = useScreenChrome();
  const deferredWorkReady = useDeferredScreenWork();
  
  // Invalidate market feed when app comes to foreground
  // Prevents stale data after backgrounding
  useAppStateListener([['market', 'feed'], ['market', 'sections']], 5 * 60 * 1000);

  const initialFeedCacheRef = useRef<ReturnType<typeof readMemoryCachedMarketFeed> | null | undefined>(undefined);
  if (initialFeedCacheRef.current === undefined) {
    initialFeedCacheRef.current = readMemoryCachedMarketFeed(buildFeedCacheIdentity({
      tag: DEFAULT_MARKET_FILTER_CHIPS[0]?.tag ?? null,
      userId: status === 'authenticated' ? user?.id ?? null : null,
    }));
  }
  const initialFeedSnapshot = initialFeedCacheRef.current?.snapshot ?? null;
  
  const feedListRef = useRef<FlatList<FeedListEntry> | null>(null);
  // Drives the per-page transit scrim (see RunwayFeedItem). Native-driven, so it
  // never touches the JS thread and cannot regress the paging work above.
  const feedScrollY = useRef(new Animated.Value(0)).current;
  const handleFeedScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: feedScrollY } } }], { useNativeDriver: true }),
    [feedScrollY],
  );
  // Scale is OFF while RUNWAY_PAGE_SCALE_MIN === 1 (vertical GPU cost). Always
  // call useReduceMotion — never gate the hook behind `false &&` (short-circuit
  // skips the call and breaks React's rules-of-hooks queue).
  const reduceMotion = useReduceMotion();
  const pageScaleEnabled = !reduceMotion && RUNWAY_PAGE_SCALE_MIN < 1;
  const initializedLoopKeyRef = useRef<string | null>(null);
  const [filterChips, setFilterChips] = useState<MarketFilterChip[]>(DEFAULT_MARKET_FILTER_CHIPS);
  const [selectedFilterId, setSelectedFilterId] = useState(DEFAULT_MARKET_FILTER_CHIPS[0].id);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [measuredFeedViewportHeight, setFeedViewportHeight] = useState(0);
  const [commentsTarget, setCommentsTarget] = useState<{ collectionId: string; title: string } | null>(null);
  /**
   * The Runway page scales down into the band above the comment sheet.
   *
   * Opening comments used to paint an opaque black scrim over the whole screen,
   * so the design you were commenting on simply vanished. The model users
   * expect (Reels, IG) keeps it visible: the sheet takes the bottom, and the
   * page SCALES — uniformly, nothing cropped — until the whole frame fits the
   * remaining strip, then scales back as the sheet goes down.
   *
   * `commentsProgress` is handed to the sheet, which drives it and interpolates
   * its own slide from it. One value, so the two motions cannot drift: the page
   * is exactly as small as the sheet is tall, on every frame, including a drag
   * released half way.
   */
  const commentsProgress = useRef(new Animated.Value(0)).current;
  const [commentsSheetHeight, setCommentsSheetHeight] = useState(0);
  const pendingCollectionIdsRef = useRef(new Set<string>());
  const hydratedCollectionIdsRef = useRef(new Set<string>());
  const feedTeleportingRef = useRef(false);
  const loadingMoreInFlightRef = useRef(false);
  const patchedBrandIdsRef = useRef<Set<string>>(new Set());
  const lastLoggedPageHeightRef = useRef<number | null>(null);
  const hasLoggedInitialPageHeightRef = useRef(false);
  const previousActivePageIndexRef = useRef(0);
  const pageHeightMeasurementRef = useRef<{ geometryKey: string; height: number } | null>(null);
  const appliedPageHeightRef = useRef(0);
  const correctionCountRef = useRef(0);
  const scrollStartedAtRef = useRef(0);
  const latestViewableIndexRef = useRef(0);
  const settledFromIndexRef = useRef(0);
  const settledWorkRef = useRef<{ cancel: () => void } | null>(null);
  const metaOverlayHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleMetaCollectionId, setVisibleMetaCollectionId] = useState<string | null>(null);

  const [items, setItems] = useState<MarketItem[]>(() =>
    initialFeedSnapshot
      ? sortFeedItemsForDisplay(rotateCachedFeedForColdStart(initialFeedSnapshot.items))
      : [],
  );
  /**
   * What is currently painted, readable synchronously from async callbacks.
   * `loadFirstPage` needs it AFTER awaiting the network to decide what to pin
   * (see `reconcileFeedItems`), and by then its captured `items` closure is a
   * render or two stale.
   */
  const itemsRef = useRef<MarketItem[]>(items);
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
  const [nextCursor, setNextCursor] = useState<string | null>(() => initialFeedSnapshot?.nextCursor ?? null);
  const [hasNextPage, setHasNextPage] = useState(() => initialFeedSnapshot?.hasNextPage ?? false);
  const [loading, setLoading] = useState(() => !initialFeedSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(() => Boolean(initialFeedSnapshot));
  const hasLoadedFirstPageRef = useRef(Boolean(initialFeedSnapshot));

  // Staleness guards - prevent refetch on every tab focus
  const lastPatchFetchRef = useRef<number>(0);
  const STALE_THRESHOLD_MS = 60_000; // 60 seconds

  const showBlockingLoader = loading && !hasLoadedFirstPage;

  // Dev-only nav timing for tabs→runway. Shell (skeleton or cached items)
  // renders at mount; data is ready once the initial feed load settles.
  useEffect(() => {
    navPerf.screenMounted('tabs→runway');
    navPerf.shellVisible('tabs→runway');
    navPerf.firstVisibleUi('tabs→runway');
    if (initialFeedSnapshot) {
      navPerf.mark('cache_hit', 'tabs→runway');
      navPerf.mark('stale_ui_rendered', 'tabs→runway');
    } else {
      navPerf.mark('cache_miss', 'tabs→runway');
      navPerf.mark('cold_skeleton_rendered', 'tabs→runway');
    }
  }, []);
  useEffect(() => {
    if (!loading) navPerf.dataReady('tabs→runway');
  }, [loading]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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
        isInteraction: false,
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

  /**
   * Pre-measurement stand-in for the stage height.
   *
   * This is NOT `windowHeight`. The feed renders inside `SafeAreaView edges={[]}`
   * — deliberately full-bleed — so the stage spans the whole screen, insets
   * included, while `useWindowDimensions` reports the height *excluding* the
   * system bars. On the reported device that was 892.19 vs a real 937.14
   * (892.19 + 28.95 top + 16 bottom): every row, `getItemLayout` offset and snap
   * interval was 5% short until `handleFeedViewportLayout` landed, and then all
   * of them changed underneath a live scroll position. That mid-flight resize is
   * the "settles, shakes up and down, settles again" report — and it also made
   * the skeleton a different height from the feed it hands off to.
   *
   * Unrounded, for the same reason `pageHeight` is (see below).
   */
  const fallbackPageHeight = useMemo(
    () => Math.max(1, (windowHeight || 0) + insets.top + insets.bottom),
    [insets.bottom, insets.top, windowHeight],
  );
  const measuredBasePageHeight = measuredFeedViewportHeight > 0 ? measuredFeedViewportHeight : fallbackPageHeight;
  // Deliberately NOT rounded to whole dp. Native paging snaps to multiples of the
  // scroll view's own pixel height, so the row height has to describe that same
  // box exactly. Rounding put row k at round(k * pageHeight * density) while
  // paging targeted k * viewportPx; on fractional-density devices (2.625, 2.75,
  // 3.5) those drift ~0.5px per page until a sliver of the neighbouring page
  // shows at the edge. Sub-dp measurement jitter cannot thrash this: the height
  // is locked on the first measure per window geometry (handleFeedViewportLayout).
  const pageHeight = Math.max(1, measuredBasePageHeight || fallbackPageHeight);
  const feedViewportHeight = pageHeight;
  const feedViewportReady = measuredFeedViewportHeight > 0;
  const viewportGeometryKey = `${Math.round(windowWidth)}x${Math.round(windowHeight)}`;

  const activeFilter = useMemo(
    () => filterChips.find((chip) => chip.id === selectedFilterId) ?? filterChips[0] ?? DEFAULT_MARKET_FILTER_CHIPS[0],
    [filterChips, selectedFilterId],
  );
  const visibleFilterChips = useMemo(() => filterChips, [filterChips]);
  const activeTag = activeFilter?.tag ?? null;
  const feedLoopEnabled = false;
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

  /**
   * Scale so the WHOLE page fits the strip left above the sheet, then lift it
   * so the shrink happens toward the top edge rather than about the centre.
   *
   * A `scale` transform contracts around the view's midpoint, which would leave
   * the page floating in the middle of the strip with dead space above it. The
   * compensating translate is half the height the page just lost, minus the
   * safe-area top so it sits under the status bar rather than behind it.
   *
   * Guarded on a measured sheet height: before the sheet has laid out there is
   * no honest number to scale to, and a guessed one would jump on the next
   * frame.
   */
  const commentsStageStyle = useMemo(() => {
    if (commentsSheetHeight <= 0 || pageHeight <= 0) {
      return null;
    }
    const visibleBand = Math.max(0, pageHeight - commentsSheetHeight);
    const targetScale = Math.max(0.35, Math.min(1, visibleBand / pageHeight));
    const liftedBy = (pageHeight * (1 - targetScale)) / 2;

    return {
      transform: [
        {
          translateY: commentsProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -(liftedBy - insets.top / 2)],
          }),
        },
        {
          scale: commentsProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, targetScale],
          }),
        },
      ],
    };
  }, [commentsProgress, commentsSheetHeight, insets.top, pageHeight]);
  const overlayScrollPadding = bottomClearance;
  // `overlaySurface` (pinned dark glass for the caption card) lived here. The
  // caption is a gradient wash now — see FeedMetaOverlay — so there is no pane
  // to colour. The concern it encoded still holds and is why the wash is a fixed
  // dark ramp rather than a themed one: it sits on the photograph, not the stage.

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

  const handleFeedViewportLayout = useCallback((event: LayoutChangeEvent) => {
    // Unrounded on purpose — see the pageHeight note above.
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight <= 0) return;

    const previous = pageHeightMeasurementRef.current;
    if (!previous) {
      pageHeightMeasurementRef.current = { geometryKey: viewportGeometryKey, height: nextHeight };
      setFeedViewportHeight(nextHeight);
      return;
    }

    if (previous.geometryKey !== viewportGeometryKey) {
      pageHeightMeasurementRef.current = { geometryKey: viewportGeometryKey, height: nextHeight };
      setFeedViewportHeight(nextHeight);
      layoutDevLog('feed-page-height-window-change', {
        previousGeometry: previous.geometryKey,
        nextGeometry: viewportGeometryKey,
        previousHeight: previous.height,
        nextHeight,
      });
      return;
    }

    if (Math.abs(previous.height - nextHeight) > 1) {
      scrollDevLog('page-height-remeasure-ignored', {
        geometry: viewportGeometryKey,
        lockedHeight: previous.height,
        measuredHeight: nextHeight,
        reason: 'same-window-geometry',
      });
    }
  }, [viewportGeometryKey]);

  useEffect(() => {
    if (!feedViewportReady) return;
    const previousHeight = appliedPageHeightRef.current;
    appliedPageHeightRef.current = pageHeight;
    if (previousHeight <= 0 || previousHeight === pageHeight || feedActiveIndex <= 0) return;

    correctionCountRef.current += 1;
    const targetOffset = feedActiveIndex * pageHeight;
    scrollDevLog('vertical-correction', {
      reason: 'window-geometry-change',
      correctionCount: correctionCountRef.current,
      previousHeight,
      pageHeight,
      currentIndex: feedActiveIndex,
      targetOffset,
    });
    requestAnimationFrame(() => {
      feedScrollOffset = targetOffset;
      feedListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
    });
  }, [feedViewportReady, pageHeight]);

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
    if (!deferredWorkReady || status !== 'authenticated' || items.length === 0) {
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
  }, [deferredWorkReady, items, status, user?.id]);

  useEffect(() => {
    if (!deferredWorkReady) return;
    void loadPatchedBrands();
  }, [deferredWorkReady, loadPatchedBrands]);

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

  // Warm the image cache in BOTH scroll directions (next two pages + previous
  // page) so a settled page always reveals already-cached media instead of a
  // shimmer that resolves after the swipe.
  useEffect(() => {
    if (!deferredWorkReady) return;
    const candidateIndices = [activePageIndex + 1, activePageIndex - 1, activePageIndex + 2];
    candidateIndices.forEach((candidateIndex) => {
      const candidateItem = candidateIndex >= 0 ? items[candidateIndex] : null;
      const candidateMedia = candidateItem ? buildFallbackMediaItems(candidateItem)[0] : null;
      if (!candidateMedia) return;
      const directUrl =
        normalizeStableUri(candidateMedia.displayUrl) ??
        normalizeStableUri(candidateMedia.url) ??
        normalizeStableUri(candidateMedia.previewUrl) ??
        normalizeStableUri(candidateMedia.thumbnailUrl);
      if (!directUrl || !isUsableImageHttpUrl(directUrl)) return;
      void prefetchResolvedImageAsset({
        src: directUrl,
        fileId: null,
        allowSignedFallback: false,
        debugContext: {
          designId: candidateMedia.id,
          mediaIndex: 0,
          sourceField: 'feed.next.preview',
        },
      });
    });
  }, [activePageIndex, deferredWorkReady, items]);

  useEffect(() => {
    if (!deferredWorkReady) return undefined;
    let mounted = true;

    void fetchMarketFilterChipsQuery().then((chips) => {
      if (!mounted || !chips.length) return;
      devLog('HomeFeed', 'Filter chips loaded', chips.map(c => ({ id: c.id, label: c.label, tag: c.tag })));
      setFilterChips(chips);
      setSelectedFilterId((current) => {
        if (chips.some((chip) => chip.id === current)) {
          return current;
        }
        return chips[0]?.id ?? DEFAULT_MARKET_FILTER_CHIPS[0].id;
      });
    });

    return () => {
      mounted = false;
    };
  }, [deferredWorkReady]);

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
    const wasColdLoad = !cached && !hasLoadedFirstPageRef.current;
    let didStartBackgroundRefresh = false;
    if (cached) {
      navPerf.mark('cache_hit', 'tabs→runway');
      // Only the session's FIRST hydration is re-shuffled. Later cache reads
      // (tag switches, returning to the tab) must keep the order already on
      // screen, or the feed would reorder under a viewer mid-session.
      const sortedCachedItems = sortFeedItemsForDisplay(
        feedRevalidatedThisSession
          ? cached.snapshot.items
          : rotateCachedFeedForColdStart(cached.snapshot.items),
      );
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
      // Set synchronously too: the revalidation below reads this straight after
      // awaiting the network and must not race the sync effect.
      itemsRef.current = sortedCachedItems;
      setNextCursor(cached.snapshot.nextCursor);
      setHasNextPage(cached.snapshot.hasNextPage);
      hasLoadedFirstPageRef.current = true;
      setHasLoadedFirstPage(true);
      feedLoadDevLog('summary', {
        cacheHit: true,
        blockingSkeleton: false,
        fetchMs: 0,
        itemCount: sortedCachedItems.length,
      });
      if (cached.isFresh && feedRevalidatedThisSession) {
        // Fresh cache AND we have already talked to the server this session —
        // nothing to gain from another round trip.
        //
        // The session check is the important half. Skipping purely on freshness
        // meant a cold start inside the 5-minute TTL replayed the previous
        // session's exact order; the feed is a per-request reshuffle, so a
        // restart must go and get a new one. The cached page is still painted
        // first, so this costs nothing visible.
        setLoading(false);
        return;
      }
      // Stale cache - show content immediately but revalidate silently
      setLoading(false);
      navPerf.mark('stale_ui_rendered', 'tabs→runway');
      navPerf.mark('background_refresh_started', 'tabs→runway');
      didStartBackgroundRefresh = true;
    } else {
      // No cache for THIS identity. Only fall back to the blocking skeleton if
      // the screen is genuinely empty. A cache miss can also mean the identity
      // changed under us (sign-in resolving, then the 401 sign-out), and
      // blanking painted content back to a skeleton for that is the second
      // flash in the cold-start blink report.
      setLoading(!hasLoadedFirstPageRef.current);
      navPerf.mark('cache_miss', 'tabs→runway');
      if (wasColdLoad) navPerf.mark('cold_skeleton_rendered', 'tabs→runway');
      feedLoadDevLog('summary', {
        cacheHit: false,
        blockingSkeleton: wasColdLoad,
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
      const sortedItems = sortFeedItemsForDisplay(res.items);
      devLog('HomeFeed', 'After sort', sortedItems.slice(0, 5).map((item, idx) => ({
        index: idx,
        id: item.id,
        title: item.collectionTitle,
        isModernAdre: item.collectionTitle?.includes('Modern Ad') || false,
      })));
      /**
       * Pin whatever is already on screen; the reshuffled page only supplies
       * what comes below it. See `reconcileFeedItems`.
       *
       * EXCEPT on the session's first revalidation. Pinning exists so the design
       * a viewer is currently looking at cannot change identity mid-look — but
       * on a cold start nobody has looked at anything yet, and pinning the
       * restored cache's head meant the server's fresh order was applied to
       * everything BELOW a first item that never changed. The feed opened on the
       * same design every launch even once the revalidation above was fixed.
       */
      const isFirstRevalidationThisSession = !feedRevalidatedThisSession;
      feedRevalidatedThisSession = true;
      const nextItems =
        isFirstRevalidationThisSession && feedActiveIndex === 0
          ? sortedItems
          : reconcileFeedItems(itemsRef.current, sortedItems, feedActiveIndex);
      setItems(nextItems);
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
      hasLoadedFirstPageRef.current = true;
      setHasLoadedFirstPage(true);
      void writeCachedMarketFeed(cacheIdentity, {
        items: nextItems,
        nextCursor: res.nextCursor ?? null,
        hasNextPage: res.hasNextPage,
      }).catch((cacheError) => {
        feedLoadDevLog('cache-write-failed', {
          reason: cacheError instanceof Error ? cacheError.message : 'unknown',
        });
      });
      feedLoadDevLog('summary', {
        cacheHit: Boolean(cached),
        blockingSkeleton: wasColdLoad,
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
      if (didStartBackgroundRefresh) {
        navPerf.mark('background_refresh_completed', 'tabs→runway');
      }
    }
  }, [activeTag, status, user?.id]);

  const hydrateCollectionMedia = useCallback(async (item: MarketItem | null | undefined) => {
    const collectionId = item?.collectionId?.trim();
    if (!collectionId) return;
    if (!item) return;
    const hasStrictFeedMedia = Boolean(
      (Array.isArray(item.mediaItems) && item.mediaItems.length > 0) || item.primaryMedia,
    );
    if (hasStrictFeedMedia) {
      // The market DTO already contains every angle. Avoid copying identical
      // arrays into parent state, which previously rerendered every visible row.
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
      // Only write thread state when there are NEW keys. A no-op map clone was
      // re-rendering every visible row after each settle hydration — the
      // progressive "shakier after a few scrolls" report.
      setThreadStateByMedia((prev) => {
        let changed = false;
        const next = { ...prev };
        normalizedMediaItems.forEach((media) => {
          if (!next[media.id]) {
            changed = true;
            next[media.id] = {
              threaded: media.id === item?.id ? Boolean(item?.isThreaded) : false,
              count: media.threadsCount,
            };
          }
        });
        return changed ? next : prev;
      });
      hydratedCollectionIdsRef.current.add(collectionId);
    } catch {
      // Keep the feed on its current fallback media if hydration fails.
    } finally {
      pendingCollectionIdsRef.current.delete(collectionId);
    }
  }, []);

  // Viewability is DIAGNOSTICS ONLY here — `latestViewableIndexRef` is read in
  // exactly one place, the `vertical-settle-warning` in handleFeedMomentumEnd.
  // Paging, prefetch and the active row all key off the settle handler, never
  // off viewability.
  //
  // It is therefore attached only when the scroll debug scope is on. A live
  // `onViewableItemsChanged` makes VirtualizedList build a viewability tuple and
  // run `_updateViewableItems` inside `_onScroll` — JS work on EVERY scroll
  // event, in both directions, for a value nothing in the product reads. That is
  // the frame budget the drag start and the pre-settle leg were spending.
  //
  // Read once at module scope so the props keep a stable identity for the whole
  // session; FlatList throws if `onViewableItemsChanged` changes on the fly.
  const viewabilityConfigRef = useRef(
    SCROLL_DIAGNOSTICS_ENABLED
      ? {
          itemVisiblePercentThreshold: 80,
          minimumViewTime: 120,
        }
      : undefined,
  );

  const stableOnViewableItemsChangedRef = useRef(
    SCROLL_DIAGNOSTICS_ENABLED
      ? ({ viewableItems }: { viewableItems: Array<{ item: FeedListEntry | null; index?: number | null }> }) => {
          const primaryEntry = viewableItems.find(({ item }) => item && !item.isGhost)?.item;
          if (primaryEntry && !primaryEntry.isGhost) {
            latestViewableIndexRef.current = primaryEntry.realIndex;
          }
        }
      : undefined,
  );

  const scheduleSettledFeedWork = useCallback((previousIndex: number, nextIndex: number) => {
    settledWorkRef.current?.cancel();
    const activeItem = items[nextIndex] ?? null;
    const adjacentIndex = feedLoopEnabled && items.length > 0
      ? (nextIndex + 1) % items.length
      : nextIndex + 1;
    const adjacentItem = items[adjacentIndex] ?? null;

    settledWorkRef.current = InteractionManager.runAfterInteractions(() => {
      settledWorkRef.current = null;
      if (!activeItem) return;

      const viewedKey = `${activeItem.collectionId}:${nextIndex}`;
      if (!viewedFeedItemKeysRef.current.has(viewedKey)) {
        viewedFeedItemKeysRef.current.add(viewedKey);
        const mediaItems = collectionMediaMapRef.current[activeItem.collectionId] ?? buildFallbackMediaItems(activeItem);
        const media = mediaItems[carouselIndexMap.get(activeItem.collectionId) ?? 0] ?? mediaItems[0] ?? null;
        trackMobileEvent('feed_item_viewed', {
          sourceScreen: 'runway_feed',
          itemId: activeItem.collectionId,
          itemType: activeItem.entityType,
          feedPosition: nextIndex,
          collectionId: activeItem.collectionId,
          mediaId: media?.id ?? null,
          brandId: activeItem.brandId,
          categoryFilter: activeTag,
        });
      }

      if (nextIndex !== previousIndex) {
        trackMobileEvent('feed_item_swiped', {
          sourceScreen: 'runway_feed',
          fromItemId: items[previousIndex]?.collectionId ?? null,
          toItemId: activeItem.collectionId,
          direction: nextIndex > previousIndex ? 'down' : 'up',
          fromPosition: previousIndex,
          toPosition: nextIndex,
          categoryFilter: activeTag,
        });
      }

      // Strict feed DTO rows already contain all media. Legacy rows alone need
      // detail hydration, bounded to the settled row and one forward neighbor.
      void hydrateCollectionMedia(activeItem);
      if (adjacentItem) void hydrateCollectionMedia(adjacentItem);
      scrollDevLog('settled-work-complete', {
        activeIndex: nextIndex,
        hydratedCandidates: adjacentItem ? 2 : 1,
        deferredUntilIdle: true,
      });
    });
  }, [activeTag, feedLoopEnabled, hydrateCollectionMedia, items]);

  useEffect(() => {
    if (!items.length) return;
    const previousIndex = settledFromIndexRef.current;
    settledFromIndexRef.current = activePageIndex;
    scheduleSettledFeedWork(previousIndex, activePageIndex);
    return () => settledWorkRef.current?.cancel();
  }, [activePageIndex, items.length, scheduleSettledFeedWork]);

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
    drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId: normalizedBrandId } } as any);
  }, [activePageIndex]);

  const handleOpenSearch = useCallback(() => {
    perfMark('runway-search-tap');
    // drillDownPush is single-flight: rapid re-taps while the route is slow
    // must not stack N search screens (same for notifications below).
    drillDownPush('/search' as any);
  }, []);

  const handleOpenNotifications = useCallback(() => {
    navPerf.tap('runway→notifications');
    if (status === 'authenticated') {
      drillDownPush('/notifications' as any);
      return;
    }
    drillDownPush({
      pathname: '/(auth)/login',
      params: { next: '/notifications' },
    } as any);
  }, [status]);

  const handleSaveLook = useCallback((item: MarketItem) => {
    // Brand accounts sell; they do not save looks.
    if (refuseIfBrand('saving looks')) return;
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
    // Bail when already hidden so every drag does not re-render every row
    // (rowRenderVersion includes isMetaVisible).
    setVisibleMetaCollectionId((current) => (current == null ? current : null));
  }, []);

  /**
   * Tap toggles. It does not "show, then dissolve on a timer".
   *
   * A tap used to call this unconditionally, which set the overlay visible and
   * armed a 4-second self-dismiss. So tapping again while it was up just reset
   * that timer — the overlay stayed, then vanished on its own a moment later,
   * and the user's second tap appeared to do nothing. What they were seeing
   * dismiss it was the timeout, not their finger.
   *
   * Toggling makes the control honest: tap on, tap off, and the same tap
   * target either way. The timer survives only as a courtesy for the show
   * direction — chrome should not sit on a photograph forever if the viewer
   * walks away — and is cancelled the moment a tap dismisses it, so the two
   * can never race.
   *
   * This is a Pressable's `onPress`, so scroll and horizontal swipe are
   * unaffected: a gesture that moves is a scroll and never becomes a press.
   */
  const toggleMetaOverlay = useCallback((collectionId: string) => {
    if (metaOverlayHideTimerRef.current) {
      clearTimeout(metaOverlayHideTimerRef.current);
      metaOverlayHideTimerRef.current = null;
    }

    setVisibleMetaCollectionId((current) => {
      if (current === collectionId) return null;

      metaOverlayHideTimerRef.current = setTimeout(() => {
        setVisibleMetaCollectionId((latest) => (latest === collectionId ? null : latest));
        metaOverlayHideTimerRef.current = null;
      }, META_OVERLAY_AUTO_HIDE_MS);

      return collectionId;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (metaOverlayHideTimerRef.current) {
        clearTimeout(metaOverlayHideTimerRef.current);
      }
    };
  }, []);

  const renderFeedItem = useCallback(
    ({ item: entry, index }: { item: FeedListEntry; index: number }) => {
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
      const isActiveFeedItem = activePageIndex === entry.realIndex;
      const isPatchedBrand = Boolean(item.brandId && patchedBrandIds.has(item.brandId));
      const isPatchBusy = Boolean(item.brandId && patchingBrandIds[item.brandId]);
      const isMetaVisible = visibleMetaCollectionId === item.collectionId;
      const rowRenderVersion = [
        item.updatedAt ?? item.id,
        activeMediaIndex,
        currentMediaId,
        isActiveFeedItem,
        isThreaded,
        isThreading,
        threadCountRaw,
        isSavedLook,
        isSavingLook,
        isPatchedBrand,
        isPatchBusy,
        isMetaVisible,
        likes,
        comments,
        canPatchBrands,
        status,
        user?.id ?? null,
        scheme,
        bottomClearance,
      ].join('|');

      return (
        <RunwayFeedItem
          collectionId={item.collectionId}
          pageHeight={pageHeight}
          pageIndex={index}
          scrollY={feedScrollY}
          // The stage colour, not `theme.colors.bg`. A receding page dissolves
          // toward whatever the matte behind it is, so this has to track the
          // stage exactly; scrimming toward `bg` would make mid-swipe a brighter
          // frame than either page in the light theme — the "my eyes were
          // starting to bother me" report. `runwayStage` is a settled neutral
          // in light rather than paper white for the same reason.
          scrimColor={theme.colors.runwayStage}
          pageScaleEnabled={pageScaleEnabled}
          mediaItems={mediaItems}
          activeMediaIndex={activeMediaIndex}
          isActive={isActiveFeedItem}
          renderVersion={rowRenderVersion}
          onCarouselIndexChange={handleCarouselIndexChange}
          onContentPress={toggleMetaOverlay}
          badgeOverlay={
            <NewDropBadge
              itemId={item.collectionId}
              createdAt={item.createdAt ?? item.media?.createdAt}
              sourceScreen="runway_feed"
              feedPosition={entry.realIndex}
              isActive={isActiveFeedItem}
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
              isPatched={isPatchedBrand}
              patchBusy={isPatchBusy}
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
              priceLabel={formatFeedPrice(item)}
              threadCount={threadCountRaw}
              feedPosition={entry.realIndex}
              bottomClearance={bottomClearance}
              visible={isMetaVisible}
              onBrandPress={() => handleOpenBrand(item.brandId)}
            />
          }
        />
      );
    },
    [
      activePageIndex,
      bottomClearance,
      canPatchBrands,
      collectionMediaMap,
      fallbackMediaByCollection,
      feedScrollY,
      handleCarouselIndexChange,
      handleOpenBrand,
      handlePatchBrand,
      handleSaveLook,
      handleThreadPress,
      openCommentsSheet,
      pageHeight,
      pageScaleEnabled,
      patchedBrandIds,
      patchingBrandIds,
      savedLookByCollectionId,
      savingLookByCollectionId,
      scheme,
      toggleMetaOverlay,
      status,
      threadStateByMedia,
      threadingMediaById,
      user?.id,
      visibleMetaCollectionId,
    ],
  );

  const handleFeedScrollBeginDrag = useCallback(() => {
    scrollStartedAtRef.current = Date.now();
    hideMetaOverlay();
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
      const settleDurationMs = scrollStartedAtRef.current > 0
        ? Date.now() - scrollStartedAtRef.current
        : null;
      const latestViewableIndex = latestViewableIndexRef.current;
      feedScrollOffset = e.nativeEvent.contentOffset.y;

      scrollDevLog('vertical-momentum', {
        measuredIndex: measuredRealIndex,
        targetIndex: measuredRealIndex,
        previousIndex,
        flingDistance: jumpDistance,
        corrected: false,
        correctionReason: null,
        correctionCount: correctionCountRef.current,
        pageHeight,
        snapInterval: pageHeight,
        rowHeight: pageHeight,
        contentOffsetY: e.nativeEvent.contentOffset.y,
        settleDurationMs,
        latestViewableIndex,
      });

      if (jumpDistance > 1 || latestViewableIndex !== measuredRealIndex || (settleDurationMs ?? 0) > 1200) {
        scrollDevLog('vertical-settle-warning', {
          previousIndex,
          targetIndex: measuredRealIndex,
          flingDistance: jumpDistance,
          latestViewableIndex,
          settleDurationMs,
          reason: jumpDistance > 1
            ? 'multi-page-fling'
            : latestViewableIndex !== measuredRealIndex
              ? 'viewability-late'
              : 'settle-late',
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

      settledFromIndexRef.current = previousIndex;
      feedActiveIndex = measuredRealIndex;
      setActivePageIndex(measuredRealIndex);
      // Four pages of runway, not two. `loadMore` resolves into `setItems`,
      // which rebuilds `fallbackMediaByCollection`, `feedItems` and therefore
      // every mounted row. At a two-page lead that landed while the next swipe
      // was already in flight — a full list re-render mid-gesture, felt as the
      // stall just before the page settles. Four pages puts the mutation inside
      // a dwell instead. Also defer one frame past the settle setState so the
      // active-row paint commits before pagination mutates the list.
      if (measuredRealIndex >= items.length - FEED_PREFETCH_LEAD_PAGES && hasNextPage) {
        requestAnimationFrame(() => {
          void loadMore();
        });
      }
    },
    [activePageIndex, feedItems, feedLoopEnabled, feedLoopHeadOffset, hasNextPage, items.length, pageHeight],
  );

  // Android drops onMomentumScrollEnd when the finger releases exactly on a
  // page boundary (zero velocity → no momentum phase). A stale activePageIndex
  // then froze detail upgrades, prefetch, and settled work until the next full
  // fling. Drag end with ~zero vertical velocity is the missing settle signal;
  // the index math is idempotent with the momentum handler.
  const handleFeedScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityY = e.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(velocityY) > 0.05) return;
      handleFeedMomentumEnd(e);
    },
    [handleFeedMomentumEnd],
  );

  const getFeedItemLayout = useCallback(
    (_: ArrayLike<FeedListEntry> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const handleScrollToIndexFailed = useCallback(({ index }: { index: number }) => {
    correctionCountRef.current += 1;
    scrollDevLog('vertical-correction', {
      reason: 'initial-index-recovery',
      correctionCount: correctionCountRef.current,
      currentIndex: feedActiveIndex,
      targetIndex: index,
      pageHeight,
    });
    requestAnimationFrame(() => {
      feedScrollOffset = index * pageHeight;
      feedListRef.current?.scrollToOffset({
        offset: index * pageHeight,
        animated: false,
      });
    });
  }, [pageHeight]);

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
      const sortedItems = sortFeedItemsForDisplay(res.items);
      // An explicit pull IS a revalidation, so the next mount need not force one.
      feedRevalidatedThisSession = true;
      setItems(sortedItems);
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
      hasLoadedFirstPageRef.current = true;
      setHasLoadedFirstPage(true);
      void writeCachedMarketFeed(buildFeedCacheIdentity({
        tag: activeTag,
        userId: status === 'authenticated' ? user?.id ?? null : null,
      }), {
        items: sortedItems,
        nextCursor: res.nextCursor ?? null,
        hasNextPage: res.hasNextPage,
      }).catch((cacheError) => {
        feedLoadDevLog('cache-write-failed', {
          reason: cacheError instanceof Error ? cacheError.message : 'unknown',
        });
      });
    } catch (err) {
      if (!hasLoadedFirstPageRef.current) {
        const message = toErrorMessage(err);
        setError(message);
        setIsNetworkError(isLikelyNetworkError(message));
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTag, items.length, status, user?.id]);

  useEffect(() => {
    // `loadFirstPage` is keyed on the auth identity (it rides in the feed cache
    // key). Auth boots as 'loading', so running here would fetch an anonymous
    // feed, then refetch the moment the stored session resolves — a guaranteed
    // extra cold load on every launch. Wait for auth to settle; the memory
    // snapshot already gives us something to paint in the meantime.
    if (status === 'loading' && !hasLoadedFirstPageRef.current) return;
    loadFirstPage();
  }, [loadFirstPage, status]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // A realtime content event (e.g. a design approval/publish) flagged the
      // feed as stale while we were away. Silently revalidate so the newly
      // surfaced content shows on return without a manual pull-to-refresh.
      if (consumeMarketFeedDirty()) {
        void onRefresh();
      }
      // Only refetch if data is stale (> 60s old) - prevents redundant calls on every tab visit
      if (now - lastPatchFetchRef.current > STALE_THRESHOLD_MS) {
        void loadPatchedBrands();
      }
      // Clear any stale comments target on tab focus
      setCommentsTarget(null);
      // Native interval snapping owns the resting position. Observe drift on
      // refocus, but never teleport the visible list back into place.
      if (feedScrollOffset > 0 && pageHeight > 0) {
        const safeIndex = Math.max(0, Math.min(feedActiveIndex, feedItems.length - 1));
        const expectedOffset = safeIndex * pageHeight;
        const drift = Math.abs(feedScrollOffset - expectedOffset);
        if (drift > pageHeight * 0.1) {
          scrollDevLog('vertical-restore-drift', {
            currentIndex: safeIndex,
            expectedOffset,
            observedOffset: feedScrollOffset,
            drift,
            correctionCount: correctionCountRef.current,
            correctionSkipped: true,
            reason: 'native-snap-owns-restoration',
          });
        }
      }
    }, [feedItems.length, loadPatchedBrands, onRefresh, pageHeight]),
  );

  return (
    <SafeAreaView
      edges={[]}
      // `runwayStage`, not `bg`: the matte behind letterboxed media is a
      // deliberate surface per theme, and it must be the same colour everywhere
      // the stage shows through — root, skeleton, inter-page scrim — or the feed
      // flashes a different shade the moment it has nothing to paint (empty,
      // error, or pre-first-page).
      style={[styles.root, { backgroundColor: theme.colors.runwayStage }]}
    >
      {/* Status bar icons contrast with the stage, which now follows the theme. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* The header is NOT gated on `loading`. It used to be, so every
          revalidation cycle blanked the filter row and painted it back — one of
          the flashes in the cold-start blink report. The chips are stage chrome:
          they belong on screen from first frame to last. */}
      {!showBlockingLoader ? (
        <>
          {/* Chips sit on the runway stage, which is black where media is
              letterboxed but is the photo itself where media edge-fills. This
              scrim guarantees the row reads over both. */}
          <LinearGradient
            colors={[theme.colors.runwayStage, `${theme.colors.runwayStage}00`]}
            style={[styles.headerScrim, { height: insets.top + 72 }]}
            pointerEvents="none"
          />
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
                  onPress={() => { topLevelNavigate('/'); }}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.headerLogoButton,
                    pressed && { backgroundColor: theme.colors.surfaceOverlay, opacity: 0.82 },
                  ]}
                    accessibilityRole="button"
                    accessibilityLabel="Go to home">
                    <WiezLogo size={30} style={styles.brandLogo} />
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
                        style={styles.headerFilterChip}
                      />
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.headerRightGroup}>
                  <Pressable
                    onPress={handleOpenNotifications}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.headerIconButton,
                      pressed && { backgroundColor: theme.colors.surfaceOverlay, opacity: 0.8 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Notifications"
                  >
                    <AppText variant="bodyBold" style={styles.headerEmoji}>🔔</AppText>
                    {unreadNotificationCount > 0 ? (
                      <View style={styles.headerBadge} pointerEvents="none">
                        <AppText variant="badgeLabel" tone="primary" style={styles.headerBadgeText}>
                          {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                        </AppText>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={handleOpenSearch}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.headerIconButton,
                      pressed && { backgroundColor: theme.colors.surfaceOverlay, opacity: 0.8 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search"
                  >
                    <AppText variant="bodyBold" style={styles.headerEmoji}>🔍</AppText>
                  </Pressable>
                </View>
            </View>
          </View>
        </>
      ) : null}

      {(showBlockingLoader || isSkeletonFadingOut) ? (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 100, opacity: skeletonOpacity }]} pointerEvents={showBlockingLoader ? 'auto' : 'none'}>
          <FeedSkeleton pageHeight={pageHeight || fallbackPageHeight} topOffset={insets.top} bottomClearance={bottomClearance} />
        </Animated.View>
      ) : null}

      {/* Non-content states sit directly on the stage, which is a themed surface
          now, so they resolve ambient tokens like every other screen's do. */}
      {error && isNetworkError && !showBlockingLoader ? (
        <View style={styles.loadingWrap}>
          <NetworkErrorState onRetry={loadFirstPage} />
        </View>
      ) : error && !showBlockingLoader ? (
        <View style={styles.loadingWrap}>
          <ScreenState
            kind="server"
            title="Unable to load the runway"
            message={error}
            onAction={loadFirstPage}
          />
        </View>
      ) : items.length === 0 && !showBlockingLoader ? (
        <ScrollView
          contentInset={Platform.OS === 'ios' ? { bottom: overlayScrollPadding } : undefined}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: overlayScrollPadding }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>
          <FeedEmptyState onStartExploring={() => setSelectedFilterId(visibleFilterChips[0]?.id ?? DEFAULT_MARKET_FILTER_CHIPS[0].id)} />
        </ScrollView>
      ) : (
        <Animated.View
          style={[
            styles.feedListContainer,
            { backgroundColor: theme.colors.runwayStage },
            commentsStageStyle,
          ]}
          onLayout={handleFeedViewportLayout}
        >
          {!feedViewportReady ? (
            <FeedSkeleton pageHeight={fallbackPageHeight} topOffset={insets.top} bottomClearance={bottomClearance} />
          ) : (
          /* Two initial rows so the next page is already painted when the first
             swipe starts (IG-style). A five-row window keeps previous/next fully
             rendered; clipping stays off because detached full-screen Android
             image rows can flash blank when reattached. */
          <RunwayFeedList
            ref={feedListRef}
            key={feedListKey}
            data={feedItems}
            keyExtractor={(entry) => entry.listKey}
            /* Native paging — NOT snapToInterval + disableIntervalMomentum.
               That combination is what made every swipe track the finger
               smoothly and then speed up and slam into the next page:
                 · Android (ReactScrollView.flingAndSnap) — disableIntervalMomentum
                   throws away the velocity projection and uses the raw offset at
                   finger-lift, then the snap branch runs
                   `velocityY += (largerOffset - targetOffset) * 10`. That boost is
                   sized for small carousel items; here the term is up to a FULL
                   PAGE of remaining travel, so it injects ~10x the page remainder
                   as synthetic velocity into an OverScroller fling clamped to
                   min=max=target. The last leg rockets, then stops dead.
                 · iOS (RCTEnhancedScrollView) — the same flag retargets from the
                   raw lift offset and ceil()s on any positive velocity, so a 5%
                   flick commits to a whole page that UIScrollView then has to
                   cover under decelerationRate="fast".
               pagingEnabled routes iOS to UIScrollView's own paging curve and
               Android to smoothScrollAndSnap (one-page clamp, no boost), so the
               drag and the settle are one continuous motion.
               snapToAlignment must stay off as well: any explicit value keeps
               Android on the boosted branch even with no interval set. And
               decelerationRate stays default — "fast" shortens Android's fling
               projection, which biases smoothScrollAndSnap into snapping BACK on
               gentle flicks ("the swipe didn't take"). */
            pagingEnabled
            getItemLayout={getFeedItemLayout}
            directionalLockEnabled
            nestedScrollEnabled={false}
            /* Pull-to-refresh needs overscroll to exist, and these two flags
               removed it everywhere. The RefreshControl below was mounted and
               correctly gated to the first page, but `bounces={false}` /
               `overScrollMode="never"` meant the pull that arms it could never
               happen — the control was unreachable, not broken.

               They are still right for every OTHER page, where an overscroll at
               a page boundary reads as a failed swipe. So overscroll is enabled
               exactly where refresh lives (the first design) and nowhere else,
               which leaves the paging feel documented above untouched. */
            bounces={activePageIndex === 0}
            overScrollMode={activePageIndex === 0 ? 'auto' : 'never'}
            removeClippedSubviews={false}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            updateCellsBatchingPeriod={16}
            windowSize={5}
            initialScrollIndex={feedActiveIndex > 0 ? Math.min(feedActiveIndex, feedItems.length - 1) : undefined}
            scrollEnabled={!commentsTarget}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={handleFeedScrollBeginDrag}
            /* Native-driven offset for the per-page transit scrim. This is the
               ONLY onScroll on the list and it carries no JS listener, so the
               per-frame work stays entirely on the native thread. */
            onScroll={handleFeedScroll}
            scrollEventThrottle={16}
            style={styles.feedList}
            viewabilityConfig={viewabilityConfigRef.current}
            onViewableItemsChanged={stableOnViewableItemsChangedRef.current}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            onMomentumScrollEnd={handleFeedMomentumEnd}
            onScrollEndDrag={handleFeedScrollEndDrag}
            /* Pull-to-refresh only at the first page. On Android a live
               RefreshControl on a paging FlatList steals the start of many
               downward drags ("it drags, then scrolls"), which is the exact
               asymmetry vs the horizontal angle carousel that has no PTR. */
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                enabled={activePageIndex === 0}
              />
            }
            renderItem={renderFeedItem}
          />
          )}
        </Animated.View>
      )}

      <CollectionCommentsSheet
        progress={commentsProgress}
        onSheetHeight={setCommentsSheetHeight}
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
    flexShrink: 0,
  },
  headerCenterGroup: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
  },
  headerChipsScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  headerChipsContent: {
    flexGrow: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
    gap: 2,
  },
  headerLogoButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerFilterChip: {
    // Symmetric now that the stage chip is a pill, not an underlined tab — the
    // old 1/3 top/bottom split existed to optically centre the label above a
    // 2px underline that no longer renders here.
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  headerEmoji: {
    fontSize: 16,
    lineHeight: 18,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  // No-bg count: the number renders in the system/brand color, bold, matching
  // the catalog/profile bell + island convention (single source of truth).
  headerBadge: {
    position: 'absolute',
    top: -tokens.spacing.xs,
    right: -tokens.spacing.xs,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    gap: 8,
  },
  feedSkeletonLogoWrap: {
    width: 64,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // No fill: a themed `surfaceAlt` plate here was a bright white slab on the
    // black stage in light mode. The mark carries itself.
    backgroundColor: 'transparent',
  },
  feedSkeletonChips: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 15,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  headerScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 19,
  },
  feedListContainer: {
    flex: 1,
    overflow: 'hidden',
    // `backgroundColor` is applied inline from `theme.colors.runwayStage`: any
    // not-yet-painted gap between pages has to read as the stage matte, and the
    // stage is themed, so it cannot be baked into the stylesheet.
  },
  feedList: {
    backgroundColor: 'transparent',
  },
  /**
   * Action rail inset.
   *
   * The visible gap was never `right` — it was the 88pt item boxes. Each rail
   * control is a 44pt circle centred in an 88pt column, so 22pt of empty
   * column sat between every glyph and the screen edge on top of the 12pt
   * inset: the glyphs floated ~34pt in from the edge while the caption widths
   * they were sized for needed nothing like that. The column is now sized to
   * the control it holds plus room for a short count, and the rail sits closer
   * to the edge, which is what pushes the content out.
   */
  rail: {
    position: 'absolute',
    right: 8,
    alignItems: 'center',
    gap: 12,
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
  profileMenuAvatarText: {},
  profileMenuChevron: {},
  profileMenuTitle: {},
  profileMenuSubtitle: {
    marginTop: 2,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  profileMenuItemLast: {
    borderBottomWidth: 0,
  },
  profileMenuEmoji: {
    width: 24,
    textAlign: 'center',
  },
  profileMenuTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  profileMenuItemTitle: {},
  profileMenuItemSubtitle: {
    marginTop: 2,
  },
  railItem: {
    width: 56,
    alignItems: 'center',
    gap: 4,
  },
  railBagButton: {
    borderRadius: tokens.radius.md,
    overflow: 'visible',
  },
  railCountLabel: {
    width: 56,
    textAlign: 'center',
    textShadowColor: tokens.scrim(0.55),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  meta: {
    // Full-bleed so the gradient has no visible left/right termination. The
    // text inset that used to live here moved to `metaContent`.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 64,
    justifyContent: 'flex-end',
  },
  metaContent: {
    paddingLeft: 16,
    // Clear of the action rail: rail inset (8) + column width (56), rounded up
    // to the grid. Narrowing the rail hands this text 24pt it did not have.
    paddingRight: 72,
    gap: 3,
  },
  // Belt and braces with the gradient: on a blown-out highlight the wash alone
  // can still leave white-on-white, and a shadow costs nothing on text this size.
  metaTextShadow: {
    textShadowColor: tokens.scrim(0.55),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaHandle: {
    opacity: 0.86,
  },
  metaHandlePressed: {
    opacity: 0.72,
  },
  brandLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.95,
  },
});
