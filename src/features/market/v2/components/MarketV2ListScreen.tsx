import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useIsFocused } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FilterChip } from '@/components/ui/FilterChip';
import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { QuickPressable } from '@/components/ui/QuickPressable';
import { ScreenState } from '@/components/ui/ScreenState';
import { getMarketV2Catalog, getMarketV2Facets, getMarketV2Section } from '@/src/api/MarketV2Api';
import { MarketSectionDetailScreen } from '@/src/features/market/components/MarketSectionDetailScreen';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { useCommitCost } from '@/src/perf/commitCost';
import { startMarketSignalRuntime, trackMarketSignal } from '@/src/services/marketSignals';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navPerf } from '@/src/utils/navPerf';

import {
  MARKET_V2_LIST_LIMIT,
  classifyMarketV2Error,
  decodeMarketV2Filters,
  describeMarketV2Filters,
  encodeMarketV2FilterParam,
  hasMarketV2Filters,
  isMarketV2Sort,
  marketV2FilterSignature,
  marketV2ItemKey,
  type MarketV2ErrorInfo,
  type MarketV2Facets,
  type MarketV2Filters,
  type MarketV2Item,
  type MarketV2ListPage,
  type MarketV2SectionPage,
  type MarketV2Sort,
} from '../marketV2Contract';
import { MarketV2ImpressionTracker } from '../marketV2Impressions';
import { MarketV2ListController } from '../marketV2List';
import { openMarketV2Catalogue, openMarketV2Item } from '../marketV2Navigation';
import {
  formatMarketV2Price,
  marketV2Availability,
  marketV2GuestSessionFor,
  marketV2SessionEpoch,
  trackMarketV2CardSignal,
  useLatest,
  useMarketV2CardActions,
  useMarketV2Clips,
  useMarketV2Mode,
  useMarketV2Viewer,
  type MarketV2SignalContext,
} from '../marketV2Runtime';
import { MarketV2Card, type MarketV2CardContext } from './MarketV2Cards';
import { MarketV2FilterSheet } from './MarketV2FilterSheet';
import { MARKET_V2_CARD_GAP, MARKET_V2_SIDE_PADDING, MARKET_V2_VIEWABILITY } from './MarketV2Sections';

const CATALOGUE_KEY = 'market-catalogue';
const FILTER_EMOJI = String.fromCodePoint(0x1f39a, 0xfe0f);
const formatPrice = (amount: number) => formatMarketV2Price(amount);

/** The answer of a See All route served by the retained section reader. */
class RetainedSectionAnswer extends Error {
  constructor() {
    super('retained section');
    this.name = 'RetainedSectionAnswer';
  }
}

export type MarketV2ListRoute = {
  /** A server section's See All, or the whole catalogue with preset filters. */
  sectionKey: string | null;
  title: string | null;
  filters: string | null;
  sort: string | null;
  parentKey: string | null;
};

/**
 * See All and category pages for the server-composed Market. A section the
 * server still serves from its retained reader (or a Market that fell back)
 * opens the retained section screen instead.
 */
export function MarketV2ListScreen(route: MarketV2ListRoute) {
  const mode = useMarketV2Mode();
  const viewer = useMarketV2Viewer();
  const isFocused = useIsFocused();
  const [retained, setRetained] = useState(
    () => route.sectionKey !== null && (mode === 'legacy' || marketV2Availability.isLegacySection(route.sectionKey)),
  );
  const [shownViewer, setShownViewer] = useState(viewer.viewerKey);
  if (isFocused && shownViewer !== viewer.viewerKey) setShownViewer(viewer.viewerKey);
  const viewerKey = shownViewer === viewer.viewerKey ? shownViewer : null;
  const actions = useMarketV2CardActions(viewerKey, viewer.signedIn);
  const onRetained = useCallback(() => {
    if (route.sectionKey) marketV2Availability.rememberLegacySection(route.sectionKey);
    setRetained(true);
  }, [route.sectionKey]);

  if (retained && route.sectionKey) {
    return <MarketSectionDetailScreen sectionKey={route.sectionKey} parentKey={route.parentKey} />;
  }
  if (!viewerKey) return <ListLoading />;
  return (
    <MarketV2ListBody
      key={`${viewerKey}:${route.sectionKey ?? 'catalogue'}`}
      route={route}
      viewerKey={viewerKey}
      signedIn={viewer.signedIn}
      canBag={!viewer.isBrandAccount}
      ownBrandId={viewer.activeBrandId}
      bag={actions.bag}
      clip={actions.clip}
      busy={actions.busy}
      onRetained={onRetained}
    />
  );
}

