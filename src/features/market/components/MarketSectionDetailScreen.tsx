import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import {
  getMarketSectionDetail,
  type MarketSection,
  type MarketSectionItem,
} from '@/src/api/MarketApi';
import {
  flushMarketSignals,
  trackMarketSignal,
} from '@/src/services/marketSignals';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navPerf } from '@/src/utils/navPerf';
import { MobileMarketSuggestionBlocks } from '@/src/features/market/components/MobileMarketSuggestionBlocks';

type Props = {
  sectionKey: string;
};

const PAGE_LIMIT = 24;
const SIDE_PADDING = tokens.spacing.lg;
const GAP = tokens.spacing.md;

const itemKey = (item: MarketSectionItem) => `${item.entityType}:${item.sourceId}`;

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const formatPrice = (item: MarketSectionItem) => {
  const currency = item.price?.currency ?? item.priceRange?.currency ?? 'NGN';
  const amount = item.price?.effectiveAmount ?? item.price?.amount ?? null;
  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
  const min = item.priceRange?.min;
  const max = item.priceRange?.max;
  if (typeof min === 'number' && typeof max === 'number' && min > 0 && max > 0) {
    return min === max
      ? `${currency} ${Math.round(min).toLocaleString()}`
      : `${currency} ${Math.round(min).toLocaleString()} - ${Math.round(max).toLocaleString()}`;
  }
  if (item.entityType === 'BRAND') return `${item.stats?.products ?? 0} pieces`;
  if (item.entityType === 'CATEGORY') return 'Explore';
  return 'View';
};

const openItem = (item: MarketSectionItem, sectionKey: string) => {
  const targetType = item.target?.type ?? item.entityType;
  const targetId = item.target?.id ?? item.sourceId;
  if (!targetId) return;

  trackMarketSignal({
    targetType,
    targetId,
    signalType: 'OPEN',
    surface: 'MARKET_SECTION_DETAIL',
    sectionKey,
    metadata: { entityType: item.entityType, sourceType: item.sourceType },
  });
  void flushMarketSignals();

  if (targetType === 'PRODUCT') {
    router.push({ pathname: '/products/[productId]', params: { productId: targetId } } as any);
    return;
  }
  if (targetType === 'DESIGN') {
    router.push({
      pathname: '/market-viewer',
      params: {
        sourceType: 'DESIGN',
        sourceId: targetId,
        brandId: item.brand?.id ?? undefined,
        title: item.title,
        brandName: item.brand?.name ?? '',
        priceLabel: formatPrice(item),
      },
    } as any);
    return;
  }
  if (targetType === 'COLLECTION') {
    router.push({
      pathname: '/collection-viewer',
      params: { collectionId: targetId, returnTo: `/market-section?sectionKey=${sectionKey}` },
    } as any);
    return;
  }
  if (targetType === 'BRAND') {
    router.push({ pathname: '/catalog/[brandId]', params: { brandId: targetId } } as any);
    return;
  }
  router.push('/(tabs)/discover' as any);
};

