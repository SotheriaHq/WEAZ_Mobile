import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, Animated, Easing } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { CatalogCardSurface } from '@/components/catalog/CatalogCardSurface';
import { FeedEmptyState } from '@/components/designs/FeedEmptyState';
import { NetworkErrorState } from '@/components/designs/NetworkErrorState';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { StableImage } from '@/components/ui/StableImage';
import { AppText } from '@/components/ui/AppText';
import { Skeleton, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton';
import { getMarketFeed, getMarketFilterChips, type MarketFilterChip } from '@/src/api/MarketApi';
import { LAYOUT, tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { MarketItem } from '@/src/types/market';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';

const toCompactCount = (value?: number | null) => {
  const n = typeof value === 'number' ? value : 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}m`;
};

const toErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Unable to load market right now.');
const isLikelyNetworkError = (msg: string) => /network|timeout|failed to fetch|connection/i.test(msg);

const formatNaira = (value: number) => {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₦${value}`;
  }
};

const resolvePriceBand = (item: MarketItem) => {
  const min = typeof item.saleMinPrice === 'number' ? item.saleMinPrice : item.minPrice;
  const max = typeof item.saleMaxPrice === 'number' ? item.saleMaxPrice : item.maxPrice;
  if (typeof min === 'number' && typeof max === 'number') {
    return `${formatNaira(min)} - ${formatNaira(max)}`;
  }
  if (typeof min === 'number') {
    return `From ${formatNaira(min)}`;
  }
  if (typeof max === 'number') {
    return `Up to ${formatNaira(max)}`;
  }
  return 'Price on request';
};

function BrandAvatar({
  item,
  backgroundColor,
  textColor,
}: {
  item: MarketItem;
  backgroundColor: string;
  textColor: string;
}) {
  const brandName = item.brandName ?? item.username ?? 'Brand';
  const avatar = resolveProfileImageSource({
    brandLogo: item.brandLogo,
    brandLogoId: item.brandLogoFileId ?? undefined,
  });
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: Boolean(item.brandId) });
  const initials = getAvatarFallback(brandName, item.username);

  return (
    <View style={[styles.avatarWrap, { backgroundColor }]}>
      {avatarUri ? (
        <StableImage uri={avatarUri} containerStyle={styles.avatarImage} imageStyle={styles.avatarImage} />
      ) : (
        <AppText variant="caption" tone="primary" style={[styles.avatarFallback, { color: textColor }]}>
          {initials}
        </AppText>
      )}
    </View>
  );
}