function ListLoading() {
  const { theme } = useTheme();
  const { insets } = useScreenChrome();
  return (
    <View style={[styles.root, styles.center, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <MuseLoader size={20} />
    </View>
  );
}

type BodyProps = {
  route: MarketV2ListRoute;
  viewerKey: string;
  signedIn: boolean;
  canBag: boolean;
  ownBrandId: string | null;
  bag: (item: MarketV2Item) => void;
  clip: (item: MarketV2Item, clipped: boolean) => void;
  busy: Record<string, true>;
  onRetained: () => void;
};

type SectionMeta = { title: string; subtitle: string | null; sourceType: string };

const MarketV2ListBody = memo(function MarketV2ListBody({
  route,
  viewerKey,
  signedIn,
  canBag,
  ownBrandId,
  bag,
  clip,
  busy,
  onRetained,
}: BodyProps) {
  useCommitCost('MarketSection');
  const { theme, scheme } = useTheme();
  const { insets, standardScreenBottomPadding } = useScreenChrome();
  const { width } = useWindowDimensions();
  const deferredReady = useDeferredScreenWork();
  const sectionKey = route.sectionKey;
  const isCatalogue = sectionKey === null;
  const listKey = sectionKey ?? CATALOGUE_KEY;
  const [meta, setMeta] = useState<SectionMeta | null>(
    isCatalogue ? { title: route.title ?? 'Market', subtitle: null, sourceType: 'PRODUCT' } : null,
  );
  const retainedRef = useRef(false);

  const [list] = useState(
    () =>
      new MarketV2ListController<MarketV2ListPage>({
        fetch: async (request, signal) => {
          if (isCatalogue) return getMarketV2Catalog(request, signal);
          const result = await getMarketV2Section(sectionKey, request, signal);
          if (result.kind === 'legacy') {
            retainedRef.current = true;
            throw new RetainedSectionAnswer();
          }
          return result.page;
        },
        now: () => Date.now(),
        guestSession: () => marketV2GuestSessionFor(viewerKey),
        sessionEpoch: marketV2SessionEpoch,
        includeFacets: isCatalogue,
        limit: MARKET_V2_LIST_LIMIT,
        onPage: (page, reset) => {
          if (!reset || isCatalogue) return;
          const section = (page as MarketV2SectionPage).section;
          setMeta({ title: section.title, subtitle: section.subtitle, sourceType: section.sourceType });
        },
      }),
  );
  const state = useSyncExternalStore(list.subscribe, list.getState, list.getState);
  useEffect(() => () => list.dispose(), [list]);

  const filtersRef = useLatest(state.filters);
  const sortRef = useLatest(state.sort);

  const load = useCallback(
    async (filters: MarketV2Filters, sort: MarketV2Sort | null, firstLoad = false) => {
      const outcome = await list.load(filters, sort);
      if (retainedRef.current) {
        onRetained();
        return;
      }
      if (outcome.kind !== 'error') return;
      if (outcome.status === 404 && !isCatalogue) {
        onRetained();
        return;
      }
      // A link with filters the server will not take (or a section reader
      // that takes none) still opens: the plain list, with the reason.
      if (firstLoad && outcome.error.kind === 'invalid-filter' && (hasMarketV2Filters(filters) || sort)) {
        await list.load({}, null, 'Those filters could not be applied here.');
        if (retainedRef.current) onRetained();
      }
    },
    [isCatalogue, list, onRetained],
  );

  useEffect(() => {
    const filters = decodeMarketV2Filters(route.filters);
    const sort = isMarketV2Sort(route.sort) ? route.sort : null;
    void load(filters, sort, true);
    // The route opens the list once; later changes come from this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    navPerf.screenMounted('market→section');
    navPerf.shellVisible('market→section');
    navPerf.firstVisibleUi('market→section');
  }, []);
  useEffect(() => {
    if (state.phase === 'ready' || state.phase === 'error') navPerf.dataReady('market→section');
  }, [state.phase]);

  useEffect(() => {
    if (!deferredReady) return undefined;
    return startMarketSignalRuntime();
  }, [deferredReady]);

  const viewSent = useRef(false);
  useEffect(() => {
    if (viewSent.current || state.phase !== 'ready' || isCatalogue || !sectionKey) return;
    viewSent.current = true;
    trackMarketSignal({
      targetType: 'SECTION',
      targetId: sectionKey,
      signalType: 'MARKET_SECTION_VIEW',
      surface: 'MARKET_SECTION_DETAIL',
      sectionKey,
    });
  }, [isCatalogue, sectionKey, state.phase]);

  // ── Telemetry ────────────────────────────────────────────────────────
  const signalContext = useMemo<MarketV2SignalContext>(
    () => ({ surface: isCatalogue ? 'MARKET_HOME' : 'MARKET_SECTION_DETAIL', sectionKey: listKey }),
    [isCatalogue, listKey],
  );
  const itemsRef = useLatest(new Map(state.items.map((item) => [marketV2ItemKey(item), item])));
  const [tracker] = useState(
    () =>
      new MarketV2ImpressionTracker(({ card, visibleMs }) => {
        const item = itemsRef.current.get(card.key);
        if (item) trackMarketV2CardSignal(item, 'IMPRESSION', signalContext, card.position, visibleMs);
      }, () => Date.now()),
  );
  useEffect(() => {
    // The page itself is on screen; each card reports its own visibility.
    tracker.setRowVisible(listKey, true);
  }, [listKey, tracker]);
  const positions = useLatest(new Map(state.items.map((item, index) => [marketV2ItemKey(item), index])));
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    tracker.setRowCards(
      listKey,
      viewableItems.flatMap((token) => {
        const item = token.item as MarketV2Item | null;
        if (!token.isViewable || !item) return [];
        const key = marketV2ItemKey(item);
        return [{ key, position: positions.current.get(key) ?? token.index ?? 0 }];
      }),
    );
  }).current;

  // ── Cards ────────────────────────────────────────────────────────────
  const designIds = useMemo(
    () => state.items.filter((item) => item.entityType === 'DESIGN').map((item) => item.id).slice(0, 50),
    [state.items],
  );
  const isClipped = useMarketV2Clips(viewerKey, signedIn, deferredReady && state.phase === 'ready', designIds);
  const onOpen = useCallback(
    (item: MarketV2Item, position: number) => openMarketV2Item(item, signalContext, position),
    [signalContext],
  );
  const cardContext = useMemo<MarketV2CardContext>(
    () => ({ isClipped, busy, canBag, ownBrandId, mediaPending: false, onOpen, onBag: bag, onClip: clip }),
    [bag, busy, canBag, clip, isClipped, onOpen, ownBrandId],
  );

  // ── Filters ──────────────────────────────────────────────────────────
  const productList = meta?.sourceType === 'PRODUCT';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sectionFacets, setSectionFacets] = useState<{ signature: string; facets: MarketV2Facets | null } | null>(null);
  const [facetsError, setFacetsError] = useState<MarketV2ErrorInfo | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const facetsAbort = useRef<AbortController | null>(null);
  useEffect(() => () => facetsAbort.current?.abort(), []);

  /** See All counts are read when the sheet opens, once per set of filters. */
  const loadSectionFacets = useCallback(() => {
    if (isCatalogue || !sectionKey) return;
    const signature = marketV2FilterSignature(filtersRef.current);
    if (sectionFacets?.signature === signature) return;
    facetsAbort.current?.abort();
    const controller = new AbortController();
    facetsAbort.current = controller;
    const epoch = marketV2SessionEpoch();
    setFacetsLoading(true);
    setFacetsError(null);
    getMarketV2Facets(filtersRef.current, sectionKey, marketV2GuestSessionFor(viewerKey), controller.signal)
      .then((facets) => {
        if (controller.signal.aborted || epoch !== marketV2SessionEpoch()) return;
        setSectionFacets({ signature, facets });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const info = classifyMarketV2Error(error);
        if (info.kind !== 'aborted') setFacetsError(info);
      })
      .finally(() => {
        if (facetsAbort.current === controller) setFacetsLoading(false);
      });
  }, [filtersRef, isCatalogue, sectionFacets?.signature, sectionKey, viewerKey]);

  const facets = isCatalogue ? state.facets : sectionFacets?.facets ?? null;
  const openSheet = useCallback(() => {
    setSheetOpen(true);
    loadSectionFacets();
  }, [loadSectionFacets]);

  const apply = useCallback(
    (filters: MarketV2Filters, sort: MarketV2Sort | null) => {
      const encoded = encodeMarketV2FilterParam(filters);
      // The route mirrors the list, so a shared or restored link reopens it.
      router.setParams({ filters: encoded || undefined, sort: sort ?? undefined } as never);
      void load(filters, sort);
    },
    [load],
  );
  const applied = useMemo(() => describeMarketV2Filters(state.filters, facets, formatPrice), [facets, state.filters]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(filtersRef.current, sortRef.current);
    setRefreshing(false);
  }, [filtersRef, load, sortRef]);

  // ── Layout ───────────────────────────────────────────────────────────
  const onlyCollections = state.items.length > 0 && state.items.every((item) => item.entityType === 'COLLECTION');
  const columns = onlyCollections ? 1 : width >= 720 ? 3 : 2;
  const cardWidth = Math.floor((width - MARKET_V2_SIDE_PADDING * 2 - MARKET_V2_CARD_GAP * (columns - 1)) / columns);
  const title = meta?.title ?? route.title ?? '';

  const renderItem = useCallback(
    ({ item, index }: { item: MarketV2Item; index: number }) => (
      <MarketV2Card item={item} rowKey={listKey} position={index} width={cardWidth} context={cardContext} />
    ),
    [cardContext, cardWidth, listKey],
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <AppBackButton fallbackHref="/(tabs)/discover" />
        {productList ? (
          <QuickPressable
            onPress={openSheet}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Sort and filter ${title}`}
          >
            <LiquidGlassFill glassRole="control" borderRadius={tokens.radius.md} />
            <AppText variant="subtitle">{FILTER_EMOJI}</AppText>
          </QuickPressable>
        ) : null}
      </View>
      {title ? (
        <AppText variant="h2" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {meta?.subtitle ? (
        <AppText variant="small" tone="muted">
          {meta.subtitle}
        </AppText>
      ) : null}
      {state.fallbackCopy ? (
        <AppText variant="caption" tone="muted">
          {state.fallbackCopy}
        </AppText>
      ) : null}
      {applied.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {applied.map((entry) => (
            <FilterChip key={entry.id} kind="remove" label={entry.label} onPress={() => apply(entry.without, state.sort)} />
          ))}
          <FilterChip kind="link" label="Clear all" onPress={() => apply({}, state.sort)} />
        </ScrollView>
      ) : null}
      {state.notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <LiquidGlassFill glassRole="brandSoft" borderRadius={tokens.radius.full} />
          <AppText variant="smallBold">{state.notice}</AppText>
          <QuickPressable onPress={() => list.dismissNotice()} accessibilityLabel="Dismiss" hitSlop={tokens.spacing.sm}>
            <AppText variant="smallBold" tone="primary">
              OK
            </AppText>
          </QuickPressable>
        </View>
      ) : null}
      {state.error && state.items.length ? (
        <View style={styles.banner}>
          <AppText variant="smallBold" tone="muted">
            {state.error.kind === 'offline' ? 'You are offline. Showing what was loaded before.' : "Couldn't refresh this list."}
          </AppText>
          <Button title="Retry" variant="secondary" size="xs" onPress={onRefresh} />
        </View>
      ) : null}
    </View>
  );

  const footer = state.loadingMore ? (
    <View style={styles.state}>
      <MuseLoader size={20} />
    </View>
  ) : state.moreError ? (
    <View style={styles.state}>
      <AppText variant="small" tone="muted">
        {state.moreError.message}
      </AppText>
      <Button title="Try again" variant="secondary" size="sm" onPress={() => void list.more()} />
    </View>
  ) : state.phase === 'ready' && state.items.length && !state.hasNextPage ? (
    <View style={styles.state}>
      <AppText variant="smallBold" tone="muted">
        {state.capped
          ? 'That is a lot of pieces. Add a filter to narrow them down.'
          : `You've seen all ${state.items.length} ${state.items.length === 1 ? 'piece' : 'pieces'}.`}
      </AppText>
      {!isCatalogue && productList ? (
        <Button
          title="Browse the whole Market"
          variant="secondary"
          size="sm"
          onPress={() => openMarketV2Catalogue('Market', state.filters)}
        />
      ) : null}
    </View>
  ) : null;

  const empty =
    state.phase === 'loading' || state.phase === 'idle' ? (
      <View style={styles.state}>
        <MuseLoader size={20} />
      </View>
    ) : state.phase === 'error' && state.error ? (
      <ScreenState
        compact
        kind={state.error.kind === 'offline' || state.error.kind === 'timeout' ? 'offline' : 'server'}
        message={state.error.message}
        onAction={onRefresh}
      />
    ) : hasMarketV2Filters(state.filters) ? (
      <ScreenState
        compact
        kind="noResults"
        title="No pieces match"
        message="Remove a filter, or clear them all."
        actionLabel="Clear all filters"
        onAction={() => apply({}, state.sort)}
      />
    ) : (
      <ScreenState compact kind="empty" title="Nothing here yet" message="New pieces appear here as designers publish them." />
    );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <FlatList
        key={columns}
        data={state.items}
        numColumns={columns}
        keyExtractor={marketV2ItemKey}
        renderItem={renderItem}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        contentContainerStyle={[styles.content, { paddingBottom: standardScreenBottomPadding + tokens.spacing.lg }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        onEndReached={() => void list.more()}
        onEndReachedThreshold={0.55}
        viewabilityConfig={MARKET_V2_VIEWABILITY}
        onViewableItemsChanged={onViewable}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={9}
        removeClippedSubviews
      />
      {productList ? (
        <MarketV2FilterSheet
          visible={sheetOpen}
          filters={state.filters}
          sort={state.sort}
          sortMenu={state.sortMenu}
          defaultSort={state.defaultSort}
          facets={facets}
          facetsLoading={isCatalogue ? state.pending && !facets : facetsLoading}
          facetsError={isCatalogue ? null : facetsError}
          onRetryFacets={loadSectionFacets}
          fixed={isCatalogue && route.filters?.startsWith('category=') ? { categoryIds: true } : undefined}
          onClose={() => setSheetOpen(false)}
          onApply={(filters, sort) => {
            setSheetOpen(false);
            apply(filters, sort);
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
  },
  header: {
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    gap: tokens.spacing.sm,
  },
  notice: {
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  gridRow: {
    gap: MARKET_V2_CARD_GAP,
  },
  state: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
});
