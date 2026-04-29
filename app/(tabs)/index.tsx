import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeProvider';
import { GLASS, LAYOUT, tokens, type AppTheme } from '@/src/styles/tokens';
import { useToast } from '@/src/toast/ToastContext';
import { useAuthAction } from '@/src/hooks/useAuthAction';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton';
import { ThreadlyLogo } from '@/components/ui/ThreadlyLogo';
import ThreadlyLogoLoader from '@/components/ui/ThreadlyLogoLoader';
import ThreadRailAction from '@/components/catalog/ThreadRailAction';
import CollectionCommentsSheet from '@/components/catalog/CollectionCommentsSheet';
import { brandApi, type CollectionDetailMediaDto } from '@/src/api/BrandApi';
import { ProfileApi } from '@/src/api/ProfileApi';
import { getMarketFeed, getMarketFilterChips, type MarketFilterChip, toggleCollectionMediaThread } from '@/src/api/MarketApi';
import type { MarketItem } from '@/src/types/market';
import { FeedEmptyState } from '@/components/designs/FeedEmptyState';
import { NetworkErrorState } from '@/components/designs/NetworkErrorState';
import { prefetchResolvedImageAsset, resolveImageUri, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { getAvatarFallback } from '@/src/utils/profileImage';
import { AppText } from '@/components/ui/AppText';

/**
 * Module-level feed cache — stale-while-revalidate.
 * Persists across component remounts within the same app session.
 * Key: tag (null = 'all'), Value: last successful page 1 response.
 */
type FeedCacheEntry = {
  items: MarketItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
  cachedAt: number;
};
const feedPageCache = new Map<string | null, FeedCacheEntry>();
const FEED_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

const toCompactCount = (value: number | null | undefined) => {
  const n = typeof value === 'number' ? value : 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}m`;
};

type FeedViewerMedia = {
  id: string;
  url: string;
  fileId: string | null;
  type: 'image' | 'video';
  label: string;
  threadsCount: number;
};

type FeedCarouselMedia = FeedViewerMedia & {
  virtualKey: string;
};

type FeedListEntry = {
  item: MarketItem;
  listKey: string;
  realIndex: number;
  isGhost: boolean;
};

const toFeedMediaType = (rawType?: string | null): 'image' | 'video' => {
  const normalized = String(rawType ?? '').toLowerCase();
  return normalized.includes('video') ? 'video' : 'image';
};

const resolvePreferredRemoteUrl = async (directUrl?: string | null, fileId?: string | null) => {
  return resolveImageUri({ src: directUrl, fileId });
};

const buildFallbackMediaItems = (item: MarketItem): FeedViewerMedia[] => {
  const directUrl = item.media?.url ?? item.media?.previewUrl ?? '';
  return directUrl
    ? [
        {
          id: item.id,
          url: directUrl,
          fileId: item.media?.fileId ?? null,
          type: toFeedMediaType(item.media?.type ?? null),
          label: item.collectionTitle,
          threadsCount: typeof item.threadsCount === 'number' ? item.threadsCount : 0,
        },
      ]
    : [];
};

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

function ImageWarmPlaceholder() {
  const { theme } = useTheme();
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 0.72,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.35,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.surfaceAlt }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            opacity: shimmer,
            backgroundColor: theme.colors.surface,
          },
        ]}
      />
    </View>
  );
}

function FeedMediaSlide({ media, imageIndex }: { media: FeedViewerMedia | null; imageIndex: number }) {
  const { theme } = useTheme();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { uri: resolvedUri, loading } = useResolvedImageAsset({
    src: media?.url,
    fileId: media?.fileId,
    enabled: Boolean(media),
  });

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [resolvedUri]);

  if (!media) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.feedEmptySlide, { backgroundColor: theme.colors.surfaceAlt }]}>
        <AppText variant="display">🖼️</AppText>
        <AppText variant="subtitle" tone="inverse">No views yet</AppText>
        <AppText variant="body" tone="secondary" style={styles.feedSlideBody}>
          This design does not have any media to browse.
        </AppText>
      </View>
    );
  }

  if (media.type === 'video') {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.feedVideoSlide, { backgroundColor: theme.colors.surfaceAlt }]}>
        <AppText variant="display">🎬</AppText>
        <AppText variant="subtitle" tone="inverse">Video view</AppText>
        <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.feedSlideBody}>
          {media.label || 'Swipe to another view'}
        </AppText>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          styles.feedMediaLoadingSlide,
          { backgroundColor: theme.colors.surfaceAlt },
        ]}
      >
        {imageIndex === 0 ? <ImageWarmPlaceholder /> : null}
      </View>
    );
  }

  if (!resolvedUri || imageFailed) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.feedBrokenSlide, { backgroundColor: theme.colors.surfaceAlt }]}>
        <AppText variant="display">🖼️</AppText>
        <AppText variant="subtitle">Image unavailable</AppText>
        <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.feedSlideBody}>
          {media.label || 'Swipe to another view'}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.surfaceAlt }]}>
      {!imageLoaded ? <ImageWarmPlaceholder /> : null}
      <Image
        source={{ uri: resolvedUri }}
        style={[styles.pageImage, { opacity: imageLoaded ? 1 : 0 }]}
        resizeMode="cover"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageFailed(true)}
      />
    </View>
  );
}

function FeedMediaCarousel({
  mediaItems,
  activeIndex,
  onActiveIndexChange,
}: {
  mediaItems: FeedViewerMedia[];
  activeIndex: number;
  onActiveIndexChange: (nextIndex: number) => void;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const hasMultipleItems = mediaItems.length > 1;
  const safeActiveIndex = mediaItems.length > 0 ? Math.min(activeIndex, mediaItems.length - 1) : 0;
  const stableMediaItems = useMemo(
    () =>
      mediaItems.map((item) => ({
        ...item,
        url: normalizeStableUri(item.url) ?? item.url,
        fileId: normalizeStableUri(item.fileId),
      })),
    [mediaItems],
  );
  const carouselItems = useMemo<FeedCarouselMedia[]>(() => {
    if (!hasMultipleItems) {
      return stableMediaItems.map((item, index) => ({
        ...item,
        virtualKey: `real-${item.id}-${index}`,
      }));
    }

    const last = stableMediaItems[stableMediaItems.length - 1];
    const first = stableMediaItems[0];

    return [
      { ...last, virtualKey: `loop-last-${last.id}` },
      ...stableMediaItems.map((item, index) => ({
        ...item,
        virtualKey: `real-${item.id}-${index}`,
      })),
      { ...first, virtualKey: `loop-first-${first.id}` },
    ];
  }, [hasMultipleItems, stableMediaItems]);
  const internalIndex = hasMultipleItems ? safeActiveIndex + 1 : safeActiveIndex;

  useEffect(() => {
    if (!carouselRef.current || !carouselItems.length) {
      return;
    }

    carouselRef.current.scrollTo({
      x: internalIndex * width,
      y: 0,
      animated: false,
    });
  }, [carouselItems.length, internalIndex, width]);

  if (!mediaItems.length) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <FeedMediaSlide media={null} imageIndex={0} />
      </View>
    );
  }

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.max(
      0,
      Math.min(
        carouselItems.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / width),
      ),
    );

    if (!hasMultipleItems) {
      onActiveIndexChange(rawIndex);
      return;
    }

    if (rawIndex === 0) {
      const loopIndex = stableMediaItems.length - 1;
      onActiveIndexChange(loopIndex);
      requestAnimationFrame(() => {
        carouselRef.current?.scrollTo({
          x: stableMediaItems.length * width,
          y: 0,
          animated: false,
        });
      });
      return;
    }

    if (rawIndex === carouselItems.length - 1) {
      onActiveIndexChange(0);
      requestAnimationFrame(() => {
        carouselRef.current?.scrollTo({
          x: width,
          y: 0,
          animated: false,
        });
      });
      return;
    }

    onActiveIndexChange(rawIndex - 1);
  };

  const toRealImageIndex = (index: number) => {
    if (!hasMultipleItems) {
      return index;
    }
    if (index === 0) {
      return stableMediaItems.length - 1;
    }
    if (index === carouselItems.length - 1) {
      return 0;
    }
    return index - 1;
  };

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <ScrollView
        ref={carouselRef}
        key={`${stableMediaItems.length}-${width}`}
        horizontal
        pagingEnabled
        disableScrollViewPanResponder
        directionalLockEnabled
        nestedScrollEnabled={false}
        bounces={false}
        decelerationRate="fast"
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEnabled={hasMultipleItems}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {carouselItems.map((item, index) => (
          <View key={item.virtualKey} style={{ width }}>
            <FeedMediaSlide media={item} imageIndex={toRealImageIndex(index)} />
          </View>
        ))}
      </ScrollView>

      {hasMultipleItems ? (
        <View style={styles.feedDotRow} pointerEvents="none">
          {stableMediaItems.map((_, index) => (
            <View
              key={`${stableMediaItems[index]?.id ?? index}-${index}`}
              style={[
                styles.feedDot,
                { backgroundColor: theme.colors.textMuted },
                index === safeActiveIndex && [styles.feedDotActive, { backgroundColor: theme.colors.textInverse }],
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FeedBrandAvatar({
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
  });
  const initials = getAvatarFallback(brandName, brandName);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ownerAvatarWrap, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${brandName ?? 'brand'} profile`}
    >
      <View style={[styles.ownerAvatarCircle, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primarySoft }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.ownerAvatarImage} resizeMode="cover" />
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
}

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

