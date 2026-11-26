import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AppState,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useIsFocused } from 'expo-router';

import AruMark from '@/src/brand/AruMark';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FilterChip } from '@/components/ui/FilterChip';
import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { QuickPressable } from '@/components/ui/QuickPressable';
import { ScreenState } from '@/components/ui/ScreenState';
import { getMarketV2Catalog, getMarketV2Page } from '@/src/api/MarketV2Api';
import { MarketScreen } from '@/src/features/market/components/MarketScreen';
import { MarketSkeleton } from '@/src/features/market/components/MarketSkeleton';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { useCommitCost } from '@/src/perf/commitCost';
import { useScreenArrival, useSkeletonTiming } from '@/src/perf/usePerfStages';
import { startMarketSignalRuntime, trackMarketSignal } from '@/src/services/marketSignals';
import {
  isPersistentScreenCachePrimed,
  persistentScreenCacheReady,
  persistScreenState,
} from '@/src/state/persistentScreenCache';
import { readWarmScreenState } from '@/src/state/screenWarmState';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';
import { isUsableMediaUrl } from '@/src/utils/mediaUrlPolicy';
import { navPerf } from '@/src/utils/navPerf';

import { marketV2HomeOutcome } from '../marketV2Availability';
import {
  MARKET_V2_AUDIENCE_LABELS,
  MARKET_V2_LIST_LIMIT,
  chunkMarketV2Rows,
  classifyMarketV2Error,
  createMarketV2HomeSnapshot,
  describeMarketV2Filters,
  hasMarketV2Filters,
  marketV2FilterSignature,
  marketV2ItemKey,
  marketV2NeedsRefresh,
  marketV2SignalEpoch,
  marketV2SnapshotKey,
  normalizeMarketV2Filters,
  restoreMarketV2Home,
  toggleMarketV2ListValue,
  type MarketV2Audience,
  type MarketV2ErrorInfo,
  type MarketV2Filters,
  type MarketV2Item,
  type MarketV2Section,
  type MarketV2Sort,
} from '../marketV2Contract';
import { MarketV2ImpressionTracker } from '../marketV2Impressions';
import { MarketV2ListController } from '../marketV2List';
import { openMarketV2Catalogue, openMarketV2Item, openMarketV2Section } from '../marketV2Navigation';
import {
  formatMarketV2Price,
  marketV2Availability,
  marketV2GuestSessionFor,
  marketV2SessionEpoch,
  trackMarketV2CardSignal,
  useMarketV2CardActions,
  useMarketV2Clips,
  useMarketV2Mode,
  useMarketV2Viewer,
  useLatest,
  type MarketV2SignalContext,
} from '../marketV2Runtime';
import { MarketV2Card, type MarketV2CardContext } from './MarketV2Cards';
import { MarketV2FilterSheet } from './MarketV2FilterSheet';
import {
  MARKET_V2_CARD_GAP,
  MARKET_V2_SIDE_PADDING,
  MARKET_V2_VIEWABILITY,
  MarketV2Hero,
  MarketV2SectionRow,
  MarketV2SectionSkeleton,
} from './MarketV2Sections';

const CATALOGUE_KEY = 'market-catalogue';
const AUDIENCES: MarketV2Audience[] = ['MEN', 'WOMEN', 'UNISEX'];
const SEARCH_EMOJI = String.fromCodePoint(0x1f50d);
const FILTER_EMOJI = String.fromCodePoint(0x1f39a, 0xfe0f);
const formatPrice = (amount: number) => formatMarketV2Price(amount);

/**
 * The Market tab when the server-composed Market is switched on for this
 * build. It waits for the saved screen state to load (so a remembered answer
 * and the overnight copy are both available), then shows the server Market,
 * or the retained Market when the server has not enabled it here.
 */