function SectionItemCard({
  item,
  width,
  sectionKey,
}: {
  item: MarketSectionItem;
  width: number;
  sectionKey: string;
}) {
  const { theme } = useTheme();
  const imageUri = item.media?.thumbnailUrl ?? item.media?.url ?? item.brand?.logoUrl ?? null;

  return (
    <Pressable
      onPress={() => openItem(item, sectionKey)}
      style={({ pressed }) => [
        styles.card,
        { width, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
    >
      {imageUri ? (
        <StableImage
          uri={imageUri}
          resizeMode="cover"
          containerStyle={styles.cardImage}
          imageStyle={styles.cardImage}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="title" tone="muted">
            {item.title.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
      )}
      <View style={styles.cardBody}>
        <AppText variant="captionBold" tone="primary" numberOfLines={1}>
          {item.entityType}
        </AppText>
        <AppText variant="bodyBold" numberOfLines={2}>
          {item.title}
        </AppText>
        {item.subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {item.subtitle}
          </AppText>
        ) : null}
        <AppText variant="captionBold" tone="primary" numberOfLines={1}>
          {formatPrice(item)}
        </AppText>
      </View>
    </Pressable>
  );
}

export function MarketSectionDetailScreen({ sectionKey }: Props) {
  const { theme, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const { insets, standardScreenBottomPadding } = useScreenChrome();
  const [section, setSection] = useState<MarketSection | null>(null);
  const [items, setItems] = useState<MarketSectionItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnCount = width >= 720 ? 3 : 2;
  const cardWidth = useMemo(
    () => Math.floor((width - SIDE_PADDING * 2 - GAP * (columnCount - 1)) / columnCount),
    [columnCount, width],
  );

  const loadSection = useCallback(
    async (mode: 'reset' | 'more') => {
      if (!sectionKey) return;
      if (mode === 'more' && (!hasNextPage || !cursor || loadingMore)) return;
      if (mode === 'reset') {
        setError(null);
        setLoading(!section);
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await getMarketSectionDetail(sectionKey, {
          cursor: mode === 'more' ? cursor : null,
          limit: PAGE_LIMIT,
        });
        setSection(response.section);
        setCursor(response.section.pagination?.nextCursor ?? null);
        setHasNextPage(Boolean(response.section.pagination?.hasNextPage));
        setItems((current) => {
          if (mode === 'reset') return response.section.items;
          const seen = new Set(current.map(itemKey));
          return [
            ...current,
            ...response.section.items.filter((item) => !seen.has(itemKey(item))),
          ];
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load section.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, hasNextPage, loadingMore, section, sectionKey],
  );

  // Dev-only nav timing for market→section. Shell/skeleton renders at mount;
  // data is ready once the initial section load settles.
  useEffect(() => {
    navPerf.screenMounted('market→section');
    navPerf.firstVisibleUi('market→section');
  }, []);
  useEffect(() => {
    if (!loading) navPerf.dataReady('market→section');
  }, [loading]);

  useEffect(() => {
    void loadSection('reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  useEffect(() => {
    if (!section) return;
    trackMarketSignal({
      targetType: 'SECTION',
      targetId: section.key,
      signalType: 'MARKET_SECTION_VIEW',
      surface: 'MARKET_SECTION_DETAIL',
      sectionKey: section.key,
    });
  }, [section]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSection('reset');
    setRefreshing(false);
  }, [loadSection]);

  const renderHeader = () => (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.backButton,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <AppText variant="captionBold">Back</AppText>
      </Pressable>
      <View style={styles.titleBlock}>
        <AppText variant="h2" numberOfLines={2}>
          {section?.title ?? 'Market section'}
        </AppText>
        {section?.subtitle ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {section.subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footer}>
      {loadingMore ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {section ? (
        <MobileMarketSuggestionBlocks
          context="MARKET_SECTION_DETAIL"
          targetType="SECTION"
          targetId={section.key}
          sectionKey={section.key}
          limit={8}
          surface="MARKET_SECTION_DETAIL"
          screenContext="mobile-market-section-detail"
        />
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {renderHeader()}
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="small" tone="muted">Loading section</AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <FlatList
        data={items}
        key={columnCount}
        numColumns={columnCount}
        keyExtractor={itemKey}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        columnWrapperStyle={columnCount > 1 ? styles.gridRow : undefined}
        contentContainerStyle={[styles.content, { paddingBottom: standardScreenBottomPadding + tokens.spacing.lg }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        renderItem={({ item }) => (
          <SectionItemCard item={item} width={cardWidth} sectionKey={section?.key ?? sectionKey} />
        )}
        onEndReached={() => {
          if (hasNextPage && !loadingMore) void loadSection('more');
        }}
        onEndReachedThreshold={0.55}
        ListEmptyComponent={
          <View style={styles.centerState}>
            <AppText variant="bodyBold">{error ? 'Section could not load' : 'No items yet'}</AppText>
            <AppText variant="small" tone="muted" numberOfLines={2}>
              {error ?? 'This section is active but has no market-ready items right now.'}
            </AppText>
          </View>
        }
      />
    </SafeAreaView>
  );
}

export const readMarketSectionParam = firstParam;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SIDE_PADDING,
    gap: GAP,
  },
  header: {
    gap: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    gap: tokens.spacing.xs,
  },
  gridRow: {
    gap: GAP,
  },
  card: {
    marginBottom: GAP,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 4 / 5,
  },
  cardFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  footer: {
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.lg,
  },
  centerState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: SIDE_PADDING,
  },
  pressed: {
    opacity: 0.72,
  },
});
