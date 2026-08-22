import type { MarketContentItem } from '@/src/features/market/types';

/**
 * "Adire Casual" — matching and batched rotation.
 *
 * Kept as plain functions with no React and no network so the rules can be
 * reasoned about (and tested) on their own. The screen decides WHERE this
 * renders; this file decides WHAT is in it and HOW OFTEN each piece shows.
 */

/** Word-boundary match, so "adire" does not fire on an unrelated substring. */
const ADIRE_PATTERN = /\badire\b/i;

/** Items per batch. One batch is what the market row shows at a time. */
export const ADIRE_BATCH_SIZE = 8;

/**
 * How many times one item may appear across batches before it is held back.
 *
 * A rotation with no cap degenerates into the same few strong items on every
 * pass, which is what makes a section feel dead on the second visit.
 */
export const ADIRE_BASE_EXPOSURE_CAP = 2;

/**
 * Extra appearances an item earns once it has sold at all.
 *
 * Reads with `ADIRE_PURCHASES_PER_EXTRA_EXPOSURE` below: a selling item goes
 * from 2 appearances to 4, and then earns one more for every five purchases on
 * top of that.
 */
export const ADIRE_PURCHASE_EXPOSURE_BONUS = 2;
export const ADIRE_PURCHASES_PER_EXTRA_EXPOSURE = 5;

/**
 * How short a batch may run before items that have already hit their cap are
 * allowed back in to finish it.
 *
 * The cap is a preference, not a wall: a half-empty row is worse for a shopper
 * than seeing a good piece a third time. Below this many remaining slots the
 * rotation tops up from the over-cap pool, least-shown first.
 */
export const ADIRE_TOPUP_THRESHOLD = 3;

type AdireRecord = Record<string, unknown>;

const asStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(asStrings);
  if (value && typeof value === 'object') {
    return Object.values(value as AdireRecord).flatMap(asStrings);
  }
  return [];
};

const mentionsAdire = (values: unknown[]): boolean =>
  values.flatMap(asStrings).some((text) => ADIRE_PATTERN.test(text));

/**
 * Fields that CLASSIFY an item, as opposed to fields that merely describe it.
 *
 * A tag, a category, a fabric or a style detail is a brand stating what the
 * piece IS. That is the only kind of claim strong enough to put something in a
 * section named after a fabric.
 */
const CLASSIFICATION_FIELDS = [
  'tags',
  'tagList',
  'category',
  'categories',
  'categoryName',
  'categorySlug',
  'styleDetails',
  'style',
  'styleTags',
  'fabric',
  'fabricType',
  'material',
  'materials',
  'attributes',
] as const;

/**
 * Deliberately NOT the description.
 *
 * "Pairs beautifully with adire" is a sentence about something else. Matching
 * free prose would fill a section named "Adire Casual" with items that only
 * mention adire, which is precisely the failure this section cannot afford —
 * the name is a promise about every card under it.
 *
 * The title counts because naming a piece "Adire Casual Shirt" is a claim, not
 * a passing reference.
 */
const NAMING_FIELDS = ['title', 'name', 'productName'] as const;

const readFields = (source: AdireRecord, fields: readonly string[]): unknown[] =>
  fields.map((field) => source[field]).filter((value) => value !== undefined && value !== null);

/** The payload plus whatever it wraps, so nested shapes are checked too. */
const adireScopes = (item: unknown): AdireRecord[] => {
  if (!item || typeof item !== 'object') return [];
  const record = item as AdireRecord;
  return [record, record.product, record.design, record.collection, record.availability]
    .filter((entry): entry is AdireRecord => Boolean(entry) && typeof entry === 'object');
};

export type AdireMatchReason = 'classification' | 'title' | null;

/**
 * Why an item qualifies — or null when it does not.
 *
 * Exposed rather than folded into a boolean so the reason can be logged or
 * asserted in tests: a section that quietly widens its own definition is very
 * hard to notice from the outside.
 */
export function adireMatchReason(item: unknown): AdireMatchReason {
  const scopes = adireScopes(item);
  if (scopes.length === 0) return null;

  if (scopes.some((scope) => mentionsAdire(readFields(scope, CLASSIFICATION_FIELDS)))) {
    return 'classification';
  }
  if (scopes.some((scope) => mentionsAdire(readFields(scope, NAMING_FIELDS)))) {
    return 'title';
  }
  return null;
}

export function matchesAdire(item: unknown): boolean {
  return adireMatchReason(item) !== null;
}

/** The tag/category value the API is queried with for adire content. */
export const ADIRE_QUERY_TERM = 'adire';

