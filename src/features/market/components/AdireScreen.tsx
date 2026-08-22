import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Header } from '@/components/ui/Header';
import UnifiedProductCard from '@/components/commerce/UnifiedProductCard';
import {
  ADIRE_BATCH_SIZE,
  ADIRE_QUERY_TERM,
  buildAdireBatch,
  createAdireBatchState,
  filterAdireItems,
} from '@/src/features/market/adire';
import {
  buildContentItems,
  getItemBrand,
  getItemMedia,
  getItemPriceLabel,
  getItemTitle,
  isCustomReady,
} from '@/src/features/market/components/MarketScreen';
import { getMarketFeed } from '@/src/api/MarketApi';
import { MobileStoreApi } from '@/src/api/StoreApi';
import type { MarketContentItem } from '@/src/features/market/types';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { drillDownPush } from '@/src/utils/mobileNavigation';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/** How far down the list the "back to top" control appears. */
const SCROLL_TOP_REVEAL_OFFSET = 640;

type AdireRow = {
  key: string;
  batchIndex: number;
  items: MarketContentItem[];
};

/**
 * Adire Casual, in full.
 *
 * Deliberately paged with an explicit "Load more" rather than infinite scroll.
 * The section is a ROTATION — the same piece can legitimately reappear in a
 * later batch — and a list that silently grows forever gives a shopper no sense
 * of where one pass ends and the next begins. A button per batch makes the
 * seam visible and hands back control; the arrow that appears once you are a
 * few batches down is there because the only thing worse than a long list is a
 * long list you have to swipe back up.
 */
