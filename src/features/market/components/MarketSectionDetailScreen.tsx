import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { ScreenState } from '@/components/ui/ScreenState';
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
import { UnifiedProductCard } from '@/components/commerce/UnifiedProductCard';
import {
  DesignerFrontCard,
  type DesignerFrontBrand,
} from '@/src/features/market/components/DesignerFrontCard';
import { MuseLoader } from '@/components/ui/MuseLoader';

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

/** Section payload -> the designer front's props. */
const toDesignerFrontBrand = (item: MarketSectionItem): DesignerFrontBrand => ({
  id: item.brand?.id ?? item.target?.id ?? item.sourceId,
  name: item.brand?.name ?? item.title,
  handle: item.subtitle ?? null,
  logoUrl: item.brand?.logoUrl ?? item.media?.thumbnailUrl ?? null,
  logoFileId: item.media?.fileId ?? null,
  pieceCount: item.stats?.products ?? null,
  blurb: item.description ?? null,
});

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
    drillDownPush({ pathname: '/products/[productId]', params: { productId: targetId } } as any);
    return;
  }
  if (targetType === 'DESIGN') {
    drillDownPush({
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
    drillDownPush({
      pathname: '/collection-viewer',
      params: { collectionId: targetId, returnTo: `/market-section?sectionKey=${sectionKey}` },
    } as any);
    return;
  }
  if (targetType === 'BRAND') {
    drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId: targetId } } as any);
    return;
  }
  // Top-level fallback when the section item has no drill-down target — navigate
  // (not push) so we reuse the existing Market tab instead of stacking a copy.
  topLevelNavigate('/(tabs)/discover' as any);
};

/**
 * The same card as every other grid in the app.
 *
 * This screen was drawing its own: a bordered box with a cropped image on top,
 * an entity-type pill ("DESIGN"), then title, subtitle and price stacked
 * underneath on a solid body. Market itself moved to `UnifiedProductCard`
 * (full-bleed media, frosted copy panel) and this screen — the one you land on
 * from every "See more" — was left behind, so following a row into its own page
 * changed what the cards looked like. The entity pill goes with it: "DESIGN"
 * tells a shopper nothing the picture has not.
 */
function SectionItemCard({
  item,
  width,
  sectionKey,
}: {
  item: MarketSectionItem;
  width: number;
  sectionKey: string;
}) {
  const mediaSrc = item.media?.thumbnailUrl ?? item.media?.url ?? item.brand?.logoUrl ?? null;

  return (
    <UnifiedProductCard
      width={width}
      height={Math.round(width * 1.58)}
      title={item.title}
      brandName={item.brand?.name ?? null}
      priceLabel={formatPrice(item)}
      customOrder={Boolean(item.availability?.customOrderEnabled)}
      mediaSrc={mediaSrc}
      mediaFileId={item.media?.fileId ?? null}
      analyticsSourceScreen="market_section"
      onPress={() => openItem(item, sectionKey)}
      style={styles.gridCard}
    />
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

  /*
    A section of BRANDS is not a grid.

    "New designers to watch" carries brands, and a brand tile in a two-up grid
    is a logo and a number — nothing to judge a designer by. Those sections lay
    out one designer front per row instead, full width, each showing that
    designer's actual work. Every other section stays a grid, because a product
    or a design IS its picture and a grid shows more of them.
  */
  const isDesignerSection = useMemo(
    () => items.length > 0 && items.every((item) => item.entityType === 'BRAND'),
    [items],
  );
  const columnCount = isDesignerSection ? 1 : width >= 720 ? 3 : 2;
  const fullWidth = Math.floor(width - SIDE_PADDING * 2);
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
    navPerf.shellVisible('market→section');
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
      {/*
        The same back control as every other screen.

        This was the one place in the app that spelled the word "Back" in a
        bordered pill instead of using `AppBackButton`, so the section detail
        looked like it belonged to a different product — and it called
        `router.back()` raw, with no fallback for the case where there is no
        history to pop (a notification or deep link opening the section
        directly would have left the user stuck).
      */}
      <AppBackButton fallbackHref="/(tabs)/discover" />
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
      {loadingMore ? <MuseLoader size={20} /> : null}
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
          <MuseLoader size={20} />
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
        renderItem={({ item }) =>
          isDesignerSection ? (
            <DesignerFrontCard
              brand={toDesignerFrontBrand(item)}
              width={fullWidth}
              onOpenDesign={(design) =>
                drillDownPush({
                  pathname: '/market-viewer',
                  params: {
                    sourceType: 'DESIGN',
                    sourceId: design.id,
                    brandId: item.brand?.id ?? item.sourceId,
                    title: design.title,
                    brandName: design.brandName ?? item.brand?.name ?? '',
                  },
                } as any)
              }
              onOpenCatalogue={(brandId) =>
                drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId } } as any)
              }
            />
          ) : (
            <SectionItemCard item={item} width={cardWidth} sectionKey={section?.key ?? sectionKey} />
          )
        }
        onEndReached={() => {
          if (hasNextPage && !loadingMore) void loadSection('more');
        }}
        onEndReachedThreshold={0.55}
        ListEmptyComponent={
          // A failed load and a genuinely empty section used to render the same
          // block, so there was no way to tell which one you were looking at —
          // and only one of them is worth retrying.
          error ? (
            <ScreenState
              compact
              kind="server"
              title="Section could not load"
              message={error}
              onAction={onRefresh}
            />
          ) : (
            <ScreenState
              compact
              kind="empty"
              title="No items yet"
              message="This section is active but has no market-ready items right now."
            />
          )
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
  titleBlock: {
    gap: tokens.spacing.xs,
  },
  gridRow: {
    gap: GAP,
  },
  gridCard: {
    marginBottom: GAP,
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
});
