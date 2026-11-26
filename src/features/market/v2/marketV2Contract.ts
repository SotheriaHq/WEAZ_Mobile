/**
 * Market read contract for the server-composed Market (page, catalogue,
 * section See All and facets).
 *
 * Pure module: no React Native, no network. The screens and the API client
 * use it, and `scripts/test-market-v2-native-contract.js` runs it against the
 * backend's own filter parser so the two cannot drift apart silently.
 *
 * Decisions this module encodes:
 * - The server owns order. Sections render in the order `/market/page` returns
 *   them, with the titles it sends. Loaded pages are never re-sorted here and
 *   no client mixer or popularity score is applied.
 * - A list is merged by `entityType:id`; a card that moves between pages of a
 *   live list is shown once.
 * - A re-anchored page (`pagination.reanchored`) replaces the list. It is the
 *   start of a new order, so appending it would repeat or skip cards.
 * - A continuation repeats the first request's filters and sort exactly:
 *   the signed cursor is bound to both.
 * - Restored data belongs to one viewer, is at most 48 hours old and is always
 *   refreshed. It never carries a cursor, an expired media address or a claim
 *   (low stock, trending) that its own six-hour epoch no longer supports.
 */

export type MarketV2Sort =
  | 'newest'
  | 'popular'
  | 'trending'
  | 'price_asc'
  | 'price_desc'
  | 'best_selling'
  | 'most_saved';

export type MarketV2Audience = 'MEN' | 'WOMEN' | 'UNISEX';
export type MarketV2Fulfilment = 'READY_TO_WEAR' | 'MADE_TO_ORDER';

export type MarketV2Filters = {
  audience?: MarketV2Audience[];
  categoryIds?: string[];
  categoryTypeIds?: string[];
  brandIds?: string[];
  tags?: string[];
  colors?: string[];
  sizes?: string[];
  dimensions?: Record<string, string[]>;
  price?: { min?: number; max?: number };
  onSale?: boolean;
  fulfilment?: MarketV2Fulfilment;
  inStockOnly?: boolean;
};

export type MarketV2ListFilterKey =
  | 'audience'
  | 'categoryIds'
  | 'categoryTypeIds'
  | 'brandIds'
  | 'tags'
  | 'colors'
  | 'sizes';

export type MarketV2Item = {
  id: string;
  sourceId: string;
  sourceType: string;
  entityType: 'PRODUCT' | 'COLLECTION' | 'DESIGN' | 'BRAND' | 'CATEGORY';
  title: string;
  subtitle: string | null;
  description: string | null;
  brand: { id: string | null; name: string | null; logoUrl: string | null } | null;
  media: {
    url: string | null;
    thumbnailUrl: string | null;
    fileId: string | null;
    width: number | null;
    height: number | null;
  } | null;
  price: {
    amount: number | null;
    saleAmount: number | null;
    effectiveAmount: number | null;
    currency: string;
  } | null;
  priceRange: { min: number | null; max: number | null; currency: string } | null;
  availability: {
    totalStock: number | null;
    customOrderEnabled: boolean;
    standardCheckoutEnabled: boolean;
    isOnSale: boolean;
  } | null;
  category: { id: string | null; slug: string | null; name: string | null } | null;
  tags: string[];
  stats: { views: number | null; threads: number | null; products: number | null };
  target: { type: string; id: string | null; key: string | null; route: string | null };
  createdAt: string | null;
  /** The slot the server gave this card in its section; null in plain lists. */
  position: number | null;
};

export type MarketV2Section = {
  key: string;
  template: string | null;
  title: string;
  subtitle: string | null;
  /** Why this section is here, when the server has an honest reason to give. */
  reason: string | null;
  layout: string;
  /** Ranking policy and its version, e.g. `trend@2`; echoed on signals. */
  policyVersion: string | null;
  personal: boolean;
  items: MarketV2Item[];
  viewAll: { enabled: boolean; label: string; availableSorts: MarketV2Sort[] };
};

export type MarketV2PageResponse = {
  generatedAt: string | null;
  epoch: string | null;
  partial: boolean;
  sections: MarketV2Section[];
};

export type MarketV2FacetOption = {
  value: string;
  label: string;
  count: number;
  disabled: boolean;
  /** Garment types name the category they sit under. */
  categoryId: string | null;
};

export type MarketV2FacetDimension = {
  key: string;
  name: string;
  /** A single-choice detail replaces its value; the server refuses two. */
  isMulti: boolean;
  values: MarketV2FacetOption[];
};

export type MarketV2PriceBand = { min: number; max: number; count: number };

export type MarketV2Facets = {
  categories: MarketV2FacetOption[];
  categoryTypes: MarketV2FacetOption[];
  brands: MarketV2FacetOption[];
  tags: MarketV2FacetOption[];
  colors: MarketV2FacetOption[];
  sizes: MarketV2FacetOption[];
  audience: MarketV2FacetOption[];
  fulfilment: MarketV2FacetOption[];
  onSale: MarketV2FacetOption[];
  inStockOnly: MarketV2FacetOption[];
  dimensions: MarketV2FacetDimension[];
  price: { min: number; max: number; currency: string; bands: MarketV2PriceBand[] } | null;
  /** Custom-fit pieces can match any size; the sheet says so beside sizes. */
  customFitAnySize: boolean;
  /** Filters the server shortened, by wire key: how many of how many are listed. */
  truncation: Record<string, { returned: number; available: number }>;
};

export type MarketV2Notice = 'Updated' | 'Prices updated' | null;

export type MarketV2ListPage = {
  items: MarketV2Item[];
  hasNextPage: boolean;
  nextCursor: string | null;
  reanchored: boolean;
  /** Sorts the server will accept for this list; empty when it offers none. */
  availableSorts: Array<MarketV2Sort | 'source'>;
  requestedSort: string | null;
  effectiveSort: string | null;
  notice: MarketV2Notice;
  fallbackReason: string | null;
  asOf: string | null;
  total: number | null;
  facets: MarketV2Facets | null;
};

export type MarketV2SectionPage = MarketV2ListPage & {
  section: {
    key: string;
    title: string;
    subtitle: string | null;
    layout: string;
    sourceType: string;
  };
};