export function MarketV2Gate() {
  const [primed, setPrimed] = useState(isPersistentScreenCachePrimed);
  useEffect(() => {
    if (primed) return undefined;
    let live = true;
    void persistentScreenCacheReady().then(() => {
      if (live) setPrimed(true);
    });
    return () => {
      live = false;
    };
  }, [primed]);
  if (!primed) return <MarketV2Loading />;
  return <MarketV2Router />;
}

function MarketV2Loading() {
  const { theme } = useTheme();
  const { insets, standardScreenBottomPadding } = useScreenChrome();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface, paddingTop: insets.top }]}>
      <MarketSkeleton bottomPadding={standardScreenBottomPadding} />
    </View>
  );
}

function MarketV2Router() {
  const mode = useMarketV2Mode();
  // Only a return to the tab may change the renderer: never mid-scroll.
  useFocusEffect(
    useCallback(() => {
      marketV2Availability.reconsider();
    }, []),
  );
  if (mode === 'legacy') return <MarketScreen />;
  return <MarketV2Home />;
}

/**
 * Thin shell: the viewer and the bag/clip actions live here, so a bag-count
 * or profile change re-renders these lines, not the Market body.
 *
 * A Market hidden behind another tab keeps showing the viewer it had; when
 * the account changes while it is hidden, it drops that content at once
 * (rendering nothing) and loads for the new viewer when it is next looked at.
 */
function MarketV2Home() {
  const viewer = useMarketV2Viewer();
  const isFocused = useIsFocused();
  const [shownViewer, setShownViewer] = useState(viewer.viewerKey);
  if (isFocused && shownViewer !== viewer.viewerKey) setShownViewer(viewer.viewerKey);
  const viewerKey = shownViewer === viewer.viewerKey ? shownViewer : null;
  const actions = useMarketV2CardActions(viewerKey, viewer.signedIn);
  if (!viewerKey) return <MarketV2Loading />;
  return (
    <MarketV2HomeBody
      key={viewerKey}
      viewerKey={viewerKey}
      signedIn={viewer.signedIn}
      canBag={!viewer.isBrandAccount}
      ownBrandId={viewer.activeBrandId}
      bag={actions.bag}
      clip={actions.clip}
      busy={actions.busy}
    />
  );
}

type BodyProps = {
  viewerKey: string;
  signedIn: boolean;
  canBag: boolean;
  ownBrandId: string | null;
  bag: (item: MarketV2Item) => void;
  clip: (item: MarketV2Item, clipped: boolean) => void;
  busy: Record<string, true>;
};

type SectionsState = {
  phase: 'loading' | 'ready' | 'error';
  sections: MarketV2Section[];
  epoch: string | null;
  error: MarketV2ErrorInfo | null;
  /** Shown from the saved copy until the refresh lands. */
  restored: boolean;
};

type Row =
  | { key: string; type: 'hero'; section: MarketV2Section }
  | { key: string; type: 'section'; section: MarketV2Section; skipFirst: boolean }
  | { key: string; type: 'sections-loading' }
  | { key: string; type: 'sections-error'; error: MarketV2ErrorInfo }
  | { key: string; type: 'catalogue-header' }
  | { key: string; type: 'grid'; items: MarketV2Item[]; start: number }
  | { key: string; type: 'catalogue-loading' }
  | { key: string; type: 'catalogue-empty' }
  | { key: string; type: 'catalogue-error'; error: MarketV2ErrorInfo }
  | { key: string; type: 'catalogue-end' }
  | { key: string; type: 'market-empty' };