export default function HomeScreen() {
  const { scheme, theme } = useTheme();
  const { status, user } = useAuth();
  const toast = useToast();
  const requireAuth = useAuthAction();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const feedListRef = useRef<FlatList<FeedListEntry> | null>(null);
  const [filterChips, setFilterChips] = useState<MarketFilterChip[]>([{ id: 'all', label: 'All', tag: null }]);
  const [selectedFilterId, setSelectedFilterId] = useState('all');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [commentsTarget, setCommentsTarget] = useState<{ collectionId: string; title: string } | null>(null);
  const pendingCollectionIdsRef = useRef(new Set<string>());
  const prefetchedImageUrisRef = useRef(new Set<string>());
  const feedTeleportingRef = useRef(false);

  const [items, setItems] = useState<MarketItem[]>([]);
  const [collectionMediaMap, setCollectionMediaMap] = useState<Record<string, FeedViewerMedia[]>>({});
  const collectionMediaMapRef = useRef<Record<string, FeedViewerMedia[]>>({});
  const [activeMediaIndexByCollection, setActiveMediaIndexByCollection] = useState<Record<string, number>>({});
  const [threadStateByMedia, setThreadStateByMedia] = useState<Record<string, { threaded: boolean; count: number }>>({});
  const [threadingMediaById, setThreadingMediaById] = useState<Record<string, boolean>>({});
  const threadStateByMediaRef = useRef<Record<string, { threaded: boolean; count: number }>>({});
  const threadingMediaByIdRef = useRef<Record<string, boolean>>({});
  const queuedThreadIntentByMediaRef = useRef<Record<string, boolean>>({});
  const [patchedBrandIds, setPatchedBrandIds] = useState<Set<string>>(new Set());
  const [patchingBrandIds, setPatchingBrandIds] = useState<Record<string, boolean>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  // Staleness guards — prevent refetch on every tab focus
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

  const pageHeight = useMemo(() => Math.max(1, Math.round(windowHeight)), [windowHeight]);

  const activeFilter = useMemo(
    () => filterChips.find((chip) => chip.id === selectedFilterId) ?? filterChips[0] ?? { id: 'all', label: 'All', tag: null },
    [filterChips, selectedFilterId],
  );
  const visibleFilterChips = useMemo(() => filterChips.filter((chip) => chip.id !== 'all'), [filterChips]);
  const activeTag = activeFilter?.tag ?? null;
  const feedLoopEnabled = !hasNextPage && items.length > 1;
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
    () => `market-feed-${pageHeight}-${feedLoopEnabled ? 'loop' : 'linear'}-${activeTag ?? 'all'}`,
    [activeTag, feedLoopEnabled, pageHeight],
  );

  /**
   * Circular buffer: [ghost(last)] [item0...itemN] [ghost(first)]
   *
   * When user scrolls to ghost(first) at index N+2, we silently teleport to
  * item0 at index 1 — same content, zero visual difference.
   * When user scrolls to ghost(last) at index 0, we teleport to itemN at
  * index N+1 — same content, zero visual difference.
   *
   * The teleport uses scrollToOffset({ animated: false }) SYNCHRONOUSLY inside
  * the same onMomentumScrollEnd handler — no RAF gap, no frame flash.
   */
  const canPatchBrands = user?.type !== 'BRAND';

  const feedItems = useMemo<FeedListEntry[]>(() => {
    const realEntries = items.map((item, realIndex) => ({
      item,
      realIndex,
      listKey: `real-${item.id}-${realIndex}`,
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
        listKey: `ghost-head-${lastEntry.item.id}-${lastEntry.realIndex}`,
        isGhost: true,
      },
      ...realEntries,
      {
        ...firstEntry,
        listKey: `ghost-tail-${firstEntry.item.id}-${firstEntry.realIndex}`,
        isGhost: true,
      },
    ];
  }, [feedLoopEnabled, items]);
  const feedLoopHeadOffset = feedLoopEnabled ? 1 : 0;
  const bottomClearance = useMemo(() => LAYOUT.TAB_BAR_HEIGHT + insets.bottom + 18, [insets.bottom]);
  const overlayScrollPadding = bottomClearance;
  const glass = scheme === 'dark' ? GLASS.dark : GLASS.light;
  const headerControlSurface = glass.bg;

  useEffect(() => {
    if (!feedLoopEnabled || pageHeight <= 1 || feedItems.length < 3) {
      return;
    }

    requestAnimationFrame(() => {
      feedListRef.current?.scrollToOffset({
        offset: feedLoopHeadOffset * pageHeight,
        animated: false,
      });
    });
  }, [feedItems.length, feedLoopEnabled, feedLoopHeadOffset, pageHeight, activeTag]);

  useEffect(() => {
    collectionMediaMapRef.current = collectionMediaMap;
  }, [collectionMediaMap]);

  useEffect(() => {
    threadStateByMediaRef.current = threadStateByMedia;
  }, [threadStateByMedia]);

  useEffect(() => {
    threadingMediaByIdRef.current = threadingMediaById;
  }, [threadingMediaById]);

  useEffect(() => {
    void loadPatchedBrands();
  }, [loadPatchedBrands]);

  useEffect(() => {
    let mounted = true;

    void getMarketFilterChips().then((chips) => {
      if (!mounted || !chips.length) return;
      setFilterChips(chips);
      const firstVisibleChipId = chips.find((chip) => chip.id !== 'all')?.id ?? chips[0].id;
      setSelectedFilterId((current) => {
        if (current !== 'all' && chips.some((chip) => chip.id === current && chip.id !== 'all')) {
          return current;
        }
        return firstVisibleChipId;
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setActivePageIndex(0);
    setCommentsTarget(null);
    setCollectionMediaMap({});
    collectionMediaMapRef.current = {};
    setActiveMediaIndexByCollection({});
    setThreadStateByMedia({});
    setThreadingMediaById({});
    threadStateByMediaRef.current = {};
    threadingMediaByIdRef.current = {};
    queuedThreadIntentByMediaRef.current = {};
    pendingCollectionIdsRef.current.clear();
  }, [activeTag]);

  const toErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
  const isLikelyNetworkError = (msg: string) => /network|timeout|failed to fetch|connection/i.test(msg);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    setIsNetworkError(false);
    setActivePageIndex(0);
    setCommentsTarget(null);

    // Stale-while-revalidate: serve cached data immediately, skip the loading spinner
    const cached = feedPageCache.get(activeTag);
    const isCacheFresh = cached && Date.now() - cached.cachedAt < FEED_CACHE_TTL_MS;
    if (cached) {
      setItems(cached.items);
      setNextCursor(cached.nextCursor);
      setHasNextPage(cached.hasNextPage);
      if (isCacheFresh) {
        // Cache is fresh — no need to revalidate
        setLoading(false);
        return;
      }
      // Stale cache — show content immediately but revalidate silently
      setLoading(false);
    } else {
      // No cache — show skeleton on first load
      setLoading(true);
    }

    try {
      const res = await getMarketFeed({ cursor: null, tag: activeTag, counts: 'combined' });
      feedPageCache.set(activeTag, {
        items: res.items,
        nextCursor: res.nextCursor ?? null,
        hasNextPage: res.hasNextPage,
        cachedAt: Date.now(),
      });
      setItems(res.items);
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
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
  }, [activeTag]);

  const prefetchMediaItems = useCallback((mediaItems: FeedViewerMedia[], options?: { includeFirstImage?: boolean }) => {
    const includeFirstImage = options?.includeFirstImage ?? false;
    mediaItems.forEach((media, index) => {
      if (media.type !== 'image') return;
      if (index === 0 && !includeFirstImage) return;

      const uri = normalizeStableUri(media.url);
      const cacheKey = normalizeStableUri(media.fileId) ?? uri;
      if (!cacheKey || prefetchedImageUrisRef.current.has(cacheKey)) return;

      prefetchedImageUrisRef.current.add(cacheKey);
      void prefetchResolvedImageAsset({ src: uri, fileId: media.fileId }).then((prefetched) => {
        if (!prefetched) {
          prefetchedImageUrisRef.current.delete(cacheKey);
        }
      }).catch(() => {
        prefetchedImageUrisRef.current.delete(cacheKey);
      });
    });
  }, []);

  const hydrateCollectionMedia = useCallback(async (
    item: MarketItem | null | undefined,
    options?: { includeFirstImageInPrefetch?: boolean },
  ) => {
    const collectionId = item?.collectionId?.trim();
    if (!collectionId) return;
    if (collectionMediaMapRef.current[collectionId]?.length) {
      prefetchMediaItems(collectionMediaMapRef.current[collectionId], {
        includeFirstImage: options?.includeFirstImageInPrefetch,
      });
      return;
    }
    if (pendingCollectionIdsRef.current.has(collectionId)) return;

    pendingCollectionIdsRef.current.add(collectionId);
    try {
      const detail = await brandApi.getCollectionDetail(collectionId, { scope: 'design' });
      if (!detail) return;

      const medias = Array.isArray(detail.medias) ? detail.medias : [];
      const nextMediaItems = await Promise.all(
        medias.map(async (media: CollectionDetailMediaDto, index) => {
          const directUrl = media.file?.s3Url ?? media.file?.url ?? null;
          const url = (await resolvePreferredRemoteUrl(directUrl, media.file?.id ?? null)) ?? '';
          return {
            id: media.id || media.file?.id || `${collectionId}-${index}`,
            url,
            fileId: media.file?.id ?? null,
            type: toFeedMediaType(media.mediaType ?? null),
            label: media.caption ?? detail.title ?? item?.collectionTitle ?? 'Design view',
            threadsCount:
              typeof media.threadsCount === 'number'
                ? media.threadsCount
                : media.id === item?.id && typeof item?.threadsCount === 'number'
                  ? item.threadsCount
                  : 0,
          } satisfies FeedViewerMedia;
        }),
      );

      const normalizedMediaItems = nextMediaItems
        .filter((media) => Boolean(media.id))
        .map((media) => ({
          ...media,
          url: normalizeStableUri(media.url) ?? media.url,
          fileId: normalizeStableUri(media.fileId),
        }));
      if (!normalizedMediaItems.length) return;

      prefetchMediaItems(normalizedMediaItems, {
        includeFirstImage: options?.includeFirstImageInPrefetch,
      });

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
    } catch {
      // Keep the feed on its current fallback media if hydration fails.
    } finally {
      pendingCollectionIdsRef.current.delete(collectionId);
    }
  }, [prefetchMediaItems]);

  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 120,
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: FeedListEntry | null }> }) => {
      viewableItems.forEach(({ item: entry }) => {
        const collectionId = entry?.item.collectionId?.trim();
        if (!collectionId) return;

        const realIndex = entry?.realIndex ?? items.findIndex((candidate) => candidate.collectionId === collectionId);
        if (realIndex < 0) return;

        for (let offset = -1; offset <= 2; offset += 1) {
          const nextIndex = feedLoopEnabled ? (realIndex + offset + items.length) % items.length : realIndex + offset;
          if (nextIndex < 0 || nextIndex >= items.length) continue;
          void hydrateCollectionMedia(items[nextIndex], { includeFirstImageInPrefetch: true });
        }
      });
    },
  );

  useEffect(() => {
    onViewableItemsChanged.current = ({ viewableItems }: { viewableItems: Array<{ item: FeedListEntry | null }> }) => {
      viewableItems.forEach(({ item: entry }) => {
        const collectionId = entry?.item.collectionId?.trim();
        if (!collectionId) return;

        const realIndex = entry?.realIndex ?? items.findIndex((candidate) => candidate.collectionId === collectionId);
        if (realIndex < 0) return;

        for (let offset = -1; offset <= 2; offset += 1) {
          const nextIndex = feedLoopEnabled ? (realIndex + offset + items.length) % items.length : realIndex + offset;
          if (nextIndex < 0 || nextIndex >= items.length) continue;
          void hydrateCollectionMedia(items[nextIndex], { includeFirstImageInPrefetch: true });
        }
      });
    };
  }, [feedLoopEnabled, hydrateCollectionMedia, items]);

  useEffect(() => {
    if (!items.length) return;

    for (let offset = -1; offset <= 2; offset += 1) {
      const nextIndex = feedLoopEnabled
        ? (activePageIndex + offset + items.length) % items.length
        : activePageIndex + offset;
      if (nextIndex < 0 || nextIndex >= items.length) continue;

      const item = items[nextIndex];
      const fallbackMediaItems = fallbackMediaByCollection[item.collectionId] ?? [];
      prefetchMediaItems(collectionMediaMapRef.current[item.collectionId] ?? fallbackMediaItems, {
        includeFirstImage: true,
      });
      void hydrateCollectionMedia(item, { includeFirstImageInPrefetch: true });
    }
  }, [activePageIndex, fallbackMediaByCollection, feedLoopEnabled, hydrateCollectionMedia, items, prefetchMediaItems]);

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

      threadStateByMediaRef.current = {
        ...threadStateByMediaRef.current,
        [mediaId]: optimisticState,
      };

      setThreadStateByMedia((prev) => ({
        ...prev,
        [mediaId]: optimisticState,
      }));

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

      if (threadingMediaByIdRef.current[normalizedMediaId]) {
        queuedThreadIntentByMediaRef.current[normalizedMediaId] = nextThreaded;
        return;
      }

      void executeThreadIntent(normalizedMediaId, normalizedCollectionId || null, nextThreaded, currentState);
    },
    [executeThreadIntent, status],
  );

  const handlePatchBrand = useCallback(
    (brandId?: string | null, brandName?: string | null) => {
      const normalizedBrandId = typeof brandId === 'string' ? brandId.trim() : '';
      if (!normalizedBrandId) return;

      requireAuth(
        async () => {
          const isPatched = patchedBrandIds.has(normalizedBrandId);
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
    [patchedBrandIds, requireAuth, toast],
  );

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !nextCursor || loading || refreshing) return;

    try {
      const res = await getMarketFeed({ cursor: nextCursor, tag: activeTag, counts: 'combined' });
      setItems((prev) => {
        const seenCollectionIds = new Set(prev.map((item) => item.collectionId));
        const nextItems = res.items.filter((item) => !seenCollectionIds.has(item.collectionId));
        return [...prev, ...nextItems];
      });
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
    } catch {
      // Best-effort pagination; keep current items.
    }
  }, [activeTag, hasNextPage, loading, nextCursor, refreshing]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setIsNetworkError(false);
    setActivePageIndex(0);
    setCommentsTarget(null);

    try {
      const res = await getMarketFeed({ cursor: null, tag: activeTag, counts: 'combined' });
      feedPageCache.set(activeTag, {
        items: res.items,
        nextCursor: res.nextCursor ?? null,
        hasNextPage: res.hasNextPage,
        cachedAt: Date.now(),
      });
      setItems(res.items);
      setNextCursor(res.nextCursor ?? null);
      setHasNextPage(res.hasNextPage);
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      setIsNetworkError(isLikelyNetworkError(message));
    } finally {
      setRefreshing(false);
    }
  }, [activeTag]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Only refetch if data is stale (> 60s old) — prevents redundant calls on every tab visit
      if (now - lastPatchFetchRef.current > STALE_THRESHOLD_MS) {
        void loadPatchedBrands();
      }
    }, [loadPatchedBrands]),
  );

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent backgroundColor="transparent" />

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
                  style={({ pressed }) => [
                    styles.headerLogoButton,
                    { backgroundColor: headerControlSurface, borderColor: 'transparent', borderWidth: 0 },
                    pressed && { opacity: 0.82 },
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
                  onPress={() => { router.push('/search' as any); }}
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    { backgroundColor: headerControlSurface, borderColor: 'transparent', borderWidth: 0 },
                    pressed && { opacity: 0.8 },
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
          <FeedSkeleton theme={theme} pageHeight={pageHeight} topOffset={insets.top} bottomClearance={bottomClearance} />
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
          contentContainerStyle={{ flexGrow: 1, paddingBottom: Platform.OS === 'android' ? overlayScrollPadding : 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>
          <FeedEmptyState onStartExploring={() => setSelectedFilterId(visibleFilterChips[0]?.id ?? 'all')} />
        </ScrollView>
      ) : (
        <View style={styles.reelWrap}>
          <FlatList
            ref={feedListRef}
            key={feedListKey}
            data={feedItems}
            keyExtractor={(entry) => entry.listKey}
            initialScrollIndex={feedLoopHeadOffset}
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
            decelerationRate="fast"
            directionalLockEnabled
            nestedScrollEnabled={false}
            scrollEventThrottle={16}
            bounces={false}
            overScrollMode="never"
            removeClippedSubviews={false}
            initialNumToRender={3}
            maxToRenderPerBatch={4}
            windowSize={5}
            scrollEnabled={!commentsTarget}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: 'transparent' }}
            viewabilityConfig={viewabilityConfigRef.current}
            onViewableItemsChanged={onViewableItemsChanged.current}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                feedListRef.current?.scrollToOffset({
                  offset: index * pageHeight,
                  animated: false,
                });
              });
            }}
            onMomentumScrollEnd={(e) => {
              const rawIndex = Math.max(
                0,
                Math.min(feedItems.length - 1, Math.round(e.nativeEvent.contentOffset.y / pageHeight)),
              );

              if (feedTeleportingRef.current) {
                feedTeleportingRef.current = false;
                return;
              }

              if (feedLoopEnabled) {
                // Landed on tail ghost (last item in list) — teleport to real first
                if (rawIndex === feedItems.length - 1) {
                  // Real first item is at index 1 (after head ghost)
                  const targetOffset = feedLoopHeadOffset * pageHeight;
                  feedTeleportingRef.current = true;
                  feedListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
                  setActivePageIndex(0);
                  requestAnimationFrame(() => {
                    feedTeleportingRef.current = false;
                  });
                  return;
                }

                // Landed on head ghost (index 0) — teleport to real last
                if (rawIndex === 0) {
                  const realLastIndex = items.length; // items.length because head ghost shifts by 1
                  const targetOffset = realLastIndex * pageHeight;
                  feedTeleportingRef.current = true;
                  feedListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
                  setActivePageIndex(items.length - 1);
                  requestAnimationFrame(() => {
                    feedTeleportingRef.current = false;
                  });
                  return;
                }

                // Normal item — rawIndex 1..N maps to real item 0..N-1
                const realIndex = feedItems[rawIndex]?.realIndex ?? 0;
                setActivePageIndex(Math.min(realIndex, items.length - 1));
                return;
              }

              // Loop disabled (paginating or single item)
              setActivePageIndex(feedItems[rawIndex]?.realIndex ?? rawIndex);
              if (rawIndex >= items.length - 1 && hasNextPage) {
                void loadMore();
              }
            }}
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (hasNextPage) {
                void loadMore();
              }
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            renderItem={({ item: entry }) => {
              const item = entry.item;
              const brandName = item.brandName ?? item.username ?? 'Brand';
              const handle = item.username ? `@${item.username}` : '';
              const fallbackMediaItems = fallbackMediaByCollection[item.collectionId] ?? [];
              const mediaItems = collectionMediaMap[item.collectionId]?.length
                ? collectionMediaMap[item.collectionId]
                : fallbackMediaItems;
              const activeMediaIndex = mediaItems.length
                ? Math.min(activeMediaIndexByCollection[item.collectionId] ?? 0, mediaItems.length - 1)
                : 0;
              const currentMedia = mediaItems[activeMediaIndex] ?? fallbackMediaItems[0] ?? null;
              const currentMediaId = currentMedia?.id ?? item.id;
              const currentMediaThreadState = currentMedia ? threadStateByMedia[currentMedia.id] : undefined;
              const isThreaded = currentMedia
                ? currentMediaThreadState?.threaded ?? (currentMedia.id === item.id ? Boolean(item.isThreaded) : false)
                : Boolean(item.isThreaded);
              const isThreading = Boolean(threadingMediaById[currentMediaId]);
              const likes = toCompactCount(item.likesCount ?? 0);
              const comments = toCompactCount(item.combinedCommentsCount ?? item.commentsCount ?? 0);
              const threadCountRaw =
                currentMediaThreadState?.count ??
                currentMedia?.threadsCount ??
                item.threadsCount ??
                0;
              const threads = toCompactCount(threadCountRaw);
              const isCommentsOpen = commentsTarget?.collectionId === item.collectionId;

              return (
                <View style={[styles.page, { height: pageHeight }]}> 
                  <FeedMediaCarousel
                    mediaItems={mediaItems}
                    activeIndex={activeMediaIndex}
                    onActiveIndexChange={(nextIndex) => {
                      setActiveMediaIndexByCollection((prev) => {
                        if (prev[item.collectionId] === nextIndex) return prev;
                        return {
                          ...prev,
                          [item.collectionId]: nextIndex,
                        };
                      });
                    }}
                  />

                  {/* Right action rail */}
                  <View style={[styles.rail, { bottom: bottomClearance + 24 }]}>
                    <FeedBrandAvatar
                      brandId={item.brandId}
                      brandName={brandName}
                      brandLogo={item.brandLogo}
                      brandLogoFileId={item.brandLogoFileId}
                      canPatch={canPatchBrands}
                      isPatched={Boolean(item.brandId && patchedBrandIds.has(item.brandId))}
                      patchBusy={Boolean(item.brandId && patchingBrandIds[item.brandId])}
                      onPatchPress={() => {
                        handlePatchBrand(item.brandId, brandName);
                      }}
                      onPress={() => {
                        if (!item.brandId) return;
                        router.push({ pathname: '/catalog/[brandId]', params: { brandId: item.brandId } } as any);
                      }}
                    />

                    <ThreadRailAction
                      threaded={isThreaded}
                      count={threads}
                      busy={isThreading}
                      onPress={() => {
                        void handleThreadPress(currentMediaId, item.collectionId, isThreaded, threadCountRaw);
                      }}
                    />

                    <View style={styles.railItem}>
                      <IconButton
                        size={40}
                        onPress={() => {
                          if (isCommentsOpen) {
                            closeCommentsSheet();
                            return;
                          }
                          openCommentsSheet(item);
                        }}
                      >
                        <AppText variant="subtitle">💬</AppText>
                      </IconButton>
                      <AppText variant="captionBold" tone="inverse">{comments}</AppText>
                    </View>

                    <View style={styles.railItem}>
                      <IconButton size={40}>
                        <AppText variant="subtitle">{item.isLiked ? '❤️' : '🤍'}</AppText>
                      </IconButton>
                      <AppText variant="captionBold" tone="inverse">{likes}</AppText>
                    </View>

                  </View>

                  {/* Compact metadata overlay */}
                  <View
                    style={[
                      styles.meta,
                      {
                        bottom: bottomClearance,
                      },
                    ]}
                  >
                    <BlurView
                      tint={scheme === 'dark' ? 'dark' : 'light'}
                      intensity={20}
                      style={[
                        styles.metaCard,
                        {
                          backgroundColor: glass.bg,
                          borderColor: glass.border,
                        },
                      ]}
                    >
                      <View style={styles.brandLine}>
                        <View style={styles.brandTextWrap}>
                          <View style={styles.brandNameRow}>
                            <AppText variant="bodyBold" tone="inverse">{brandName}</AppText>
                          </View>
                          {handle ? <AppText variant="captionRegular" tone="secondary">{handle}</AppText> : null}
                        </View>

                      </View>

                      <AppText variant="subtitle" tone="inverse" numberOfLines={2}>
                        {item.collectionTitle}
                      </AppText>
                      {item.collectionDescription ? (
                        <AppText variant="body" tone="secondary" numberOfLines={2}>
                          {item.collectionDescription}
                        </AppText>
                      ) : null}

                      <View style={styles.audioRow}>
                        <AppText variant="captionBold">🎵</AppText>
                        <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                          Original Audio
                        </AppText>
                      </View>
                    </BlurView>
                  </View>
                </View>
              );
            }}
          />
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
    flexGrow: 0,
  },
  headerChipsContent: {
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    gap: 6,
  },
  headerLogoButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  brandLogo: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
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
  reelWrap: {
    flex: 1,
  },
  page: {
    width: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  pageImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  feedMediaLoadingSlide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedBrokenSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  feedSlideBody: {
    marginTop: 6,
    textAlign: 'center',
  },
  feedVideoSlide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  feedEmptySlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  feedDotRow: {
    position: 'absolute',
    bottom: 114,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 6,
  },
  feedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  feedDotActive: {
    width: 18,
  },
  rail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 18,
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
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    position: 'absolute',
    left: 16,
    right: 80,
  },
  metaCard: {
    padding: 12,
    borderRadius: tokens.radius.lg,
    gap: 8,
    borderWidth: 1,
    overflow: 'hidden',
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