// ─── Sorts ────────────────────────────────────────────────────────────────

export const MARKET_V2_SORTS: readonly MarketV2Sort[] = [
  'popular',
  'trending',
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
  'most_saved',
];

const SORT_LABELS: Record<MarketV2Sort | 'source', string> = {
  popular: 'Popular',
  trending: 'Trending',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  best_selling: 'Best selling',
  most_saved: 'Most saved',
  source: 'Featured order',
};

export function marketV2SortLabel(sort: string | null | undefined): string {
  if (!sort) return SORT_LABELS.popular;
  return (SORT_LABELS as Record<string, string>)[sort] ?? SORT_LABELS.source;
}

export function isMarketV2Sort(value: unknown): value is MarketV2Sort {
  return typeof value === 'string' && (MARKET_V2_SORTS as readonly string[]).includes(value);
}

/**
 * The sort menu shown for a list.
 *
 * A continuation of an ordered sort lists only the always-available sorts, so
 * the menu is taken from the first page and kept. Evidence-backed sorts never
 * disappear because a later page omitted them. Order follows the server.
 */
export function retainMarketV2SortMenu(
  firstPageSorts: ReadonlyArray<string>,
  pageSorts: ReadonlyArray<string>,
  isFirstPage: boolean,
): MarketV2Sort[] {
  const source = isFirstPage ? pageSorts : firstPageSorts.length ? firstPageSorts : pageSorts;
  const seen = new Set<string>();
  const menu: MarketV2Sort[] = [];
  for (const sort of source) {
    if (!isMarketV2Sort(sort) || seen.has(sort)) continue;
    seen.add(sort);
    menu.push(sort);
  }
  return menu;
}

/** Honest wording when the server served another sort than the one asked for. */
export function marketV2FallbackCopy(page: Pick<MarketV2ListPage, 'fallbackReason' | 'requestedSort' | 'effectiveSort'>): string | null {
  if (page.fallbackReason !== 'INSUFFICIENT_EVIDENCE') return null;
  if (!page.effectiveSort || page.effectiveSort === page.requestedSort) return null;
  return `Showing ${marketV2SortLabel(page.effectiveSort).toLowerCase()} first — there is not enough shopping activity yet to rank by ${marketV2SortLabel(page.requestedSort).toLowerCase()}.`;
}

// ─── Filters ──────────────────────────────────────────────────────────────

export const MARKET_V2_FILTER_LIMITS = {
  valuesPerKey: 8,
  valuesTotal: 24,
  maxPrice: 99999999.99,
} as const;

const LIST_WIRE_KEYS: ReadonlyArray<[MarketV2ListFilterKey, string]> = [
  ['audience', 'audience'],
  ['categoryIds', 'category'],
  ['categoryTypeIds', 'type'],
  ['brandIds', 'brand'],
  ['tags', 'tag'],
  ['colors', 'color'],
  ['sizes', 'size'],
];

export const MARKET_V2_AUDIENCE_LABELS: Record<MarketV2Audience, string> = {
  MEN: 'Menswear',
  WOMEN: 'Womenswear',
  UNISEX: 'Unisex',
};

export const MARKET_V2_FULFILMENT_LABELS: Record<MarketV2Fulfilment, string> = {
  READY_TO_WEAR: 'Ready to wear',
  MADE_TO_ORDER: 'Made to order',
};

const uniqueValues = (values: ReadonlyArray<string> | undefined) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values ?? []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const validPrice = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MARKET_V2_FILTER_LIMITS.maxPrice;

