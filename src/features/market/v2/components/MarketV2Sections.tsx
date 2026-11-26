import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useLatest } from '../marketV2Runtime';
import { FlatList, StyleSheet, View, type ViewToken } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { SeeMoreLink } from '@/components/ui/InlineNavLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { PRODUCT_CARD_BODY_HEIGHT } from '@/components/commerce/UnifiedProductCard';
import {
  MARKET_RHYTHM,
  getMarketSectionEmoji,
  resolveMarketSectionFormat,
} from '@/src/constants/marketSections';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

import {
  chunkMarketV2Rows,
  marketV2ItemKey,
  type MarketV2Item,
  type MarketV2Section,
} from '../marketV2Contract';
import type { MarketV2ImpressionCard } from '../marketV2Impressions';
import { MarketV2Card, type MarketV2CardContext } from './MarketV2Cards';

export const MARKET_V2_SIDE_PADDING = tokens.spacing.lg;
export const MARKET_V2_CARD_GAP = tokens.spacing.md;
const BRAND_TILE_WIDTH = 112;
const RUNWAY_LINE = 'Designs from the Runway, made to your measurements';

/** Width of a rail card: about two and a half fit on a phone. */
export const marketV2RailCardWidth = (screenWidth: number) =>
  Math.min(184, Math.max(150, Math.round(screenWidth * 0.42)));

/**
 * Snap a card to the edge after each flick; nothing is drawn for the scroll
 * itself. Direction lock and nested scrolling keep a sideways swipe from
 * stealing the page's vertical scroll.
 */
const railScrollProps = (interval: number) => ({
  horizontal: true as const,
  showsHorizontalScrollIndicator: false,
  overScrollMode: 'never' as const,
  decelerationRate: 'fast' as const,
  snapToInterval: interval,
  snapToAlignment: 'start' as const,
  directionalLockEnabled: true,
  nestedScrollEnabled: true,
  initialNumToRender: 4,
  maxToRenderPerBatch: 3,
  windowSize: 3,
  removeClippedSubviews: true,
});

export const MARKET_V2_VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 500 } as const;

type RowImpressions = {
  setRowCards: (rowKey: string, cards: ReadonlyArray<MarketV2ImpressionCard>) => void;
};

const cardFor = (item: MarketV2Item, index: number): MarketV2ImpressionCard => ({
  key: marketV2ItemKey(item),
  position: item.position ?? index,
});

/**
 * Viewability for a sideways list. The handler identity must never change
 * while the list is mounted, so it reads the latest row through a ref.
 */
function useRailViewability(rowKey: string, impressions: RowImpressions) {
  const latest = useLatest({ rowKey, impressions });
  return useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const cards = viewableItems.flatMap((token) =>
      token.isViewable && token.item ? [cardFor(token.item as MarketV2Item, token.index ?? 0)] : [],
    );
    latest.current.impressions.setRowCards(latest.current.rowKey, cards);
  }).current;
}

export const MarketV2SectionHeader = memo(function MarketV2SectionHeader({
  emoji,
  title,
  line,
  personal,
  onViewAll,
  viewAllLabel,
}: {
  emoji: string;
  title: string;
  line: string | null;
  personal: boolean;
  onViewAll?: () => void;
  viewAllLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="subtitle" importantForAccessibility="no" accessibilityElementsHidden>
          {emoji}
        </AppText>
        <View style={styles.titleText}>
          <AppText variant="subtitle" accessibilityRole="header">
            {title}
          </AppText>
        </View>
        {onViewAll ? <SeeMoreLink onPress={onViewAll} ofWhat={title} label={viewAllLabel ?? 'View all'} /> : null}
      </View>
      {personal ? (
        <AppText variant="captionBold" tone="primary">
          For you
        </AppText>
      ) : null}
      {line ? (
        <AppText variant="caption" tone="muted">
          {line}
        </AppText>
      ) : null}
    </View>
  );
});

type SectionProps = {
  section: MarketV2Section;
  screenWidth: number;
  context: MarketV2CardContext;
  impressions: RowImpressions;
  onViewAll: (section: MarketV2Section) => void;
  /** The first item is already shown as the hero above this rail. */
  skipFirst?: boolean;
};