export function AdireScreen() {
  const { theme, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const { standardScreenBottomPadding } = useScreenChrome();
  const listRef = useRef<FlatList<AdireRow> | null>(null);

  const [fetched, setFetched] = useState<MarketContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Ask the API for adire, then check what comes back.
   *
   * Both halves matter. The QUERY (`tag`/`category`) is what keeps this from
   * pulling the whole market down to filter on the device — it is the server's
   * index doing the work. The CHECK is what keeps the section honest: a tag
   * query is only as precise as the tags brands typed, so every row still has
   * to satisfy `matchesAdire` before it is allowed under a heading that
   * promises adire.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [designResult, productResult] = await Promise.allSettled([
        getMarketFeed({ tag: ADIRE_QUERY_TERM, limit: 40, counts: 'combined' }),
        MobileStoreApi.getMarketplaceProducts({ limit: 40, category: ADIRE_QUERY_TERM }),
      ]);
      if (cancelled) return;

      const designs = designResult.status === 'fulfilled' ? designResult.value?.items ?? [] : [];
      const products = productResult.status === 'fulfilled' ? productResult.value?.items ?? [] : [];

      setFetched(buildContentItems(products, designs));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const pool = useMemo(() => filterAdireItems(fetched), [fetched]);

  const [rows, setRows] = useState<AdireRow[]>([]);
  const batchStateRef = useRef(createAdireBatchState());
  const exhaustedRef = useRef(false);

  const columnCount = width >= 700 ? 3 : 2;
  const gutter = tokens.spacing.lg;
  const cardWidth = Math.floor(
    (width - gutter * 2 - tokens.spacing.md * (columnCount - 1)) / columnCount,
  );

  const appendBatch = useCallback(() => {
    if (exhaustedRef.current) return;
    const batch = buildAdireBatch(
      pool,
      (entry) => entry.key,
      batchStateRef.current,
      ADIRE_BATCH_SIZE * 2,
    );
    if (batch.length === 0) {
      exhaustedRef.current = true;
      return;
    }
    setRows((current) => [
      ...current,
      { key: `adire-batch-${current.length}`, batchIndex: current.length, items: batch },
    ]);
  }, [pool]);

  // A new pool is a new rotation: reset the tally and lay down the first batch.
  useEffect(() => {
    batchStateRef.current = createAdireBatchState();
    exhaustedRef.current = false;
    setRows([]);
    if (pool.length === 0) return;
    const first = buildAdireBatch(
      pool,
      (entry) => entry.key,
      batchStateRef.current,
      ADIRE_BATCH_SIZE * 2,
    );
    if (first.length > 0) {
      setRows([{ key: 'adire-batch-0', batchIndex: 0, items: first }]);
    }
  }, [pool]);

  const scrollTopProgress = useSharedValue(0);
  const scrollTopStyle = useAnimatedStyle(() => ({
    opacity: scrollTopProgress.value,
    transform: [{ scale: 0.9 + scrollTopProgress.value * 0.1 }],
  }));

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const next = event.nativeEvent.contentOffset.y > SCROLL_TOP_REVEAL_OFFSET ? 1 : 0;
      if (scrollTopProgress.value === next) return;
      scrollTopProgress.value = withTiming(next, {
        duration: 160,
        easing: Easing.out(Easing.quad),
        // Decorative: must not hold InteractionManager open.
        // (see CODEMAP "Mobile animation note")
      });
    },
    [scrollTopProgress],
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const onOpen = useCallback((entry: MarketContentItem) => {
    if (entry.kind === 'product') {
      drillDownPush({
        pathname: '/market-viewer',
        params: { sourceType: 'PRODUCT', sourceId: entry.product.id },
      } as any);
      return;
    }
    drillDownPush({
      pathname: '/market-viewer',
      params: { sourceType: 'DESIGN', sourceId: entry.design.collectionId },
    } as any);
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: AdireRow }) => (
      <View style={styles.batch}>
        <View style={styles.grid}>
          {item.items.map((entry, index) => (
            <UnifiedProductCard
              key={`${item.key}:${entry.key}:${index}`}
              width={cardWidth}
              height={Math.round(cardWidth * 1.5)}
              title={getItemTitle(entry)}
              brandName={getItemBrand(entry) ?? 'WIEZ brand'}
              priceLabel={getItemPriceLabel(entry)}
              customOrder={isCustomReady(entry)}
              mediaSrc={getItemMedia(entry).mediaSrc}
              mediaFileId={getItemMedia(entry).mediaFileId}
              analyticsSourceScreen="market"
              onPress={() => onOpen(entry)}
            />
          ))}
        </View>
      </View>
    ),
    [cardWidth, onOpen],
  );

  const listEmpty = !loading && pool.length === 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Header
        title="Adire Casual"
        subtitle="Indigo-dyed pieces, everyday cuts"
        left={<AppBackButton />}
      />

      {listEmpty ? (
        <View style={styles.empty}>
          <AppText variant="body" tone="secondary" style={styles.emptyText}>
            No adire pieces are live right now. Check back soon.
          </AppText>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: standardScreenBottomPadding },
          ]}
          ListFooterComponent={
            exhaustedRef.current && rows.length > 0 ? (
              <AppText variant="caption" tone="muted" style={styles.endNote}>
                That is every adire piece we have right now.
              </AppText>
            ) : rows.length > 0 ? (
              <Pressable
                onPress={appendBatch}
                accessibilityRole="button"
                accessibilityLabel="Load more adire pieces"
                style={({ pressed }) => [
                  styles.loadMore,
                  {
                    backgroundColor: theme.colors.primarySoft,
                    borderColor: theme.colors.focusRing,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <AppText variant="captionBold" tone="primary">
                  Load more
                </AppText>
              </Pressable>
            ) : null
          }
        />
      )}

      <Animated.View
        pointerEvents="box-none"
        style={[styles.scrollTopWrap, { bottom: standardScreenBottomPadding }, scrollTopStyle]}
      >
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Back to the top"
          hitSlop={tokens.spacing.sm}
          style={({ pressed }) => [
            styles.scrollTopButton,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="subtitle" tone="primary">
            ↑
          </AppText>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.lg,
  },
  batch: {
    gap: tokens.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  loadMore: {
    alignSelf: 'center',
    marginTop: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  endNote: {
    textAlign: 'center',
    marginTop: tokens.spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
  },
  scrollTopWrap: {
    position: 'absolute',
    right: tokens.spacing.lg,
    alignItems: 'flex-end',
  },
  scrollTopButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
});

export default AdireScreen;