/** Drops empty and duplicate values so two equal selections encode the same. */
export function normalizeMarketV2Filters(filters: MarketV2Filters | null | undefined): MarketV2Filters {
  const result: MarketV2Filters = {};
  if (!filters) return result;
  for (const [field] of LIST_WIRE_KEYS) {
    const values = uniqueValues(filters[field] as string[] | undefined);
    if (values.length) (result as Record<string, unknown>)[field] = values;
  }
  const dimensionEntries = Object.entries(filters.dimensions ?? {})
    .map(([key, values]) => [key.trim().toLowerCase(), uniqueValues(values)] as const)
    .filter(([key, values]) => key.length > 0 && values.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (dimensionEntries.length) result.dimensions = Object.fromEntries(dimensionEntries);
  const min = validPrice(filters.price?.min) ? filters.price!.min : undefined;
  const max = validPrice(filters.price?.max) ? filters.price!.max : undefined;
  if (min !== undefined || max !== undefined) {
    result.price = {};
    if (min !== undefined) result.price.min = min;
    if (max !== undefined) result.price.max = max;
  }
  if (filters.onSale) result.onSale = true;
  if (filters.inStockOnly) result.inStockOnly = true;
  if (filters.fulfilment === 'READY_TO_WEAR' || filters.fulfilment === 'MADE_TO_ORDER') {
    result.fulfilment = filters.fulfilment;
  }
  return result;
}

export function countMarketV2FilterValues(filters: MarketV2Filters): number {
  const normalized = normalizeMarketV2Filters(filters);
  let total = 0;
  for (const [field] of LIST_WIRE_KEYS) total += (normalized[field] as string[] | undefined)?.length ?? 0;
  for (const values of Object.values(normalized.dimensions ?? {})) total += values.length;
  if (normalized.price?.min !== undefined) total += 1;
  if (normalized.price?.max !== undefined) total += 1;
  if (normalized.onSale) total += 1;
  if (normalized.inStockOnly) total += 1;
  if (normalized.fulfilment) total += 1;
  return total;
}

export function hasMarketV2Filters(filters: MarketV2Filters): boolean {
  return countMarketV2FilterValues(filters) > 0;
}

/**
 * Why a value cannot be added, or null when it can. The server rejects more
 * than eight values for one filter and more than twenty-four in all, so the
 * sheet stops the selection with a reason instead of sending a request that
 * fails.
 */
export function marketV2FilterLimitReason(filters: MarketV2Filters, field: MarketV2ListFilterKey | `dim.${string}`): string | null {
  const normalized = normalizeMarketV2Filters(filters);
  const current = field.startsWith('dim.')
    ? normalized.dimensions?.[field.slice(4)]?.length ?? 0
    : (normalized[field as MarketV2ListFilterKey] as string[] | undefined)?.length ?? 0;
  if (current >= MARKET_V2_FILTER_LIMITS.valuesPerKey) return 'Choose up to 8 options in one filter.';
  if (countMarketV2FilterValues(normalized) >= MARKET_V2_FILTER_LIMITS.valuesTotal) return 'Choose up to 24 filter options in all.';
  return null;
}

export function priceRangeError(min: number | undefined, max: number | undefined): string | null {
  if (min !== undefined && !validPrice(min)) return 'Enter a valid minimum price.';
  if (max !== undefined && !validPrice(max)) return 'Enter a valid maximum price.';
  if (min !== undefined && max !== undefined && min > max) return 'The minimum price must not be above the maximum.';
  return null;
}

/** Whole naira or kobo-precise input, as the server accepts at most two decimals. */
export function parseMarketV2PriceInput(raw: string): number | undefined | null {
  const value = raw.replace(/[,\s₦]/g, '');
  if (!value) return undefined;
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const parsed = Number(value);
  return validPrice(parsed) ? parsed : null;
}

/**
 * Wire encoding the backend's canonical parser accepts. Lists use one CSV key
 * unless a value contains a comma, in which case each value gets its own
 * `key[]` entry (the two encodings are never mixed for one key). Output order
 * is deterministic, so equal filters produce an equal request.
 */
export function encodeMarketV2Filters(filters: MarketV2Filters): Array<[string, string]> {
  const normalized = normalizeMarketV2Filters(filters);
  const entries: Array<[string, string]> = [];
  const addList = (wire: string, values: ReadonlyArray<string>) => {
    const sorted = [...values].sort();
    if (sorted.some((value) => value.includes(','))) {
      for (const value of sorted) entries.push([`${wire}[]`, value]);
    } else {
      entries.push([wire, sorted.join(',')]);
    }
  };
  for (const [field, wire] of LIST_WIRE_KEYS) {
    const values = normalized[field] as string[] | undefined;
    if (values?.length) addList(wire, values);
  }
  for (const [key, values] of Object.entries(normalized.dimensions ?? {})) addList(`dim.${key}`, values);
  if (normalized.price?.min !== undefined) entries.push(['price.min', String(normalized.price.min)]);
  if (normalized.price?.max !== undefined) entries.push(['price.max', String(normalized.price.max)]);
  if (normalized.onSale) entries.push(['onSale', '1']);
  if (normalized.fulfilment) entries.push(['fulfilment', normalized.fulfilment]);
  if (normalized.inStockOnly) entries.push(['inStockOnly', '1']);
  return entries;
}

export function marketV2FilterSignature(filters: MarketV2Filters): string {
  return encodeMarketV2Filters(filters)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function toggleMarketV2ListValue(filters: MarketV2Filters, field: MarketV2ListFilterKey, value: string): MarketV2Filters {
  const current = (filters[field] as string[] | undefined) ?? [];
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  return normalizeMarketV2Filters({ ...filters, [field]: next });
}

export function toggleMarketV2DimensionValue(
  filters: MarketV2Filters,
  dimension: string,
  value: string,
  isMulti: boolean,
): MarketV2Filters {
  const current = filters.dimensions?.[dimension] ?? [];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : isMulti
      ? [...current, value]
      : [value];
  return normalizeMarketV2Filters({ ...filters, dimensions: { ...(filters.dimensions ?? {}), [dimension]: next } });
}

/**
 * Reads filters back from the encoded form (route params). Unknown keys and
 * values the server would refuse are dropped, so a hand-edited link opens the
 * list with the filters that still make sense instead of failing.
 */
export function decodeMarketV2Filters(encoded: string | null | undefined): MarketV2Filters {
  const lists: Record<string, string[]> = {};
  const dimensions: Record<string, string[]> = {};
  const filters: MarketV2Filters = {};
  const price: { min?: number; max?: number } = {};
  for (const pair of (encoded ?? '').split('&').slice(0, 64)) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(pair.slice(0, at));
      value = decodeURIComponent(pair.slice(at + 1));
    } catch {
      continue;
    }
    const bracket = key.endsWith('[]');
    const base = bracket ? key.slice(0, -2) : key;
    const values = bracket ? [value] : value.split(',');
    const field = LIST_WIRE_KEYS.find(([, wire]) => wire === base)?.[0];
    if (field) {
      lists[field] = [...(lists[field] ?? []), ...values];
    } else if (/^dim\.[a-z0-9][a-z0-9-]{0,79}$/.test(base)) {
      dimensions[base.slice(4)] = [...(dimensions[base.slice(4)] ?? []), ...values];
    } else if (base === 'price.min' || base === 'price.max') {
      const amount = parseMarketV2PriceInput(value);
      if (typeof amount === 'number') price[base === 'price.min' ? 'min' : 'max'] = amount;
    } else if ((base === 'onSale' || base === 'inStockOnly') && value === '1') {
      filters[base] = true;
    } else if (base === 'fulfilment' && (value === 'READY_TO_WEAR' || value === 'MADE_TO_ORDER')) {
      filters.fulfilment = value;
    }
  }
  const audience = (lists.audience ?? []).filter((value): value is MarketV2Audience =>
    Object.prototype.hasOwnProperty.call(MARKET_V2_AUDIENCE_LABELS, value),
  );
  let room = MARKET_V2_FILTER_LIMITS.valuesTotal;
  if (price.min !== undefined && price.max !== undefined && price.min > price.max) delete price.max;
  if (Object.keys(price).length) {
    filters.price = price;
    room -= Object.keys(price).length;
  }
  if (filters.onSale) room -= 1;
  if (filters.inStockOnly) room -= 1;
  if (filters.fulfilment) room -= 1;
  const take = (values: ReadonlyArray<string>) => {
    const kept = uniqueValues(values).slice(0, Math.max(0, Math.min(room, MARKET_V2_FILTER_LIMITS.valuesPerKey)));
    room -= kept.length;
    return kept;
  };
  for (const [field] of LIST_WIRE_KEYS) {
    const values = take(field === 'audience' ? audience : lists[field] ?? []);
    if (values.length) (filters as Record<string, unknown>)[field] = values;
  }
  for (const [key, values] of Object.entries(dimensions)) {
    const kept = take(values);
    if (kept.length) filters.dimensions = { ...(filters.dimensions ?? {}), [key]: kept };
  }
  return normalizeMarketV2Filters(filters);
}

