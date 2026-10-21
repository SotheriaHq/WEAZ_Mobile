import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { SeeMoreLink } from '@/components/ui/InlineNavLink';
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
  parentKey?: string | null;
};

type FilterChip = 'ALL' | 'READY_TO_WEAR' | 'CUSTOM_FIT' | 'UNDER_50K' | '50K_150K' | 'ABOVE_150K';

const PAGE_LIMIT = 24;
const SIDE_PADDING = tokens.spacing.lg;
const GAP = tokens.spacing.md;

const MAIN_MARKET_SECTION_KEYS = new Set([
  'hot-right-now',
  'fresh-drops',
  'picked-for-you',
  'new-designers-to-watch',
  'shop-by-style',
  'loved-near-you',
  'shop-the-look',
  'almost-gone',
  'still-thinking-about-these',
  'more-from-brands-you-like',
  'style-picks-of-the-week',
  'latest-collections',
  'adire',
  'bestsellers-row',
  'fresh-row',
  'custom-ready-row',
  'for-moodboard',
]);

const MAIN_MARKET_SECTION_TITLES = new Set([
  'loved near you',
  'hot right now',
  'fresh drops',
  'fresh on wiez',
  'picked for you',
  'new designers to watch',
  'shop by style',
  'shop the look',
  'almost gone',
  'still thinking about these',
  'more from brands you like',
  'style picks of the week',
  'latest collections',
  'adire casual',
  'highest sales & most coveted',
  'artisanal custom fit runway',
  'for your moodboard',
]);

const itemKey = (item: MarketSectionItem) => `${item.entityType}:${item.sourceId}`;

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getItemEffectiveAmount = (item: MarketSectionItem): number => {
  return (
    item.price?.effectiveAmount ??
    item.price?.saleAmount ??
    item.price?.amount ??
    item.priceRange?.min ??
    0
  );
};

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
  topLevelNavigate('/(tabs)/discover' as any);
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