function MarketSkeleton() {
  const { theme } = useTheme();

  return (
    <View style={styles.marketSkeletonRoot}>
      <View style={styles.marketSkeletonHeader}>
        <Skeleton width={96} height={28} borderRadius={8} />
        <View style={styles.marketSkeletonHeaderActions}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <Skeleton width={36} height={36} borderRadius={18} />
        </View>
      </View>
      <View style={styles.marketSkeletonHero}>
        <Skeleton width={120} height={24} borderRadius={6} />
        <SkeletonText lines={2} lineHeight={14} spacing={8} lastLineWidth="65%" />
      </View>
      <View style={styles.marketSkeletonChips}>
        <Skeleton width={64} height={36} borderRadius={999} />
        <Skeleton width={92} height={36} borderRadius={999} />
        <Skeleton width={84} height={36} borderRadius={999} />
      </View>
      {[0, 1].map((idx) => (
        <View key={idx} style={[styles.marketSkeletonCard, { backgroundColor: theme.colors.surface }]}>
          <Skeleton width="100%" height={210} borderRadius={18} />
          <View style={styles.marketSkeletonCardBody}>
            <View style={styles.marketSkeletonBrandRow}>
              <SkeletonAvatar size={40} />
              <View style={styles.marketSkeletonBrandText}>
                <Skeleton width="70%" height={16} borderRadius={4} />
                <Skeleton width="45%" height={12} borderRadius={4} />
              </View>
            </View>
            <Skeleton width="82%" height={20} borderRadius={4} />
            <SkeletonText lines={2} lineHeight={14} spacing={8} lastLineWidth="60%" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DiscoverScreen() {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [filterChips, setFilterChips] = useState<MarketFilterChip[]>([
    { id: 'all', label: 'All', tag: null },
  ]);
  const [selectedChipId, setSelectedChipId] = useState('all');

  const skeletonOpacity = useRef(new Animated.Value(1)).current;
  const [isSkeletonFadingOut, setIsSkeletonFadingOut] = useState(false);

  useEffect(() => {
    if (!loading) {
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
  }, [loading, skeletonOpacity]);

  const activeTag = useMemo(
    () => filterChips.find((chip) => chip.id === selectedChipId)?.tag ?? null,
    [filterChips, selectedChipId],
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNetworkError(false);

    try {
      const res = await getMarketFeed({ cursor: null, tag: activeTag, counts: 'combined' });
      setItems(res.items ?? []);
      setHasNextPage(Boolean(res.hasNextPage));
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      setNetworkError(isLikelyNetworkError(message));
    } finally {
      setLoading(false);
    }
  }, [activeTag]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !nextCursor || loadingMore || loading) {
      return;
    }

    setLoadingMore(true);
    try {
      const res = await getMarketFeed({ cursor: nextCursor, tag: activeTag, counts: 'combined' });
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const nextItems = (res.items ?? []).filter((item) => !seen.has(item.id));
        return [...prev, ...nextItems];
      });
      setHasNextPage(Boolean(res.hasNextPage));
      setNextCursor(res.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [activeTag, hasNextPage, loading, loadingMore, nextCursor]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }, [loadFirstPage]);

  useEffect(() => {
    let mounted = true;

    void getMarketFilterChips().then((chips) => {
      if (!mounted || chips.length === 0) return;
      setFilterChips(chips);
      setSelectedChipId((current) => (chips.some((chip) => chip.id === current) ? current : chips[0].id));
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const openBrandStore = useCallback((item: MarketItem) => {
    if (!item.brandId) return;
    router.push({
      pathname: '/catalog/[brandId]',
      params: { brandId: item.brandId },
    } as any);
  }, []);

  const openDesignDetail = useCallback((item: MarketItem) => {
    if (!item.collectionId) return;
    router.push({
      pathname: '/catalog/view/[collectionId]',
      params: {
        collectionId: item.collectionId,
        scope: 'design',
      },
    } as any);
  }, []);

  const isDark = scheme === 'dark';
  const cardBg = isDark ? theme.colors.surfaceAlt : theme.colors.surface;
  const cardBorder = theme.colors.border;
  const pillBg = isDark ? theme.colors.surfaceAlt : theme.colors.surfaceAlt;
  const overlayScrollPadding = useMemo(() => LAYOUT.TAB_BAR_HEIGHT + insets.bottom, [insets.bottom]);

  const renderItem = useCallback(
    ({ item }: { item: MarketItem }) => {
      const brandName = item.brandName ?? item.username ?? 'Brand';
      const handle = item.username ? `@${item.username}` : null;
      const comments = toCompactCount(item.combinedCommentsCount ?? item.commentsCount ?? 0);
      const threads = toCompactCount(item.threadsCount ?? 0);
      const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];

      return (
        <CatalogCardSurface
          onPress={() => openDesignDetail(item)}
          mediaSrc={item.media?.url ?? item.media?.previewUrl}
          mediaFileId={item.media?.fileId}
          mediaAspectRatio={item.media?.aspectRatio ?? null}
          style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
          bodyStyle={styles.cardBody}
          fallback={
            <View style={styles.mediaFallback}>
              <AppText variant="subtitle">🖼️</AppText>
              <AppText variant="caption" tone="muted">
                Preview unavailable
              </AppText>
            </View>
          }
          topOverlay={
            <View style={[styles.priceBadge, { backgroundColor: theme.colors.surfaceOverlay }]}>
              <AppText variant="caption">{resolvePriceBand(item)}</AppText>
            </View>
          }
        >
          <Pressable style={styles.brandRow} onPress={() => openBrandStore(item)}>
            <BrandAvatar item={item} backgroundColor={pillBg} textColor={theme.colors.primary} />
            <View style={styles.brandTextWrap}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {brandName}
              </AppText>
              {handle ? (
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {handle}
                </AppText>
              ) : null}
            </View>
          </Pressable>

          <AppText variant="bodyBold" numberOfLines={2}>
            {item.collectionTitle || 'Untitled design'}
          </AppText>
          {item.collectionDescription ? (
            <AppText variant="body" tone="muted" numberOfLines={2}>
              {item.collectionDescription}
            </AppText>
          ) : null}

          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={`${item.id}-${tag}`} style={[styles.tagChip, { backgroundColor: pillBg }]}>
                  <AppText variant="caption" tone="muted">
                    {tag}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <AppText variant="caption" tone="muted">🧵 {threads}</AppText>
            <AppText variant="caption" tone="muted">💬 {comments}</AppText>
          </View>

          <View style={styles.actionsRow}>
            <Button title="Shop brand" onPress={() => openBrandStore(item)} size="md" style={styles.actionButton} />
            <Button title="View design" onPress={() => openDesignDetail(item)} size="md" variant="secondary" style={styles.actionButton} />
          </View>
        </CatalogCardSurface>
      );
    },
    [cardBg, cardBorder, openBrandStore, openDesignDetail, pillBg, theme.colors.primary, theme.colors.surfaceOverlay],
  );

  const keyExtractor = useCallback((item: MarketItem) => item.id, []);

  const ListHeader = (
    <View>
      <View style={styles.heroBlock}>
        <AppText variant="title">Market</AppText>
        <AppText variant="body" tone="muted">
          Fresh design drops from active brands. Shop any look in a tap.
        </AppText>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {filterChips.map((chip) => (
          <Chip
            key={chip.id}
            label={chip.label}
                      variant="nav"
            selected={chip.id === selectedChipId}
            onPress={() => setSelectedChipId(chip.id)}
          />
        ))}
      </ScrollView>

      {!loading && error && networkError ? <NetworkErrorState onRetry={loadFirstPage} /> : null}
      {!loading && error && !networkError ? (
        <View style={[styles.errorCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <AppText variant="subtitle">Unable to load market</AppText>
          <AppText variant="body" tone="muted">{error}</AppText>
          <Button title="Retry" onPress={loadFirstPage} size="md" style={styles.retryButton} />
        </View>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <FeedEmptyState onStartExploring={() => setSelectedChipId(filterChips[1]?.id ?? 'all')} />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: 'transparent' }]}> 
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <BrandHeader />

      <FlatList
        data={!loading && !error ? items : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentInset={{ bottom: overlayScrollPadding }}
        scrollIndicatorInsets={{ bottom: overlayScrollPadding }}
        contentContainerStyle={[styles.content, { paddingBottom: overlayScrollPadding }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          hasNextPage && !loading && !error ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Button title="Load more drops" onPress={loadMore} variant="secondary" size="md" fullWidth />
              )}
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        onEndReached={() => {
          if (hasNextPage && !loadingMore) {
            void loadMore();
          }
        }}
        onEndReachedThreshold={0.4}
      />
      {(loading || isSkeletonFadingOut) ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.marketSkeletonOverlay, { opacity: skeletonOpacity }]} pointerEvents={loading ? 'auto' : 'none'}>
          <MarketSkeleton />
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  marketSkeletonOverlay: {
    zIndex: 100,
  },
  marketSkeletonRoot: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  marketSkeletonHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  marketSkeletonHeaderActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  marketSkeletonHero: {
    gap: tokens.spacing.sm,
  },
  marketSkeletonChips: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  marketSkeletonCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  marketSkeletonCardBody: {
    padding: 14,
    gap: tokens.spacing.sm,
  },
  marketSkeletonBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  marketSkeletonBrandText: {
    flex: 1,
    gap: 6,
  },
  content: {
    paddingBottom: tokens.spacing['2xl'],
  },
  heroBlock: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  chipRow: {
    paddingHorizontal: 14,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  errorCard: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
  separator: {
    height: tokens.spacing.md,
  },
  footer: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.lg,
  },
  footerSpacer: {
    height: tokens.spacing.lg,
  },
  card: {
    marginHorizontal: tokens.spacing.lg,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: tokens.spacing.sm,
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  priceBadge: {
    position: 'absolute',
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    letterSpacing: 0.1,
  },
  brandTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  tagChip: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
  },
  statsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