/** The filters as one query string, for route params. */
export function encodeMarketV2FilterParam(filters: MarketV2Filters): string {
  return marketV2QueryString(encodeMarketV2Filters(filters));
}

export type MarketV2AppliedFilter = {
  id: string;
  label: string;
  /** The filters without this value. */
  without: MarketV2Filters;
};

const facetLabel = (options: ReadonlyArray<MarketV2FacetOption> | undefined, value: string) =>
  options?.find((option) => option.value === value)?.label ?? null;

/**
 * Every applied filter as a removable entry, named from the facets. A value
 * whose name is not known yet (facets still loading) is described by its kind
 * rather than shown as an id.
 */
export function describeMarketV2Filters(
  filters: MarketV2Filters,
  facets: MarketV2Facets | null,
  formatPrice: (amount: number) => string,
): MarketV2AppliedFilter[] {
  const applied: MarketV2AppliedFilter[] = [];
  const list = (
    field: MarketV2ListFilterKey,
    options: ReadonlyArray<MarketV2FacetOption> | undefined,
    unnamed: string | null,
  ) => {
    for (const value of (filters[field] as string[] | undefined) ?? []) {
      applied.push({
        id: `${field}:${value}`,
        label: facetLabel(options, value) ?? unnamed ?? value,
        without: toggleMarketV2ListValue(filters, field, value),
      });
    }
  };
  for (const value of filters.audience ?? []) {
    applied.push({
      id: `audience:${value}`,
      label: MARKET_V2_AUDIENCE_LABELS[value],
      without: toggleMarketV2ListValue(filters, 'audience', value),
    });
  }
  list('categoryIds', facets?.categories, 'Category');
  list('categoryTypeIds', facets?.categoryTypes, 'Garment type');
  list('brandIds', facets?.brands, 'Brand');
  list('tags', facets?.tags, null);
  list('colors', facets?.colors, null);
  for (const value of filters.sizes ?? []) {
    applied.push({ id: `sizes:${value}`, label: `Size ${value}`, without: toggleMarketV2ListValue(filters, 'sizes', value) });
  }
  for (const [key, values] of Object.entries(filters.dimensions ?? {})) {
    const dimension = facets?.dimensions.find((entry) => entry.key === key);
    for (const value of values) {
      applied.push({
        id: `dim.${key}:${value}`,
        label: facetLabel(dimension?.values, value) ?? value.replace(/-/g, ' '),
        without: toggleMarketV2DimensionValue(filters, key, value, true),
      });
    }
  }
  if (filters.price) {
    const { min, max } = filters.price;
    applied.push({
      id: 'price',
      label:
        min !== undefined && max !== undefined
          ? `${formatPrice(min)} to ${formatPrice(max)}`
          : min !== undefined
            ? `From ${formatPrice(min)}`
            : `Up to ${formatPrice(max ?? 0)}`,
      without: normalizeMarketV2Filters({ ...filters, price: undefined }),
    });
  }
  if (filters.fulfilment) {
    applied.push({
      id: 'fulfilment',
      label: MARKET_V2_FULFILMENT_LABELS[filters.fulfilment],
      without: normalizeMarketV2Filters({ ...filters, fulfilment: undefined }),
    });
  }
  if (filters.onSale) {
    applied.push({ id: 'onSale', label: 'On sale', without: normalizeMarketV2Filters({ ...filters, onSale: false }) });
  }
  if (filters.inStockOnly) {
    applied.push({ id: 'inStockOnly', label: 'In stock', without: normalizeMarketV2Filters({ ...filters, inStockOnly: false }) });
  }
  return applied;
}

// ─── Requests ─────────────────────────────────────────────────────────────

export const MARKET_V2_PAGE_SECTION_LIMIT = 8;
export const MARKET_V2_LIST_LIMIT = 24;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;
const CURSOR_MAX_LENGTH = 12288;

export function isMarketV2Cursor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= CURSOR_MAX_LENGTH && CURSOR_PATTERN.test(value);
}

