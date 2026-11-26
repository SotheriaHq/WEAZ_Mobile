/**
 * One server-ordered Market list (the catalogue, or a See All section).
 *
 * Framework-free so the paging rules can be exercised in a plain Node test:
 * the screens read it through `useSyncExternalStore`.
 *
 * - The first page of a list fixes its filters, sort and guest session. Every
 *   continuation repeats them, because the signed cursor is bound to all three.
 * - A newer request always wins: older responses are discarded, and requests
 *   that lost are aborted on the network.
 * - Pages merge by `entityType:id`, so a card that moved between pages of a
 *   live list is shown once. A re-anchored page replaces the list and raises
 *   the notice the server sent ("Updated", "Prices updated").
 * - A failed refresh keeps what is on screen; only an empty list shows an error.
 * - An account change (session epoch) drops every response still in flight.
 */
import {
  classifyMarketV2Error,
  marketV2FallbackCopy,
  mergeMarketV2Page,
  retainMarketV2SortMenu,
  type MarketV2ErrorInfo,
  type MarketV2Facets,
  type MarketV2Filters,
  type MarketV2Item,
  type MarketV2ListPage,
  type MarketV2ListRequest,
  type MarketV2Sort,
} from './marketV2Contract';

/** Pages kept in memory for one list. Past it the list asks for filters instead. */
export const MARKET_V2_LIST_ITEM_CAP = 480;

export type MarketV2ListFetch<P extends MarketV2ListPage = MarketV2ListPage> = (
  request: MarketV2ListRequest,
  signal: AbortSignal,
) => Promise<P>;

export type MarketV2ListState = {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  /** A first page is on its way; what is on screen stays until it lands. */
  pending: boolean;
  items: MarketV2Item[];
  filters: MarketV2Filters;
  /** The sort asked for; null is the list's own default order. */
  sort: MarketV2Sort | null;
  /** The order the server actually used ('source' for a curated list). */
  effectiveSort: string | null;
  /** The order the server uses when no sort is asked for, once known. */
  defaultSort: string | null;
  sortMenu: MarketV2Sort[];
  hasNextPage: boolean;
  loadingMore: boolean;
  moreError: MarketV2ErrorInfo | null;
  error: MarketV2ErrorInfo | null;
  notice: string | null;
  fallbackCopy: string | null;
  facets: MarketV2Facets | null;
  /** Shown from a saved copy; it cannot page until a refresh lands. */
  restored: boolean;
  /** The list stopped at the memory cap, not at the end of the results. */
  capped: boolean;
  savedAt: number | null;
};

export type MarketV2LoadOutcome =
  | { kind: 'ok' }
  | { kind: 'error'; error: MarketV2ErrorInfo; status: number | null }
  | { kind: 'superseded' };

type Options<P extends MarketV2ListPage> = {
  fetch: MarketV2ListFetch<P>;
  now: () => number;
  /** Read when a list starts; repeated on every continuation. */
  guestSession: () => string | null;
  /** Bumped by sign-in and sign-out; a response from another session is dropped. */
  sessionEpoch: () => number;
  includeFacets: boolean;
  /** Called with each accepted page (section titles, telemetry context). */
  onPage?: (page: P, reset: boolean) => void;
  limit?: number;
};

const initialState = (filters: MarketV2Filters, sort: MarketV2Sort | null): MarketV2ListState => ({
  phase: 'idle',
  pending: false,
  items: [],
  filters,
  sort,
  effectiveSort: null,
  defaultSort: null,
  sortMenu: [],
  hasNextPage: false,
  loadingMore: false,
  moreError: null,
  error: null,
  notice: null,
  fallbackCopy: null,
  facets: null,
  restored: false,
  capped: false,
  savedAt: null,
});

const statusOf = (error: unknown): number | null => {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
};

export class MarketV2ListController<P extends MarketV2ListPage = MarketV2ListPage> {
  private state: MarketV2ListState;
  private readonly listeners = new Set<() => void>();
  private cursor: string | null = null;
  private guest: string | null = null;
  private generation = 0;
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(
    private readonly options: Options<P>,
    filters: MarketV2Filters = {},
    sort: MarketV2Sort | null = null,
  ) {
    this.state = initialState(filters, sort);
  }