const MarketV2HomeBody = memo(function MarketV2HomeBody({
  viewerKey,
  signedIn,
  canBag,
  ownBrandId,
  bag,
  clip,
  busy,
}: BodyProps) {
  useCommitCost('MarketV2');
  const { theme, scheme } = useTheme();
  const { insets, standardScreenBottomPadding } = useScreenChrome();
  const { width } = useWindowDimensions();
  const deferredReady = useDeferredScreenWork();
  const snapshotKey = marketV2SnapshotKey(viewerKey);

  // The saved copy is read once, before the first frame.
  const [restored] = useState(() =>
    restoreMarketV2Home(readWarmScreenState<unknown>(snapshotKey), viewerKey, Date.now(), (url) => isUsableMediaUrl(url)),
  );
  const [sectionsState, setSectionsState] = useState<SectionsState>(() =>
    restored
      ? { phase: 'ready', sections: restored.snapshot.sections, epoch: restored.snapshot.epoch, error: null, restored: true }
      : { phase: 'loading', sections: [], epoch: null, error: null, restored: false },
  );
  const sectionsRef = useLatest(sectionsState);

  const [list] = useState(() => {
    const controller = new MarketV2ListController({
      fetch: (request, signal) => getMarketV2Catalog(request, signal),
      now: () => Date.now(),
      guestSession: () => marketV2GuestSessionFor(viewerKey),
      sessionEpoch: marketV2SessionEpoch,
      includeFacets: true,
      limit: MARKET_V2_LIST_LIMIT,
    });
    if (restored) {
      controller.restore({
        items: restored.snapshot.items,
        facets: restored.snapshot.facets,
        sortMenu: restored.snapshot.sortMenu,
        effectiveSort: restored.snapshot.effectiveSort,
        savedAt: restored.snapshot.savedAt,
      });
    }
    return controller;
  });
  const listState = useSyncExternalStore(list.subscribe, list.getState, list.getState);
  useEffect(() => () => list.dispose(), [list]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sectionsAbort = useRef<AbortController | null>(null);
  const loadSeq = useRef(0);
  const fullSuccessAt = useRef<number | null>(restored ? restored.snapshot.savedAt : null);
  const loadingRef = useRef(false);
  /** The first refresh has settled, whatever its outcome. */
  const [firstSettled, setFirstSettled] = useState(false);

  /** Both home reads, in parallel: the composed sections and the catalogue. */
  const load = useCallback(
    async (filters: MarketV2Filters, sort: MarketV2Sort | null) => {
      const seq = ++loadSeq.current;
      const epoch = marketV2SessionEpoch();
      sectionsAbort.current?.abort();
      const controller = new AbortController();
      sectionsAbort.current = controller;
      loadingRef.current = true;
      setSectionsState((current) => ({ ...current, phase: current.sections.length ? 'ready' : 'loading', error: null }));
      const sectionsRead = getMarketV2Page(filters, marketV2GuestSessionFor(viewerKey), controller.signal).then(
        (page) => ({ ok: true as const, page }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const [sections, catalogue] = await Promise.all([sectionsRead, list.load(filters, sort)]);
      if (seq !== loadSeq.current || epoch !== marketV2SessionEpoch()) return;
      loadingRef.current = false;
      setFirstSettled(true);
      let sectionsStatus: number | null | 'ok' = 'ok';
      if (sections.ok) {
        setSectionsState({ phase: 'ready', sections: sections.page.sections, epoch: sections.page.epoch, error: null, restored: false });
      } else {
        const info = classifyMarketV2Error(sections.error);
        if (info.kind === 'aborted') return;
        sectionsStatus = (sections.error as { response?: { status?: number } })?.response?.status ?? null;
        setSectionsState((current) => ({ ...current, phase: current.sections.length ? 'ready' : 'error', error: info }));
      }
      if (catalogue.kind === 'superseded') return;
      const catalogueStatus = catalogue.kind === 'ok' ? 'ok' : catalogue.status;
      const visible = list.getState().items.length > 0 || sectionsRef.current.sections.length > 0;
      const outcome = marketV2HomeOutcome({ statuses: [sectionsStatus, catalogueStatus], hasContent: visible });
      if (outcome) marketV2Availability.report(outcome);
      if (sectionsStatus === 'ok' && catalogueStatus === 'ok') {
        fullSuccessAt.current = Date.now();
        if (!hasMarketV2Filters(filters) && sort === null && sections.ok) {
          const state = list.getState();
          persistScreenState(
            snapshotKey,
            createMarketV2HomeSnapshot(viewerKey, fullSuccessAt.current, {
              epoch: sections.page.epoch,
              sections: sections.page.sections,
              items: state.items,
              facets: state.facets,
              sortMenu: state.sortMenu,
              effectiveSort: state.effectiveSort,
            }),
          );
        }
      }
    },
    [list, sectionsRef, snapshotKey, viewerKey],
  );

  const filtersRef = useLatest(listState.filters);
  const sortRef = useLatest(listState.sort);

  useEffect(() => {
    void load(filtersRef.current, sortRef.current);
    return () => sectionsAbort.current?.abort();
  }, [filtersRef, load, sortRef]);

  // Coming back to Market, or to the app on Market, refreshes stale content
  // behind what is on screen. Nothing runs while the tab is hidden.
  useFocusEffect(
    useCallback(() => {
      const refreshIfStale = () => {
        if (!loadingRef.current && marketV2NeedsRefresh(fullSuccessAt.current, Date.now())) {
          void load(filtersRef.current, sortRef.current);
        }
      };
      refreshIfStale();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') refreshIfStale();
      });
      return () => subscription.remove();
    }, [filtersRef, load, sortRef]),
  );

  useEffect(() => {
    if (!deferredReady) return undefined;
    return startMarketSignalRuntime();
  }, [deferredReady]);

  // ── Telemetry ────────────────────────────────────────────────────────
  const signalEpoch = marketV2SignalEpoch(sectionsState.epoch);
  const sectionByKey = useMemo(
    () => new Map(sectionsState.sections.map((section) => [section.key, section])),
    [sectionsState.sections],
  );
  const telemetry = useLatest({ sectionByKey, signalEpoch, restored: sectionsState.restored || listState.restored });
  const contextFor = useCallback((rowKey: string): MarketV2SignalContext => {
    const section = telemetry.current.sectionByKey.get(rowKey.replace(/^hero:/, ''));
    return {
      surface: 'MARKET_HOME',
      sectionKey: section ? section.key : CATALOGUE_KEY,
      policyVersion: section?.policyVersion ?? null,
      epoch: telemetry.current.signalEpoch,
    };
  }, [telemetry]);
  const itemsByKey = useRef(new Map<string, MarketV2Item>());
  const [tracker] = useState(
    () =>
      new MarketV2ImpressionTracker(({ rowKey, card, visibleMs }) => {
        // A saved copy was served earlier, not now: it is never impressed.
        if (telemetry.current.restored) return;
        const item = itemsByKey.current.get(`${rowKey}|${card.key}`);
        if (item) trackMarketV2CardSignal(item, 'IMPRESSION', contextFor(rowKey), card.position, visibleMs);
      }, () => Date.now()),
  );
  useEffect(() => {
    tracker.setEpoch(sectionsState.epoch);
  }, [sectionsState.epoch, tracker]);
  useEffect(() => {
    const next = new Map<string, MarketV2Item>();
    for (const section of sectionsState.sections) {
      for (const item of section.items) next.set(`${section.key}|${marketV2ItemKey(item)}`, item);
      // A hero's impression is filed under the section it leads.
      const lead = section.items[0];
      if (lead) next.set(`hero:${section.key}|${marketV2ItemKey(lead)}`, lead);
    }
    for (const item of listState.items) next.set(`${CATALOGUE_KEY}|${marketV2ItemKey(item)}`, item);
    itemsByKey.current = next;
  }, [listState.items, sectionsState.sections]);

  const viewedSections = useRef(new Set<string>());
  const onViewableRows = useRef(({ changed }: { changed: ViewToken[] }) => {
    for (const token of changed) {
      const row = token.item as Row | null;
      if (!row) continue;
      if (row.type === 'grid') {
        if (token.isViewable) {
          tracker.setRowCards(
            row.key,
            row.items.map((item, index) => ({ key: marketV2ItemKey(item), position: row.start + index })),
          );
        }
        tracker.setRowVisible(row.key, token.isViewable);
      } else if (row.type === 'section' || row.type === 'hero') {
        if (row.type === 'hero') {
          const lead = row.section.items[0];
          if (token.isViewable && lead) {
            tracker.setRowCards(row.key, [{ key: marketV2ItemKey(lead), position: lead.position ?? 0 }]);
          }
        }
        tracker.setRowVisible(row.key, token.isViewable);
        if (token.isViewable && !telemetry.current.restored && !viewedSections.current.has(row.section.key)) {
          viewedSections.current.add(row.section.key);
          trackMarketSignal({
            targetType: 'SECTION',
            targetId: row.section.key,
            signalType: 'MARKET_SECTION_VIEW',
            surface: 'MARKET_HOME',
            sectionKey: row.section.key,
          });
        }
      }
    }
  }).current;

  // ── Card actions ─────────────────────────────────────────────────────
  const designIds = useMemo(
    () =>
      sectionsState.sections
        .flatMap((section) => section.items)
        .concat(listState.items)
        .filter((item) => item.entityType === 'DESIGN')
        .map((item) => item.id)
        .slice(0, 50),
    [listState.items, sectionsState.sections],
  );
  const isClipped = useMarketV2Clips(viewerKey, signedIn, deferredReady && listState.phase === 'ready', designIds);

  const onOpen = useCallback(
    (item: MarketV2Item, position: number, rowKey: string) => openMarketV2Item(item, contextFor(rowKey), position),
    [contextFor],
  );

  // Saved cards whose addresses expired wait for the first refresh; if it
  // fails they resolve their pictures by file instead.
  const mediaPending = (sectionsState.restored || listState.restored) && !firstSettled;
  const cardContext = useMemo<MarketV2CardContext>(
    () => ({ isClipped, busy, canBag, ownBrandId, mediaPending, onOpen, onBag: bag, onClip: clip }),
    [bag, busy, canBag, clip, isClipped, mediaPending, onOpen, ownBrandId],
  );

  // ── Filters ──────────────────────────────────────────────────────────
  const applyFilters = useCallback(
    (filters: MarketV2Filters, sort: MarketV2Sort | null) => {
      const next = normalizeMarketV2Filters(filters);
      void load(next, sort);
    },
    [load],
  );
  const applySort = useCallback(
    (filters: MarketV2Filters, sort: MarketV2Sort | null) => {
      // A sort changes the catalogue only; the composed sections do not depend on it.
      if (marketV2FilterSignature(filters) === marketV2FilterSignature(filtersRef.current)) {
        void list.load(filtersRef.current, sort);
        return;
      }
      applyFilters(filters, sort);
    },
    [applyFilters, filtersRef, list],
  );
  const toggleAudience = useCallback(
    (audience: MarketV2Audience | null) => {
      const current = filtersRef.current;
      const next = audience === null ? normalizeMarketV2Filters({ ...current, audience: [] }) : toggleMarketV2ListValue(current, 'audience', audience);
      applyFilters(next, sortRef.current);
    },
    [applyFilters, filtersRef, sortRef],
  );
  const applied = useMemo(
    () => describeMarketV2Filters(listState.filters, listState.facets, formatPrice),
    [listState.facets, listState.filters],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(filtersRef.current, sortRef.current);
    setRefreshing(false);
  }, [filtersRef, load, sortRef]);

  const onViewAll = useCallback((section: MarketV2Section) => {
    trackMarketSignal({
      targetType: 'SECTION',
      targetId: section.key,
      signalType: 'MARKET_SECTION_VIEW_ALL_CLICK',
      surface: 'MARKET_HOME',
      sectionKey: section.key,
    });
    openMarketV2Section(section.key, filtersRef.current);
  }, [filtersRef]);

  // ── Rows ─────────────────────────────────────────────────────────────
  const columns = width >= 720 ? 3 : 2;
  const gridCardWidth = Math.floor((width - MARKET_V2_SIDE_PADDING * 2 - MARKET_V2_CARD_GAP * (columns - 1)) / columns);
  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    const { sections } = sectionsState;
    if (sectionsState.phase === 'loading' && !sections.length) {
      result.push({ key: 'sections-loading-1', type: 'sections-loading' }, { key: 'sections-loading-2', type: 'sections-loading' });
    }
    sections.forEach((section, index) => {
      // Only a curated first section leads with a hero; never a pick the app makes.
      const hero = index === 0 && section.template === 'CURATED_LIST' && section.items.length > 0;
      if (hero) result.push({ key: `hero:${section.key}`, type: 'hero', section });
      if (!hero || section.items.length > 1) {
        result.push({ key: section.key, type: 'section', section, skipFirst: hero });
      }
    });
    if (sectionsState.phase === 'error' && sectionsState.error && !sections.length && listState.items.length) {
      result.push({ key: 'sections-error', type: 'sections-error', error: sectionsState.error });
    }
    const empty = listState.phase === 'ready' && !listState.items.length;
    if (empty && !sections.length && !hasMarketV2Filters(listState.filters)) {
      result.push({ key: 'market-empty', type: 'market-empty' });
      return result;
    }
    result.push({ key: 'catalogue-header', type: 'catalogue-header' });
    if (listState.phase === 'loading' || listState.phase === 'idle') {
      result.push({ key: 'catalogue-loading', type: 'catalogue-loading' });
    } else if (listState.phase === 'error' && listState.error) {
      result.push({ key: 'catalogue-error', type: 'catalogue-error', error: listState.error });
    } else if (empty) {
      result.push({ key: 'catalogue-empty', type: 'catalogue-empty' });
    } else {
      chunkMarketV2Rows(listState.items, columns).forEach((items, index) => {
        result.push({ key: `grid:${items.map(marketV2ItemKey).join('|')}`, type: 'grid', items, start: index * columns });
      });
      if (!listState.hasNextPage && !listState.restored) result.push({ key: 'catalogue-end', type: 'catalogue-end' });
    }
    return result;
  }, [columns, listState.error, listState.filters, listState.hasNextPage, listState.items, listState.phase, listState.restored, sectionsState]);

  const retry = useCallback(() => void load(filtersRef.current, sortRef.current), [filtersRef, load, sortRef]);

  const renderRowContent = useCallback((row: Row) => {
      switch (row.type) {
        case 'hero':
          return <MarketV2Hero section={row.section} screenWidth={width} context={cardContext} />;
        case 'section':
          return (
            <MarketV2SectionRow
              section={row.section}
              screenWidth={width}
              context={cardContext}
              impressions={tracker}
              onViewAll={onViewAll}
              skipFirst={row.skipFirst}
            />
          );
        case 'sections-loading':
          return <MarketV2SectionSkeleton screenWidth={width} />;
        case 'sections-error':
          return (
            <View style={styles.inlineState}>
              <AppText variant="small" tone="muted">
                {row.error.message}
              </AppText>
              <Button title="Try again" variant="secondary" size="sm" onPress={retry} />
            </View>
          );
        case 'catalogue-header':
          return (
            <View style={styles.catalogueHeader}>
              <AppText variant="subtitle" accessibilityRole="header">
                All pieces
              </AppText>
              {listState.fallbackCopy ? (
                <AppText variant="caption" tone="muted">
                  {listState.fallbackCopy}
                </AppText>
              ) : null}
            </View>
          );
        case 'grid':
          return (
            <View style={styles.gridRow}>
              {row.items.map((item, index) => (
                <MarketV2Card
                  key={marketV2ItemKey(item)}
                  item={item}
                  rowKey={CATALOGUE_KEY}
                  position={row.start + index}
                  width={gridCardWidth}
                  context={cardContext}
                />
              ))}
            </View>
          );
        case 'catalogue-loading':
          return (
            <View style={styles.inlineState}>
              <MuseLoader size={20} />
            </View>
          );
        case 'catalogue-error':
          return (
            <ScreenState
              compact
              kind={row.error.kind === 'offline' || row.error.kind === 'timeout' ? 'offline' : 'server'}
              message={row.error.message}
              onAction={retry}
            />
          );
        case 'catalogue-empty':
          return (
            <ScreenState
              compact
              kind="noResults"
              title="No pieces match"
              message="Remove a filter, or clear them all to see the whole Market."
              actionLabel="Clear all filters"
              onAction={() => applyFilters({}, sortRef.current)}
            />
          );
        case 'catalogue-end':
          return (
            <View style={styles.inlineState}>
              <AppText variant="smallBold" tone="muted">
                {listState.capped
                  ? 'That is a lot of pieces. Add a filter to narrow them down.'
                  : `You've seen all ${listState.items.length} ${listState.items.length === 1 ? 'piece' : 'pieces'}.`}
              </AppText>
            </View>
          );
        case 'market-empty':
        default:
          return (
            <ScreenState
              compact
              kind="empty"
              emoji={String.fromCodePoint(0x1f3ea)}
              title="The Market opens soon"
              message="Designers are getting their first pieces ready. The Runway is open in the meantime."
              actionLabel="Go to the Runway"
              onAction={() => topLevelNavigate('/' as never)}
            />
          );
      }
  }, [applyFilters, cardContext, gridCardWidth, listState.capped, listState.fallbackCopy, listState.items.length, onViewAll, retry, tracker, width]);

  const renderRow = useCallback(
    ({ item: row }: { item: Row }) => (
      <View style={row.type === 'grid' ? styles.gridSpacing : row.type === 'catalogue-header' ? styles.headerSpacing : styles.sectionSpacing}>
        {renderRowContent(row)}
      </View>
    ),
    [renderRowContent],
  );

  // ── Header ───────────────────────────────────────────────────────────
  const categoryChips = useMemo(
    () => (listState.facets?.categories ?? []).filter((option) => option.count >= 2).slice(0, 12),
    [listState.facets?.categories],
  );
  const selectedAudience = listState.filters.audience ?? [];
  const showBanner = (sectionsState.error || listState.error) && (sectionsState.sections.length || listState.items.length);
  const header = (
    <View style={styles.headerStack}>
      <View style={styles.topRow}>
        <QuickPressable onPress={() => topLevelNavigate('/' as never)} style={styles.logoButton} accessibilityLabel="Go to the Runway">
          <AruMark size={30} />
        </QuickPressable>
        <View style={styles.titleWrap}>
          <AppText variant="title" accessibilityRole="header">
            Market
          </AppText>
        </View>
        <QuickPressable
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Sort and filter the Market"
        >
          <LiquidGlassFill glassRole="control" borderRadius={tokens.radius.md} />
          <AppText variant="subtitle">{FILTER_EMOJI}</AppText>
        </QuickPressable>
      </View>

      <QuickPressable
        onPress={() => drillDownPush({ pathname: '/search', params: { type: 'product' } } as never)}
        style={({ pressed }) => [styles.searchEntry, pressed && styles.pressed]}
        accessibilityRole="search"
        accessibilityLabel="Search the Market"
      >
        <LiquidGlassFill glassRole="control" borderRadius={tokens.radius.lg} />
        <AppText variant="body" tone="muted">
          {SEARCH_EMOJI}
        </AppText>
        <AppText variant="bodyBold" tone="muted" numberOfLines={1}>
          Search pieces, designers, styles
        </AppText>
      </QuickPressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <FilterChip label="All" selected={selectedAudience.length === 0} onPress={() => toggleAudience(null)} />
        {AUDIENCES.map((audience) => (
          <FilterChip
            key={audience}
            label={MARKET_V2_AUDIENCE_LABELS[audience]}
            selected={selectedAudience.includes(audience)}
            onPress={() => toggleAudience(audience)}
          />
        ))}
      </ScrollView>

      {categoryChips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categoryChips.map((option) => (
            <FilterChip
              key={option.value}
              kind="link"
              label={option.label}
              count={option.count}
              onPress={() => openMarketV2Catalogue(option.label, { ...listState.filters, categoryIds: [option.value] })}
            />
          ))}
        </ScrollView>
      ) : null}

      {applied.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {applied.map((entry) => (
            <FilterChip key={entry.id} kind="remove" label={entry.label} onPress={() => applyFilters(entry.without, sortRef.current)} />
          ))}
          <FilterChip kind="link" label="Clear all" onPress={() => applyFilters({}, sortRef.current)} />
        </ScrollView>
      ) : null}

      {listState.notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <LiquidGlassFill glassRole="brandSoft" borderRadius={tokens.radius.full} />
          <AppText variant="smallBold">{listState.notice}</AppText>
          <QuickPressable onPress={() => list.dismissNotice()} accessibilityLabel="Dismiss" hitSlop={tokens.spacing.sm}>
            <AppText variant="smallBold" tone="primary">
              OK
            </AppText>
          </QuickPressable>
        </View>
      ) : null}
      {(sectionsState.restored || listState.restored) && !showBanner ? (
        <AppText variant="smallBold" tone="muted" accessibilityLiveRegion="polite">
          Updating…
        </AppText>
      ) : null}
      {showBanner ? (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <AppText variant="smallBold" tone="muted">
            {(sectionsState.error ?? listState.error)?.kind === 'offline'
              ? 'You are offline. Showing what was loaded before.'
              : "Couldn't refresh the Market."}
          </AppText>
          <Button title="Retry" variant="secondary" size="xs" onPress={retry} />
        </View>
      ) : null}
    </View>
  );

  const loadingShell = listState.phase === 'loading' && sectionsState.phase === 'loading';
  useScreenArrival('tabs→market');
  useSkeletonTiming(loadingShell, 'tabs→market');
  useEffect(() => {
    if (!loadingShell) navPerf.dataReady('tabs→market');
  }, [loadingShell]);

  const onEndReached = useCallback(() => void list.more(), [list]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListFooterComponent={
          listState.loadingMore ? (
            <View style={styles.inlineState}>
              <MuseLoader size={20} />
            </View>
          ) : listState.moreError ? (
            <View style={styles.inlineState}>
              <AppText variant="small" tone="muted">
                {listState.moreError.message}
              </AppText>
              <Button title="Try again" variant="secondary" size="sm" onPress={onEndReached} />
            </View>
          ) : null
        }
        contentContainerStyle={[styles.content, { paddingBottom: standardScreenBottomPadding + tokens.spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        viewabilityConfig={MARKET_V2_VIEWABILITY}
        onViewableItemsChanged={onViewableRows}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={7}
        keyboardDismissMode="on-drag"
      />
      <MarketV2FilterSheet
        visible={sheetOpen}
        filters={listState.filters}
        sort={listState.sort}
        sortMenu={listState.sortMenu}
        defaultSort={listState.defaultSort}
        facets={listState.facets}
        facetsLoading={listState.pending && !listState.facets}
        facetsError={listState.facets ? null : listState.error}
        onRetryFacets={retry}
        onClose={() => setSheetOpen(false)}
        onApply={(filters, sort) => {
          setSheetOpen(false);
          applySort(filters, sort);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingTop: tokens.spacing.lg,
  },
  sectionSpacing: {
    marginBottom: tokens.spacing['3xl'],
  },
  headerSpacing: {
    marginBottom: tokens.spacing.md,
  },
  gridSpacing: {
    marginBottom: MARKET_V2_CARD_GAP,
  },
  headerStack: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
    paddingTop: tokens.spacing.xs,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  topRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  logoButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchEntry: {
    minHeight: 48,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  chipRow: {
    gap: tokens.spacing.sm,
    paddingRight: MARKET_V2_SIDE_PADDING,
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
  catalogueHeader: {
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
    gap: tokens.spacing.xs,
  },
  gridRow: {
    flexDirection: 'row',
    gap: MARKET_V2_CARD_GAP,
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
  },
  inlineState: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: MARKET_V2_SIDE_PADDING,
  },
  pressed: {
    opacity: 0.8,
  },
});