export function marketV2QueryString(entries: ReadonlyArray<[string, string]>): string {
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

/** Guests may name their session so hidden items stay hidden; nothing else is accepted. */
const ANONYMOUS_SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function marketV2GuestSession(viewerKey: string, deviceId: string | null | undefined): string | null {
  if (viewerKey !== MARKET_V2_GUEST_VIEWER || !deviceId) return null;
  return ANONYMOUS_SESSION_PATTERN.test(deviceId) ? deviceId : null;
}

const guestEntries = (guestSession: string | null | undefined): Array<[string, string]> =>
  guestSession && ANONYMOUS_SESSION_PATTERN.test(guestSession) ? [['anonymousSessionId', guestSession]] : [];

export function marketV2PageQuery(filters: MarketV2Filters, guestSession?: string | null): Array<[string, string]> {
  return [
    ['limit', String(MARKET_V2_PAGE_SECTION_LIMIT)],
    ...guestEntries(guestSession),
    ...encodeMarketV2Filters(filters),
  ];
}

export type MarketV2ListRequest = {
  filters: MarketV2Filters;
  /** Absent means the server's default for this list; repeated as-is on every page. */
  sort?: MarketV2Sort | null;
  cursor?: string | null;
  includeFacets?: boolean;
  limit?: number;
  /** Captured when the list starts and repeated: the cursor is bound to the viewer. */
  guestSession?: string | null;
};

export function marketV2ListQuery(request: MarketV2ListRequest): Array<[string, string]> {
  const entries: Array<[string, string]> = [
    ...guestEntries(request.guestSession),
    ...encodeMarketV2Filters(request.filters),
  ];
  if (request.sort) entries.push(['sort', request.sort]);
  entries.push(['limit', String(request.limit ?? MARKET_V2_LIST_LIMIT)]);
  if (request.cursor) {
    if (!isMarketV2Cursor(request.cursor)) throw new MarketV2CursorShapeError();
    entries.push(['cursor', request.cursor]);
  }
  if (request.includeFacets && !request.cursor) entries.push(['includeFacets', '1']);
  return entries;
}

export function marketV2FacetQuery(
  filters: MarketV2Filters,
  sectionKey?: string | null,
  guestSession?: string | null,
): Array<[string, string]> {
  const scope: Array<[string, string]> = sectionKey
    ? [['surface', 'SEE_ALL'], ['sectionKey', sectionKey]]
    : [['surface', 'CATALOG']];
  return [...scope, ...guestEntries(guestSession), ...encodeMarketV2Filters(filters)];
}

export class MarketV2CursorShapeError extends Error {
  constructor() {
    super('This list needs a refresh to continue.');
    this.name = 'MarketV2CursorShapeError';
  }
}

// ─── Responses ────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const bool = (value: unknown) => value === true;
const slot = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** The API wraps responses as `{ data, message, statusCode }`; unwrap once. */
export function unwrapMarketV2Envelope(payload: unknown): unknown {
  const outer = record(payload);
  if (outer && record(outer.data) && ('statusCode' in outer || 'message' in outer)) return outer.data;
  return payload;
}

const ENTITY_TYPES = new Set(['PRODUCT', 'COLLECTION', 'DESIGN', 'BRAND', 'CATEGORY']);

export function parseMarketV2Item(raw: unknown): MarketV2Item | null {
  const item = record(raw);
  if (!item) return null;
  const id = text(item.id);
  const entityType = text(item.entityType);
  const title = text(item.title);
  if (!id || !entityType || !ENTITY_TYPES.has(entityType) || !title) return null;
  const brand = record(item.brand);
  const media = record(item.media);
  const price = record(item.price);
  const range = record(item.priceRange);
  const availability = record(item.availability);
  const category = record(item.category);
  const stats = record(item.stats);
  const target = record(item.target);
  return {
    id,
    sourceId: text(item.sourceId) ?? id,
    sourceType: text(item.sourceType) ?? entityType,
    entityType: entityType as MarketV2Item['entityType'],
    title,
    subtitle: text(item.subtitle),
    description: text(item.description),
    brand: brand ? { id: text(brand.id), name: text(brand.name), logoUrl: text(brand.logoUrl) } : null,
    media: media
      ? {
          url: text(media.url),
          thumbnailUrl: text(media.thumbnailUrl),
          fileId: text(media.fileId),
          width: finite(media.width),
          height: finite(media.height),
        }
      : null,
    price: price
      ? {
          amount: finite(price.amount),
          saleAmount: finite(price.saleAmount),
          effectiveAmount: finite(price.effectiveAmount),
          currency: text(price.currency) ?? 'NGN',
        }
      : null,
    priceRange: range ? { min: finite(range.min), max: finite(range.max), currency: text(range.currency) ?? 'NGN' } : null,
    availability: availability
      ? {
          totalStock: finite(availability.totalStock),
          customOrderEnabled: bool(availability.customOrderEnabled),
          standardCheckoutEnabled: bool(availability.standardCheckoutEnabled),
          isOnSale: bool(availability.isOnSale),
        }
      : null,
    category: category ? { id: text(category.id), slug: text(category.slug), name: text(category.name) } : null,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    stats: {
      views: finite(stats?.views),
      threads: finite(stats?.threads),
      products: finite(stats?.products),
    },
    target: {
      type: text(target?.type) ?? entityType,
      id: text(target?.id) ?? id,
      key: text(target?.key),
      route: text(target?.route),
    },
    createdAt: text(item.createdAt),
    position: slot(item.position),
  };
}

export function marketV2ItemKey(item: Pick<MarketV2Item, 'entityType' | 'id'>): string {
  return `${item.entityType}:${item.id}`;
}

function parseItems(raw: unknown): MarketV2Item[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: MarketV2Item[] = [];
  for (const entry of raw) {
    const item = parseMarketV2Item(entry);
    if (!item) continue;
    const key = marketV2ItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

function parseSorts(raw: unknown): MarketV2Sort[] {
  return Array.isArray(raw) ? raw.filter(isMarketV2Sort) : [];
}

const POLICY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,39}$/;

/** `{ policy: 'trend', policyVersion: 2 }` is reported on signals as `trend@2`. */
function parsePolicyVersion(policy: unknown, version: unknown): string | null {
  const name = text(policy);
  const number = slot(version);
  if (!name || number === null) return null;
  const label = `${name}@${number}`;
  return POLICY_VERSION_PATTERN.test(label) ? label : null;
}

const storedPolicyVersion = (value: unknown): string | null => {
  const version = text(value);
  return version && POLICY_VERSION_PATTERN.test(version) ? version : null;
};

export function parseMarketV2Page(payload: unknown): MarketV2PageResponse {
  const body = record(unwrapMarketV2Envelope(payload));
  if (!body || !Array.isArray(body.sections)) throw new MarketV2ContractError('Market page');
  const metadata = record(body.metadata);
  return {
    generatedAt: text(body.generatedAt),
    epoch: text(body.epoch),
    partial: bool(metadata?.partial),
    sections: parseMarketV2Sections(body.sections, false),
  };
}

/** `stored` sections are this module's own shape read back from disk. */
function parseMarketV2Sections(raw: ReadonlyArray<unknown>, stored: boolean): MarketV2Section[] {
  const sections: MarketV2Section[] = [];
  const seenKeys = new Set<string>();
  for (const entry of raw) {
    const section = record(entry);
    const key = text(section?.key);
    const title = text(section?.title);
    if (!section || !key || !title || seenKeys.has(key)) continue;
    const items = parseItems(section.items);
    if (!items.length) continue;
    seenKeys.add(key);
    const viewAll = record(section.viewAll);
    sections.push({
      key,
      template: text(section.template),
      title,
      subtitle: text(section.subtitle),
      reason: text(section.reason),
      layout: text(section.layout) ?? 'HORIZONTAL_RAIL',
      policyVersion: stored
        ? storedPolicyVersion(section.policyVersion)
        : parsePolicyVersion(section.policy, section.policyVersion),
      personal: stored ? bool(section.personal) : section.personalization === 'personal',
      items,
      viewAll: {
        enabled: bool(viewAll?.enabled),
        label: text(viewAll?.label) ?? 'View all',
        availableSorts: parseSorts(viewAll?.availableSorts),
      },
    });
  }
  return sections;
}

function parseFacetOptions(raw: unknown): MarketV2FacetOption[] {
  if (!Array.isArray(raw)) return [];
  const options: MarketV2FacetOption[] = [];
  for (const entry of raw) {
    const option = record(entry);
    const value = text(option?.value);
    if (!option || !value) continue;
    options.push({
      value,
      label: text(option.label) ?? value,
      count: Math.max(0, finite(option.count) ?? 0),
      disabled: bool(option.disabled),
      categoryId: text(option.categoryId),
    });
  }
  return options;
}

export function parseMarketV2Facets(payload: unknown): MarketV2Facets | null {
  const body = record(unwrapMarketV2Envelope(payload));
  if (!body) return null;
  const dimensions = record(body.dimensions);
  const price = record(body.price);
  const min = finite(price?.min);
  const max = finite(price?.max);
  return {
    categories: parseFacetOptions(body.categories),
    categoryTypes: parseFacetOptions(body.categoryTypes),
    brands: parseFacetOptions(body.brands),
    tags: parseFacetOptions(body.tags),
    colors: parseFacetOptions(body.colors),
    sizes: parseFacetOptions(body.sizes),
    audience: parseFacetOptions(body.audience),
    fulfilment: parseFacetOptions(body.fulfilment),
    onSale: parseFacetOptions(body.onSale),
    inStockOnly: parseFacetOptions(body.inStockOnly),
    dimensions: Object.entries(dimensions ?? {})
      .map(([key, value]) => {
        const dimension = record(value);
        return {
          key,
          name: text(dimension?.name) ?? key,
          isMulti: bool(dimension?.isMulti),
          values: parseFacetOptions(dimension?.values),
        };
      })
      .filter((dimension) => dimension.values.length > 0),
    price:
      min !== null && max !== null && max >= min
        ? { min, max, currency: text(price?.currency) ?? 'NGN', bands: parsePriceBands(price?.bands) }
        : null,
    customFitAnySize: bool(record(body.sizeSupport)?.customFitAnySize),
    truncation: parseTruncation(body.truncation),
  };
}

function parsePriceBands(raw: unknown): MarketV2PriceBand[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const band = record(entry);
    const min = finite(band?.min);
    const max = finite(band?.max);
    const count = finite(band?.count);
    return min !== null && max !== null && count !== null && max >= min && count > 0 ? [{ min, max, count }] : [];
  });
}