  getState = (): MarketV2ListState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<MarketV2ListState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.generation += 1;
    return { controller, generation: this.generation, epoch: this.options.sessionEpoch() };
  }

  private current(token: { generation: number; epoch: number }) {
    return !this.disposed && token.generation === this.generation && token.epoch === this.options.sessionEpoch();
  }

  /** Content from a saved copy: visible at once, never paged until refreshed. */
  restore(content: {
    items: MarketV2Item[];
    facets: MarketV2Facets | null;
    sortMenu: MarketV2Sort[];
    effectiveSort: string | null;
    savedAt: number;
  }) {
    this.cursor = null;
    this.set({
      phase: 'ready',
      items: content.items,
      facets: content.facets,
      sortMenu: content.sortMenu,
      effectiveSort: content.effectiveSort,
      savedAt: content.savedAt,
      hasNextPage: false,
      restored: true,
    });
  }

  /**
   * Start the list again from its first page. What is on screen stays until
   * the answer arrives, so a filter change never flashes an empty grid.
   */
  async load(filters: MarketV2Filters, sort: MarketV2Sort | null, notice: string | null = null): Promise<MarketV2LoadOutcome> {
    const token = this.begin();
    this.cursor = null;
    this.guest = this.options.guestSession();
    this.set({
      phase: this.state.items.length ? 'ready' : 'loading',
      pending: true,
      filters,
      sort,
      error: null,
      moreError: null,
      loadingMore: false,
      notice,
    });
    try {
      const page = await this.options.fetch(
        {
          filters,
          sort,
          includeFacets: this.options.includeFacets,
          limit: this.options.limit,
          guestSession: this.guest,
        },
        token.controller.signal,
      );
      if (!this.current(token)) return { kind: 'superseded' };
      this.accept(page, 'reset', notice);
      return { kind: 'ok' };
    } catch (error) {
      if (!this.current(token)) return { kind: 'superseded' };
      const info = classifyMarketV2Error(error);
      if (info.kind === 'aborted') return { kind: 'superseded' };
      this.set({ pending: false });
      if (info.kind === 'unsupported-sort' && sort !== null) {
        // The sort lost its evidence since the menu was built: show the
        // list's own order and say why, instead of an error.
        return this.load(filters, null, 'That sort is not available right now. Showing the usual order.');
      }
      this.set({
        phase: this.state.items.length ? 'ready' : 'error',
        error: info,
      });
      return { kind: 'error', error: info, status: statusOf(error) };
    }
  }

  refresh(): Promise<MarketV2LoadOutcome> {
    return this.load(this.state.filters, this.state.sort);
  }

  /** The next page; a no-op while one is loading, at the end, or on restored content. */
  async more(): Promise<void> {
    const { hasNextPage, loadingMore, restored, phase, pending } = this.state;
    if (!hasNextPage || loadingMore || restored || pending || phase !== 'ready' || !this.cursor) return;
    const cursor = this.cursor;
    const token = this.begin();
    this.set({ loadingMore: true, moreError: null });
    try {
      const page = await this.options.fetch(
        {
          filters: this.state.filters,
          sort: this.state.sort,
          cursor,
          limit: this.options.limit,
          guestSession: this.guest,
        },
        token.controller.signal,
      );
      if (!this.current(token)) return;
      this.accept(page, 'append', null);
    } catch (error) {
      if (!this.current(token)) return;
      const info = classifyMarketV2Error(error);
      if (info.kind === 'aborted') return;
      if (info.kind === 'invalid-cursor') {
        // The server no longer honours this cursor (rollback, expiry): start
        // again from the top with the same choices.
        this.set({ loadingMore: false });
        await this.load(this.state.filters, this.state.sort, 'Updated');
        return;
      }
      this.set({ loadingMore: false, moreError: info });
    }
  }

  dismissNotice() {
    if (this.state.notice) this.set({ notice: null });
  }

  dispose() {
    this.disposed = true;
    this.controller?.abort();
    this.listeners.clear();
  }

  private accept(page: P, mode: 'reset' | 'append', notice: string | null) {
    const merged = mergeMarketV2Page(this.state.items, page, mode);
    const replaced = mode === 'reset' || merged.reanchored;
    const capped = merged.items.length >= MARKET_V2_LIST_ITEM_CAP;
    this.cursor = capped ? null : page.nextCursor;
    const firstPage = replaced;
    const sortMenu = retainMarketV2SortMenu(this.state.sortMenu, page.availableSorts, firstPage);
    this.set({
      phase: 'ready',
      pending: mode === 'append' ? this.state.pending : false,
      items: capped ? merged.items.slice(0, MARKET_V2_LIST_ITEM_CAP) : merged.items,
      hasNextPage: !capped && page.hasNextPage && Boolean(page.nextCursor),
      capped: capped && page.hasNextPage,
      loadingMore: false,
      moreError: null,
      error: null,
      restored: false,
      savedAt: this.options.now(),
      effectiveSort: page.effectiveSort ?? this.state.effectiveSort,
      defaultSort: this.state.sort === null && firstPage ? page.effectiveSort : this.state.defaultSort,
      sortMenu,
      facets: page.facets ?? this.state.facets,
      fallbackCopy: firstPage ? marketV2FallbackCopy(page) : this.state.fallbackCopy,
      notice: merged.reanchored ? page.notice ?? 'Updated' : notice ?? (firstPage && page.notice ? page.notice : this.state.notice),
    });
    this.options.onPage?.(page, replaced);
  }
}