export function filterAdireItems<T>(items: T[]): T[] {
  return items.filter((item) => matchesAdire(item));
}

const readCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Purchases recorded against an item, wherever the payload keeps them.
 *
 * Different item shapes report this under different names; a missing count is
 * zero rather than an error, which simply means the item earns no bonus.
 */
export function readPurchaseCount(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;
  const record = item as Record<string, unknown>;
  const scopes = [record, record.product, record.design, record.stats, record.metrics].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object',
  );
  for (const scope of scopes) {
    const direct =
      readCount(scope.purchaseCount) ||
      readCount(scope.purchases) ||
      readCount(scope.ordersCount) ||
      readCount(scope.soldCount) ||
      readCount(scope.salesCount);
    if (direct > 0) return direct;
  }
  return 0;
}

/**
 * How many times this item may appear.
 *
 * Base cap, plus a flat bonus once it has sold at all, plus one more per five
 * purchases. So: no sales = 2 appearances, any sales = 4, and a piece with 20
 * purchases = 8.
 */
export function exposureCapFor(item: unknown): number {
  const purchases = readPurchaseCount(item);
  if (purchases <= 0) return ADIRE_BASE_EXPOSURE_CAP;
  return (
    ADIRE_BASE_EXPOSURE_CAP +
    ADIRE_PURCHASE_EXPOSURE_BONUS +
    Math.floor(purchases / ADIRE_PURCHASES_PER_EXTRA_EXPOSURE)
  );
}

export type AdireBatchState = {
  /** Appearances so far, keyed the same way the caller keys its items. */
  shownCounts: Record<string, number>;
};

export function createAdireBatchState(): AdireBatchState {
  return { shownCounts: {} };
}

/**
 * Builds one batch and records the exposures it used.
 *
 * The order is deliberate: least-shown first, so the rotation spreads before it
 * repeats, and ties keep the pool's own order (which is the ranking the caller
 * handed in). Items at or over their cap are held back — until holding them
 * back would leave the batch short, at which point the least-shown of them fill
 * the remainder rather than shipping a stub row.
 *
 * `state` is mutated, because a batch sequence is a running tally; call
 * `createAdireBatchState()` to start over.
 */
export function buildAdireBatch<T>(
  pool: T[],
  keyOf: (item: T) => string,
  state: AdireBatchState,
  batchSize: number = ADIRE_BATCH_SIZE,
): T[] {
  if (pool.length === 0 || batchSize <= 0) return [];

  const withMeta = pool.map((item, index) => ({
    item,
    index,
    key: keyOf(item),
    shown: state.shownCounts[keyOf(item)] ?? 0,
    cap: exposureCapFor(item),
  }));

  const byLeastShown = (
    a: { shown: number; index: number },
    b: { shown: number; index: number },
  ) => (a.shown === b.shown ? a.index - b.index : a.shown - b.shown);

  const underCap = withMeta.filter((entry) => entry.shown < entry.cap).sort(byLeastShown);
  const chosen = underCap.slice(0, batchSize);

  /*
   * Top-up. `ADIRE_TOPUP_THRESHOLD` is the point at which a short batch is the
   * bigger problem: with only a couple of slots left unfilled, repeating a
   * strong piece reads as a healthy row, while a gap reads as broken.
   */
  const remaining = batchSize - chosen.length;
  if (remaining > 0 && remaining <= Math.max(ADIRE_TOPUP_THRESHOLD, batchSize)) {
    const chosenKeys = new Set(chosen.map((entry) => entry.key));
    const overCap = withMeta
      .filter((entry) => !chosenKeys.has(entry.key) && entry.shown >= entry.cap)
      .sort(byLeastShown)
      .slice(0, remaining);
    chosen.push(...overCap);
  }

  chosen.forEach((entry) => {
    state.shownCounts[entry.key] = (state.shownCounts[entry.key] ?? 0) + 1;
  });

  return chosen.map((entry) => entry.item);
}

/** Convenience for screens that want several batches at once. */
export function buildAdireBatches<T>(
  pool: T[],
  keyOf: (item: T) => string,
  batchCount: number,
  batchSize: number = ADIRE_BATCH_SIZE,
): T[][] {
  const state = createAdireBatchState();
  const batches: T[][] = [];
  for (let index = 0; index < batchCount; index += 1) {
    const batch = buildAdireBatch(pool, keyOf, state, batchSize);
    if (batch.length === 0) break;
    batches.push(batch);
  }
  return batches;
}

export type AdireMarketItem = MarketContentItem;