function parseTruncation(raw: unknown): MarketV2Facets['truncation'] {
  const result: MarketV2Facets['truncation'] = {};
  for (const [key, value] of Object.entries(record(raw) ?? {})) {
    const entry = record(value);
    const returned = finite(entry?.returned);
    const available = finite(entry?.available);
    if (returned !== null && available !== null && available > returned) result[key] = { returned, available };
  }
  return result;
}

function parseNotice(raw: unknown): MarketV2Notice {
  return raw === 'Updated' || raw === 'Prices updated' ? raw : null;
}

function parseListBody(body: Raw, pagination: Raw | null, items: MarketV2Item[]): MarketV2ListPage {
  const sort = record(body.sort);
  const meta = record(body.meta);
  const nextCursor = text(pagination?.nextCursor);
  const total = finite(body.total);
  const availableSorts = Array.isArray(body.availableSorts)
    ? body.availableSorts.filter((value): value is MarketV2Sort | 'source' => isMarketV2Sort(value) || value === 'source')
    : [];
  return {
    items,
    hasNextPage: bool(pagination?.hasNextPage) && isMarketV2Cursor(nextCursor),
    nextCursor: isMarketV2Cursor(nextCursor) ? nextCursor : null,
    reanchored: bool(pagination?.reanchored),
    availableSorts,
    requestedSort: text(sort?.requested),
    effectiveSort: text(sort?.effective),
    notice: parseNotice(meta?.notice),
    fallbackReason: text(meta?.fallbackReason),
    asOf: text(meta?.asOf),
    total: total !== null && total >= 0 ? Math.floor(total) : null,
    facets: body.facets ? parseMarketV2Facets(body.facets) : null,
  };
}

export function parseMarketV2Catalog(payload: unknown): MarketV2ListPage {
  const body = record(unwrapMarketV2Envelope(payload));
  if (!body || !Array.isArray(body.items) || !record(body.pagination)) throw new MarketV2ContractError('Market catalogue');
  return parseListBody(body, record(body.pagination), parseItems(body.items));
}

/**
 * A See All response from the server-composed pipeline carries the list
 * controls (`availableSorts`, `sort`, `meta`) beside the section. The retained
 * section reader returns only `{ generatedAt, section }`.
 */
export function isMarketV2SectionPayload(payload: unknown): boolean {
  const body = record(unwrapMarketV2Envelope(payload));
  return Boolean(body && record(body.section) && Array.isArray(body.availableSorts) && record(body.sort) && record(body.meta));
}

export function parseMarketV2SectionPage(payload: unknown): MarketV2SectionPage {
  const body = record(unwrapMarketV2Envelope(payload));
  const section = record(body?.section);
  const key = text(section?.key);
  if (!body || !section || !key || !isMarketV2SectionPayload(body)) throw new MarketV2ContractError('Market section');
  const list = parseListBody(body, record(section.pagination), parseItems(section.items));
  return {
    ...list,
    section: {
      key,
      title: text(section.title) ?? 'Market',
      subtitle: text(section.subtitle),
      layout: text(section.layout) ?? 'HORIZONTAL_RAIL',
      sourceType: text(section.sourceType) ?? 'MIXED',
    },
  };
}

export class MarketV2ContractError extends Error {
  constructor(what: string) {
    super(`${what} came back in a shape this app cannot read.`);
    this.name = 'MarketV2ContractError';
  }
}

// ─── Merging pages ────────────────────────────────────────────────────────

export type MarketV2MergeMode = 'reset' | 'append';

export type MarketV2MergeResult = {
  items: MarketV2Item[];
  /** True when the server restarted the order; the caller shows the notice and returns to the top. */
  reanchored: boolean;
  added: number;
};

