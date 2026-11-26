/**
 * Whether this phone shows the server-composed Market or the retained one.
 *
 * The routes are default-off on the server, surface by surface. A 404 means
 * "not enabled here": the retained Market takes over and the answer is kept
 * (on disk) for 30 minutes, so a cold start does not spend two requests to
 * learn it again. A 503 with nothing on screen is "temporarily unavailable":
 * the retained Market takes over for two minutes, doubling on each repeat up
 * to 30 minutes, and that answer is never persisted.
 *
 * The answer only changes when the screen asks (`reconsider` on focus), never
 * on a timer: a phone left on Market never flips under the reader, and two
 * renderers can never take turns in a loop.
 */

export type MarketV2Mode = 'v2' | 'legacy';
export type MarketV2Outcome = 'ok' | 'not-enabled' | 'unavailable';

export const MARKET_V2_NOT_ENABLED_MS = 30 * 60 * 1000;
export const MARKET_V2_UNAVAILABLE_BASE_MS = 2 * 60 * 1000;

type Persisted = { until: number };

type Store = {
  mode: MarketV2Mode;
  until: number;
  strikes: number;
  sections: Map<string, number>;
};

export type MarketV2AvailabilityOptions = {
  now: () => number;
  read: () => unknown;
  write: (value: Persisted | null) => void;
};

export function createMarketV2Availability(options: MarketV2AvailabilityOptions) {
  const listeners = new Set<() => void>();
  const store: Store = { mode: 'v2', until: 0, strikes: 0, sections: new Map() };
  let hydrated = false;

  const emit = () => listeners.forEach((listener) => listener());

  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    const stored = options.read() as Partial<Persisted> | null;
    const until = typeof stored?.until === 'number' && Number.isFinite(stored.until) ? stored.until : 0;
    const now = options.now();
    // A remembered answer from a future clock is not trusted.
    if (until > now && until - now <= MARKET_V2_NOT_ENABLED_MS) {
      store.mode = 'legacy';
      store.until = until;
    }
  };

  return {
    /** Stable between calls; changes only through `report` and `reconsider`. */
    getMode(): MarketV2Mode {
      hydrate();
      return store.mode;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** On focus: a retained Market whose wait has passed tries the server again. */
    reconsider() {
      hydrate();
      if (store.mode === 'legacy' && options.now() >= store.until) {
        store.mode = 'v2';
        emit();
      }
    },
    report(outcome: MarketV2Outcome) {
      hydrate();
      const now = options.now();
      if (outcome === 'ok') {
        const changed = store.mode !== 'v2' || store.strikes !== 0;
        store.strikes = 0;
        store.until = 0;
        store.mode = 'v2';
        options.write(null);
        if (changed) emit();
        return;
      }
      if (outcome === 'not-enabled') {
        store.until = now + MARKET_V2_NOT_ENABLED_MS;
        options.write({ until: store.until });
      } else {
        store.until = now + Math.min(MARKET_V2_NOT_ENABLED_MS, MARKET_V2_UNAVAILABLE_BASE_MS * 2 ** store.strikes);
        store.strikes += 1;
      }
      if (store.mode !== 'legacy') {
        store.mode = 'legacy';
        emit();
      }
    },
    /** A See All key the server answered with the retained reader. */
    rememberLegacySection(key: string) {
      store.sections.set(key, options.now() + MARKET_V2_NOT_ENABLED_MS);
      while (store.sections.size > 64) store.sections.delete(store.sections.keys().next().value!);
    },
    isLegacySection(key: string): boolean {
      const until = store.sections.get(key);
      if (until === undefined) return false;
      if (until > options.now()) return true;
      store.sections.delete(key);
      return false;
    },
  };
}

export type MarketV2Availability = ReturnType<typeof createMarketV2Availability>;

/**
 * Turns the two home answers into an availability outcome. Either route
 * answering 404 means the server has not enabled the Market here. A 503 counts
 * only when nothing could be shown; with content on screen the reader keeps it
 * and is offered a retry.
 */
export function marketV2HomeOutcome(input: {
  statuses: ReadonlyArray<number | null | 'ok'>;
  hasContent: boolean;
}): MarketV2Outcome | null {
  if (input.statuses.some((status) => status === 404)) return 'not-enabled';
  if (input.statuses.every((status) => status === 'ok')) return 'ok';
  if (!input.hasContent && input.statuses.some((status) => status === 503)) return 'unavailable';
  return null;
}