export function MarketSectionDetailScreen({ sectionKey, parentKey }: Props) {
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

  const [activeFilter, setActiveFilter] = useState<FilterChip>('ALL');

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
  const embeddedCardWidth = Math.min(184, Math.max(148, Math.round(width * 0.42)));

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

  // Strict Deduplication of Embedded Fashion Sub-Sections:
  // Main market sections are strictly excluded so no "loved near you" appears here.
  const embeddedSubSections = useMemo(() => {
    const excludedKeys = new Set<string>([
      sectionKey.toLowerCase(),
      ...(parentKey ? [parentKey.toLowerCase()] : []),
      ...Array.from(MAIN_MARKET_SECTION_KEYS),
    ]);
    const seenTitles = new Set<string>([
      (section?.title || '').trim().toLowerCase(),
      ...Array.from(MAIN_MARKET_SECTION_TITLES),
    ]);

    const result: Array<{
      key: string;
      title: string;
      subtitle?: string;
      items: MarketSectionItem[];
    }> = [];

    // Thematic partitions of this section's own items (by category or tag)
    const itemsByCategory = new Map<string, MarketSectionItem[]>();
    for (const it of items) {
      const cat = it.category?.name || (it.tags && it.tags[0]) || null;
      if (cat && cat.trim().length > 1) {
        const catKey = cat.trim();
        const list = itemsByCategory.get(catKey) ?? [];
        list.push(it);
        itemsByCategory.set(catKey, list);
      }
    }

    for (const [catName, catItems] of itemsByCategory.entries()) {
      if (catItems.length >= 3) {
        const subKey = `${sectionKey}-sub-${catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const titleLower = catName.toLowerCase();
        if (!excludedKeys.has(subKey) && !seenTitles.has(titleLower)) {
          excludedKeys.add(subKey);
          seenTitles.add(titleLower);
          result.push({
            key: subKey,
            title: catName,
            subtitle: `Curated ${catName} pieces`,
            items: catItems,
          });
        }
      }
    }

    // Maximum 2 embedded rails on mobile
    return result.slice(0, 2);
  }, [items, parentKey, section?.title, sectionKey]);

  // Client-Side Filtered Items for Primary Catalog
  const filteredItems = useMemo(() => {
    if (activeFilter === 'READY_TO_WEAR') {
      return items.filter(
        (i) => i.availability?.standardCheckoutEnabled || i.entityType === 'PRODUCT',
      );
    }
    if (activeFilter === 'CUSTOM_FIT') {
      return items.filter((i) => Boolean(i.availability?.customOrderEnabled));
    }
    if (activeFilter === 'UNDER_50K') {
      return items.filter(
        (i) => getItemEffectiveAmount(i) < 50000 && getItemEffectiveAmount(i) > 0,
      );
    }
    if (activeFilter === '50K_150K') {
      return items.filter(
        (i) => getItemEffectiveAmount(i) >= 50000 && getItemEffectiveAmount(i) <= 150000,
      );
    }
    if (activeFilter === 'ABOVE_150K') {
      return items.filter((i) => getItemEffectiveAmount(i) > 150000);
    }
    return items;
  }, [activeFilter, items]);

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Back button with smart parent fallback */}
      <AppBackButton
        fallbackHref={
          parentKey
            ? (`/market-section?sectionKey=${parentKey}` as any)
            : ('/(tabs)/discover' as any)
        }
      />

      {/* Sector Badge */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.sectorBadge,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <AppText variant="captionBold" tone="primary">
            {section?.emotionalLabel?.toUpperCase() || 'WIEZ SECTOR'}
          </AppText>
        </View>
        <AppText variant="caption" tone="muted">
          {items.length} {items.length === 1 ? 'Piece' : 'Pieces'}
        </AppText>
      </View>

      {/* Title & Subtitle */}
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

      {/* Interactive Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipRow}
      >
        {(
          [
            { id: 'ALL', label: 'All' },
            { id: 'READY_TO_WEAR', label: 'Ready to Wear' },
            { id: 'CUSTOM_FIT', label: 'Custom Fit' },
            { id: 'UNDER_50K', label: 'Under ₦50k' },
            { id: '50K_150K', label: '₦50k - ₦150k' },
            { id: 'ABOVE_150K', label: '₦150k+' },
          ] as const
        ).map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => setActiveFilter(chip.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive
                    ? theme.colors.text
                    : theme.colors.surface,
                  borderColor: isActive
                    ? theme.colors.text
                    : theme.colors.border,
                },
              ]}
            >
              <AppText
                variant="captionBold"
                tone={isActive ? 'inverse' : 'default'}
              >
                {chip.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Grid Header */}
      <View style={styles.gridHeader}>
        <AppText variant="subtitle">
          All {section?.title ?? 'Section'} Catalog
        </AppText>
        <AppText variant="caption" tone="muted">
          {filteredItems.length} available
        </AppText>
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footer}>
      {loadingMore ? (
        <View style={styles.loadingMoreWrapper}>
          <MuseLoader size={20} />
        </View>
      ) : !hasNextPage && filteredItems.length > 0 ? (
        <View style={styles.endOfCatalog}>
          <AppText variant="captionBold" tone="muted">
            End of Section Catalog
          </AppText>
        </View>
      ) : null}

      {/* Unique Thematic Sub-Sections Displayed UNDER the Main Catalog */}
      {embeddedSubSections.length > 0 && (
        <View style={styles.embeddedContainer}>
          <View style={styles.embeddedTitleRow}>
            <AppText variant="subtitle">Curated Sub-Themes</AppText>
          </View>
          {embeddedSubSections.map((subSec) => (
            <View key={subSec.key} style={styles.embeddedSection}>
              <View style={styles.embeddedHeader}>
                <View style={styles.embeddedTitleBlock}>
                  <AppText variant="bodyBold" numberOfLines={1}>
                    {subSec.title}
                  </AppText>
                  {subSec.subtitle ? (
                    <AppText variant="caption" tone="muted" numberOfLines={1}>
                      {subSec.subtitle}
                    </AppText>
                  ) : null}
                </View>
                <SeeMoreLink
                  onPress={() =>
                    drillDownPush({
                      pathname: '/market-section',
                      params: {
                        sectionKey: subSec.key,
                        parentKey: sectionKey,
                      },
                    } as any)
                  }
                  ofWhat={subSec.title}
                />
              </View>

              <FlatList
                data={subSec.items}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(it) => `${subSec.key}:${itemKey(it)}`}
                contentContainerStyle={styles.embeddedRailContent}
                renderItem={({ item: it }) => (
                  <SectionItemCard
                    item={it}
                    width={embeddedCardWidth}
                    sectionKey={subSec.key}
                  />
                )}
              />
            </View>
          ))}
        </View>
      )}

      {/* Backend Suggestions Displayed UNDER the Main Section */}
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
      <SafeAreaView
        edges={[]}
        style={[
          styles.root,
          { backgroundColor: theme.colors.bg, paddingTop: insets.top },
        ]}
      >
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {renderHeader()}
        <View style={styles.centerState}>
          <MuseLoader size={20} />
          <AppText variant="small" tone="muted">
            Loading curated section
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={[]}
      style={[
        styles.root,
        { backgroundColor: theme.colors.bg, paddingTop: insets.top },
      ]}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <FlatList
        showsVerticalScrollIndicator={false}
        data={filteredItems}
        key={columnCount}
        numColumns={columnCount}
        keyExtractor={itemKey}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        columnWrapperStyle={columnCount > 1 ? styles.gridRow : undefined}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: standardScreenBottomPadding + tokens.spacing.lg },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
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
                drillDownPush(
                  { pathname: '/catalog/[brandId]', params: { brandId } } as any,
                )
              }
            />
          ) : (
            <SectionItemCard
              item={item}
              width={cardWidth}
              sectionKey={section?.key ?? sectionKey}
            />
          )
        }
        onEndReached={() => {
          if (hasNextPage && !loadingMore) void loadSection('more');
        }}
        onEndReachedThreshold={0.55}
        ListEmptyComponent={
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
              title="No matching pieces"
              message="No items match your active filter. Try resetting the filter to All."
              onAction={() => setActiveFilter('ALL')}
              actionLabel="Show All Pieces"
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
    paddingBottom: tokens.spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacing.xs,
  },
  sectorBadge: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 4,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
  },
  titleBlock: {
    gap: tokens.spacing.xs,
  },
  filterChipRow: {
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  chip: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  embeddedContainer: {
    gap: tokens.spacing.xl,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
  },
  embeddedSection: {
    gap: tokens.spacing.sm,
  },
  embeddedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  embeddedTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  embeddedRailContent: {
    gap: GAP,
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacing.sm,
  },
  gridRow: {
    gap: GAP,
  },
  gridCard: {
    marginBottom: GAP,
  },
  footer: {
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.xl,
  },
  loadingMoreWrapper: {
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
  },
  endOfCatalog: {
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
  },
  embeddedTitleRow: {
    paddingBottom: tokens.spacing.xs,
  },
  centerState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: SIDE_PADDING,
  },
});