/**
 * Applies one page to a list. Appending skips anything already shown (a live
 * list can move a card onto the next page). A re-anchored continuation is the
 * start of a fresh order, so it replaces the list instead of extending it.
 */
export function mergeMarketV2Page(
  current: ReadonlyArray<MarketV2Item>,
  page: Pick<MarketV2ListPage, 'items' | 'reanchored'>,
  mode: MarketV2MergeMode,
): MarketV2MergeResult {
  const replace = mode === 'reset' || page.reanchored;
  const seen = new Set<string>(replace ? [] : current.map(marketV2ItemKey));
  const incoming: MarketV2Item[] = [];
  for (const item of page.items) {
    const key = marketV2ItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.push(item);
  }
  return {
    items: replace ? incoming : [...current, ...incoming],
    reanchored: mode === 'append' && page.reanchored,
    added: incoming.length,
  };
}

// ─── Errors ───────────────────────────────────────────────────────────────

export type MarketV2ErrorKind =
  | 'unavailable'
  | 'invalid-cursor'
  | 'unsupported-sort'
  | 'invalid-filter'
  | 'busy'
  | 'offline'
  | 'timeout'
  | 'aborted'
  | 'server';

export type MarketV2ErrorInfo = { kind: MarketV2ErrorKind; message: string };

const ERROR_COPY: Record<MarketV2ErrorKind, string> = {
  unavailable: 'This part of the Market is not available yet.',
  'invalid-cursor': 'This list changed. Showing the latest.',
  'unsupported-sort': 'That sort is not available for this list right now.',
  'invalid-filter': 'Those filters could not be applied. Try fewer options.',
  busy: 'The Market is busy right now. Try again in a moment.',
  offline: 'You are offline. Check your connection and try again.',
  timeout: 'The Market is taking too long to answer. Try again.',
  aborted: 'Cancelled.',
  server: 'The Market could not load. Try again.',
};

/** Reads an Axios-style failure without depending on Axios. */
export function classifyMarketV2Error(error: unknown): MarketV2ErrorInfo {
  const value = record(error);
  if (error instanceof MarketV2CursorShapeError) return { kind: 'invalid-cursor', message: ERROR_COPY['invalid-cursor'] };
  if (value && (value.code === 'ERR_CANCELED' || value.name === 'CanceledError' || value.name === 'AbortError')) {
    return { kind: 'aborted', message: ERROR_COPY.aborted };
  }
  if (error instanceof MarketV2ContractError) return { kind: 'server', message: ERROR_COPY.server };
  if (value && (value.code === 'ECONNABORTED' || value.code === 'ETIMEDOUT')) {
    return { kind: 'timeout', message: ERROR_COPY.timeout };
  }
  const response = record(value?.response);
  const status = finite(response?.status);
  const body = record(response?.data);
  const code = text(body?.code);
  if (status === null) return { kind: 'offline', message: ERROR_COPY.offline };
  if (status === 404) return { kind: 'unavailable', message: ERROR_COPY.unavailable };
  if (code === 'INVALID_CURSOR') return { kind: 'invalid-cursor', message: ERROR_COPY['invalid-cursor'] };
  if (code === 'UNSUPPORTED_SORT') return { kind: 'unsupported-sort', message: ERROR_COPY['unsupported-sort'] };
  if (code === 'INVALID_FILTER') return { kind: 'invalid-filter', message: ERROR_COPY['invalid-filter'] };
  if (status === 429 || status === 503) return { kind: 'busy', message: ERROR_COPY.busy };
  return { kind: 'server', message: ERROR_COPY.server };
}

// ─── Restore and freshness ────────────────────────────────────────────────

/** The server composes a new Market every six hours, on UTC boundaries. */
export const MARKET_V2_EPOCH_MS = 6 * 60 * 60 * 1000;
/** Coming back to content younger than this does not ask the server again. */
export const MARKET_V2_FRESH_MS = 3 * 60 * 1000;
export const MARKET_V2_RESTORE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const MARKET_V2_SNAPSHOT_VERSION = 3;
/** Items kept in a persisted snapshot: the first screens, not the whole scroll. */
export const MARKET_V2_SNAPSHOT_ITEM_LIMIT = 48;
export const MARKET_V2_GUEST_VIEWER = 'guest';

export const marketV2EpochWindow = (at: number) => Math.floor(at / MARKET_V2_EPOCH_MS);

/** Content on screen that a return to the screen should refresh behind it. */
export function marketV2NeedsRefresh(savedAt: number | null, now: number): boolean {
  if (savedAt === null) return true;
  const age = now - savedAt;
  return age < 0 || age >= MARKET_V2_FRESH_MS || marketV2EpochWindow(savedAt) !== marketV2EpochWindow(now);
}

/**
 * The viewer a Market cache belongs to. Null while the session is still being
 * restored: nothing is requested or read until the viewer is known, so a
 * signed-in person never starts on a guest's answer.
 */
export function marketV2ViewerKey(status: string, userId: string | null | undefined): string | null {
  if (status === 'authenticated') return userId ? `user:${userId}` : null;
  return status === 'unauthenticated' ? MARKET_V2_GUEST_VIEWER : null;
}

export function marketV2SnapshotKey(viewerKey: string): string {
  return `market-home:v2:${viewerKey}`;
}

export type MarketV2HomeSnapshot = {
  version: number;
  viewerKey: string;
  savedAt: number;
  epoch: string | null;
  sections: MarketV2Section[];
  items: MarketV2Item[];
  facets: MarketV2Facets | null;
  sortMenu: MarketV2Sort[];
  effectiveSort: string | null;
};

export function createMarketV2HomeSnapshot(
  viewerKey: string,
  savedAt: number,
  content: Pick<MarketV2HomeSnapshot, 'epoch' | 'sections' | 'items' | 'facets' | 'sortMenu' | 'effectiveSort'>,
): MarketV2HomeSnapshot {
  return {
    version: MARKET_V2_SNAPSHOT_VERSION,
    viewerKey,
    savedAt,
    ...content,
    items: content.items.slice(0, MARKET_V2_SNAPSHOT_ITEM_LIMIT),
  };
}

/** Claims that are only true of the moment they were made. */
const MOMENTARY_TEMPLATES = new Set(['LOW_STOCK', 'TREND']);