/** One server section, in the format its content calls for. Order and items are the server's. */
export const MarketV2SectionRow = memo(function MarketV2SectionRow({
  section,
  screenWidth,
  context,
  impressions,
  onViewAll,
  skipFirst = false,
}: SectionProps) {
  const { theme } = useTheme();
  const items = useMemo(() => (skipFirst ? section.items.slice(1) : section.items), [section.items, skipFirst]);
  const format = useMemo(
    () => resolveMarketSectionFormat(section.layout, section.items.map((item) => item.entityType)),
    [section.items, section.layout],
  );
  const onViewableItemsChanged = useRailViewability(section.key, impressions);
  const onColumnsViewable = useColumnViewability(section.key, impressions);
  const viewAll = useCallback(() => onViewAll(section), [onViewAll, section]);
  const cardWidth = marketV2RailCardWidth(screenWidth);
  const shelfWidth = Math.min(340, Math.round(screenWidth * 0.8));
  const tileWidth = Math.min(200, Math.max(150, Math.round((screenWidth - MARKET_V2_SIDE_PADDING - MARKET_V2_CARD_GAP) / 2.15)));
  const columns = useMemo(() => chunkMarketV2Rows(items, 2), [items]);
  if (!items.length) return null;

  const header = (
    <MarketV2SectionHeader
      emoji={getMarketSectionEmoji(section.key, format)}
      title={section.title}
      line={section.reason ?? section.subtitle ?? (section.template === 'FROM_RUNWAY' ? RUNWAY_LINE : null)}
      personal={section.personal}
      onViewAll={section.viewAll.enabled ? viewAll : undefined}
      viewAllLabel={section.viewAll.label}
    />
  );
  const keyOf = (item: MarketV2Item) => marketV2ItemKey(item);

  if (format === 'category-grid') {
    // Two rows that scroll sideways, at a fixed height however many there are.
    return (
      <View style={styles.section}>
        {header}
        <FlatList
          data={columns}
          keyExtractor={(column) => column.map(keyOf).join('|')}
          contentContainerStyle={styles.railContent}
          {...railScrollProps(tileWidth + MARKET_V2_CARD_GAP)}
          renderItem={({ item: column, index }) => (
            <View style={[styles.column, { width: tileWidth }]}>
              {column.map((item, row) => (
                <MarketV2Card
                  key={keyOf(item)}
                  item={item}
                  rowKey={section.key}
                  position={item.position ?? index * 2 + row}
                  width={tileWidth}
                  context={context}
                />
              ))}
            </View>
          )}
          viewabilityConfig={MARKET_V2_VIEWABILITY}
          onViewableItemsChanged={onColumnsViewable}
        />
      </View>
    );
  }

  const width = format === 'collection-rail' ? shelfWidth : format === 'brand-rail' ? BRAND_TILE_WIDTH : cardWidth;
  return (
    <View style={[styles.section, format === 'collection-rail' ? [styles.band, { backgroundColor: theme.colors.primarySoft }] : null]}>
      {header}
      <FlatList
        data={items}
        keyExtractor={keyOf}
        contentContainerStyle={format === 'brand-rail' ? styles.brandRailContent : styles.railContent}
        {...railScrollProps(width + (format === 'brand-rail' ? tokens.spacing.sm : MARKET_V2_CARD_GAP))}
        renderItem={({ item, index }) => (
          <MarketV2Card
            item={item}
            rowKey={section.key}
            position={item.position ?? index}
            width={width}
            height={format === 'product-rail' || format === 'product-grid' ? Math.round(width * 1.5) : undefined}
            context={context}
          />
        )}
        viewabilityConfig={MARKET_V2_VIEWABILITY}
        onViewableItemsChanged={onViewableItemsChanged}
      />
    </View>
  );
});

/** Category tiles are laid out two to a column; report both of a visible column. */
function useColumnViewability(rowKey: string, impressions: RowImpressions) {
  const latest = useLatest({ rowKey, impressions });
  return useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const cards = viewableItems.flatMap((token) =>
      token.isViewable && Array.isArray(token.item)
        ? (token.item as MarketV2Item[]).map((item, row) => cardFor(item, (token.index ?? 0) * 2 + row))
        : [],
    );
    latest.current.impressions.setRowCards(latest.current.rowKey, cards);
  }).current;
}

/**
 * The lead of a curated section, shown large. Only a curated list gets one:
 * a hero is an editorial choice, never a pick the app makes for itself.
 */
export const MarketV2Hero = memo(function MarketV2Hero({
  section,
  screenWidth,
  context,
}: {
  section: MarketV2Section;
  screenWidth: number;
  context: MarketV2CardContext;
}) {
  const item = section.items[0];
  if (!item) return null;
  const width = screenWidth - MARKET_V2_SIDE_PADDING * 2;
  return (
    <View style={styles.section}>
      <MarketV2SectionHeader
        emoji={getMarketSectionEmoji(section.key, 'product-rail')}
        title={section.title}
        line={section.reason ?? section.subtitle}
        personal={section.personal}
      />
      <View style={styles.hero}>
        <MarketV2Card
          item={item}
          rowKey={`hero:${section.key}`}
          position={item.position ?? 0}
          width={width}
          height={Math.round(width * 0.9)}
          wrapTitle
          context={context}
        />
      </View>
    </View>
  );
});

/** Placeholder rails, the size of the rails that replace them. */
export const MarketV2SectionSkeleton = memo(function MarketV2SectionSkeleton({ screenWidth }: { screenWidth: number }) {
  const width = marketV2RailCardWidth(screenWidth);
  const height = Math.round(width * 1.5) + PRODUCT_CARD_BODY_HEIGHT;
  return (
    <View style={styles.section} accessibilityLabel="Loading the Market">
      <View style={styles.header}>
        <Skeleton width={168} height={24} borderRadius={tokens.radius.sm} />
      </View>
      <View style={styles.skeletonRow}>
        <Skeleton width={width} height={height} borderRadius={tokens.radius.lg} />
        <Skeleton width={width} height={height} borderRadius={tokens.radius.lg} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    gap: MARKET_RHYTHM.headerToContent,
  },
  band: {
    paddingVertical: tokens.spacing.xl,
  },
  header: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
    gap: tokens.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  railContent: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
    gap: MARKET_V2_CARD_GAP,
  },
  brandRailContent: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
    gap: tokens.spacing.sm,
  },
  column: {
    gap: MARKET_V2_CARD_GAP,
  },
  hero: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: MARKET_V2_CARD_GAP,
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
  },
});