export type MarketV2RestoredHome = {
  snapshot: MarketV2HomeSnapshot;
  /** The server has composed a newer Market since this was saved. */
  previousEpoch: boolean;
};

/**
 * What a saved Market home may show, or null when it may show nothing.
 *
 * Never another viewer's, from a future clock, from an older contract or older
 * than 48 hours. Media addresses that have expired are removed, so an expired
 * capability is never asked for a picture; the card waits for the refresh. A
 * snapshot from an earlier epoch also loses the sections whose claim was about
 * that moment ("Almost gone", "Hot right now").
 */
export function restoreMarketV2Home(
  stored: unknown,
  viewerKey: string,
  now: number,
  isUsableUrl: (url: string) => boolean,
): MarketV2RestoredHome | null {
  const value = record(stored);
  if (!value || value.version !== MARKET_V2_SNAPSHOT_VERSION || value.viewerKey !== viewerKey) return null;
  const savedAt = finite(value.savedAt);
  if (savedAt === null) return null;
  const age = now - savedAt;
  if (age < 0 || age >= MARKET_V2_RESTORE_MAX_AGE_MS) return null;
  if (!Array.isArray(value.sections) || !Array.isArray(value.items)) return null;

  const usable = (url: string | null) => (url && isUsableUrl(url) ? url : null);
  const clean = (item: MarketV2Item): MarketV2Item => ({
    ...item,
    brand: item.brand ? { ...item.brand, logoUrl: usable(item.brand.logoUrl) } : null,
    media: item.media
      ? { ...item.media, url: usable(item.media.url), thumbnailUrl: usable(item.media.thumbnailUrl) }
      : null,
  });
  const previousEpoch = marketV2EpochWindow(savedAt) !== marketV2EpochWindow(now);
  // Everything read back from disk goes through the same parsers as a response.
  const sections = parseMarketV2Sections(value.sections, true)
    .filter((section) => !previousEpoch || !MOMENTARY_TEMPLATES.has(section.template ?? ''))
    .map((section) => ({ ...section, items: section.items.map(clean) }));
  const items = parseItems(value.items).map(clean);
  if (!sections.length && !items.length) return null;
  return {
    previousEpoch,
    snapshot: {
      version: MARKET_V2_SNAPSHOT_VERSION,
      viewerKey,
      savedAt,
      epoch: text(value.epoch),
      sections,
      items,
      facets: value.facets ? parseStoredFacets(value.facets) : null,
      sortMenu: parseSorts(value.sortMenu),
      effectiveSort: text(value.effectiveSort),
    },
  };
}

function parseStoredFacets(stored: unknown): MarketV2Facets | null {
  const value = record(stored);
  if (!value || !Array.isArray(value.dimensions)) return null;
  const dimensions = Object.fromEntries(
    value.dimensions.flatMap((entry) => {
      const dimension = record(entry);
      const key = text(dimension?.key);
      return dimension && key ? [[key, dimension] as const] : [];
    }),
  );
  return parseMarketV2Facets({
    ...value,
    dimensions,
    sizeSupport: { customFitAnySize: value.customFitAnySize },
  });
}

// ─── Signals ──────────────────────────────────────────────────────────────

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * The epoch as signals may carry it: an ISO instant. The Market page names its
 * epoch by id, which the signal endpoint refuses, so that form is not sent.
 */
export function marketV2SignalEpoch(epoch: string | null | undefined): string | undefined {
  return epoch && ISO_INSTANT.test(epoch) && Number.isFinite(Date.parse(epoch)) ? epoch : undefined;
}

// ─── Images ───────────────────────────────────────────────────────────────

function hashPath(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Image cache identity `fileId:variant`.
 *
 * Media URLs are signed per response and expire within minutes, so caching by
 * URL downloads the same picture again on every refresh. The variant is the
 * signed object's path (asset version and rendition), never its signature, so
 * a re-signed URL hits the cache and a new rendition does not.
 */
export function marketV2ImageCacheKey(media: Pick<NonNullable<MarketV2Item['media']>, 'fileId' | 'url' | 'thumbnailUrl'> | null | undefined): string | null {
  const fileId = media?.fileId?.trim();
  if (!fileId) return null;
  const url = media?.thumbnailUrl ?? media?.url ?? null;
  if (!url) return `${fileId}:original`;
  const path = url.split('#')[0].split('?')[0].replace(/^[a-z]+:\/\/[^/]+/i, '');
  return `${fileId}:${path ? hashPath(path) : 'original'}`;
}

// ─── Presentation helpers ─────────────────────────────────────────────────

/** A card can be bought: a product, or anything that takes a custom order. */
export function isMarketV2Buyable(item: MarketV2Item): boolean {
  return item.entityType === 'PRODUCT' || (item.entityType === 'DESIGN' && Boolean(item.availability?.customOrderEnabled));
}

export function marketV2PriceAmount(item: MarketV2Item): number | null {
  const amount = item.price?.effectiveAmount ?? item.price?.amount ?? null;
  return typeof amount === 'number' && amount > 0 ? amount : null;
}

/** A price line, or null when there is nothing honest to show. */
export function marketV2PriceLabel(
  item: MarketV2Item,
  formatPrice: (amount: number, currency: string) => string | null,
): string | null {
  const amount = marketV2PriceAmount(item);
  if (amount !== null) return formatPrice(amount, item.price?.currency ?? 'NGN');
  const min = item.priceRange?.min ?? null;
  const max = item.priceRange?.max ?? null;
  const currency = item.priceRange?.currency ?? 'NGN';
  if (min !== null && min > 0) {
    const low = formatPrice(min, currency);
    if (max !== null && max > min) return `${low} to ${formatPrice(max, currency)}`;
    return low;
  }
  return null;
}

/** Sold out: ready-to-wear only, with no stock left and no custom order. */
export function isMarketV2SoldOut(item: MarketV2Item): boolean {
  return (
    item.entityType === 'PRODUCT' &&
    item.availability?.totalStock === 0 &&
    !item.availability.customOrderEnabled
  );
}

/** Rows of a two-column grid inside one vertical list; a lone item keeps its row. */
export function chunkMarketV2Rows<T>(items: ReadonlyArray<T>, columns: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));
  return rows;
}
