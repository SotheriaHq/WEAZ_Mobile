import { apiClient } from '@/src/api/httpClient';
import type {
  SearchEntityType,
  SearchItem,
  SearchRequestParams,
  SearchResponse,
  SearchSuggestionLink,
  SearchSuggestionResponse,
  SearchSuggestionSection,
  SearchSuggestionTag,
  SearchTrendingLink,
} from '@/src/types/search';

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const SEARCH_ENTITY_TYPES = new Set<SearchEntityType>([
  'profile',
  'product',
  'brand',
  'design',
  'collection',
  'tag',
]);

const EMPTY_COUNTS: Record<SearchEntityType, number> = {
  profile: 0,
  product: 0,
  brand: 0,
  design: 0,
  collection: 0,
  tag: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asEntityType(value: unknown): SearchEntityType | null {
  return typeof value === 'string' && SEARCH_ENTITY_TYPES.has(value as SearchEntityType)
    ? value as SearchEntityType
    : null;
}

function normalizeItem(value: unknown): SearchItem | null {
  const source = asRecord(value);
  if (!source) return null;

  const type = asEntityType(source.type);
  const id = asString(source.id);
  const title = asString(source.title);
  if (!type || !id || !title) return null;

  const href =
    asString(source.href) ??
    (type === 'profile'
      ? `/profile/${encodeURIComponent(id)}`
      : type === 'tag'
        ? `/search?q=${encodeURIComponent(title)}&type=tag`
        : `/search?q=${encodeURIComponent(title)}`);

  return {
    id,
    type,
    title,
    subtitle: asString(source.subtitle),
    description: asString(source.description),
    imageUrl: asString(source.imageUrl),
    href,
    score: asNumber(source.score) ?? 0,
    price: asNumber(source.price),
    salePrice: asNumber(source.salePrice),
    currency: asString(source.currency),
    metadata: asRecord(source.metadata) ?? undefined,
    highlights: asRecord(source.highlights) as SearchItem['highlights'] | undefined,
  };
}

function normalizeSection(value: unknown): SearchSuggestionSection {
  const source = asRecord(value);
  const items = Array.isArray(source?.items)
    ? source.items.map(normalizeItem).filter((item): item is SearchItem => Boolean(item))
    : [];
  return {
    items,
    total: asNumber(source?.total) ?? items.length,
  };
}

function normalizeLink(value: unknown): SearchSuggestionLink | null {
  const source = asRecord(value);
  const query = asString(source?.query);
  if (!query) return null;
  return {
    query,
    href: asString(source?.href) ?? `/search?q=${encodeURIComponent(query)}`,
  };
}

function normalizeTrendingLink(value: unknown): SearchTrendingLink | null {
  const link = normalizeLink(value);
  if (!link) return null;
  const source = asRecord(value);
  return {
    ...link,
    score: asNumber(source?.score) ?? 0,
  };
}

function normalizeTag(value: unknown): SearchSuggestionTag | null {
  const source = asRecord(value);
  const id = asString(source?.id);
  const title = asString(source?.title);
  if (!id || !title) return null;
  return {
    id,
    type: 'tag',
    title,
    href: asString(source?.href) ?? `/search?q=${encodeURIComponent(title)}&type=tag`,
    score: asNumber(source?.score) ?? 0,
  };
}

function normalizeSuggestionResponse(payload: unknown): SearchSuggestionResponse {
  const source = asRecord(payload) ?? {};
  const query = asString(source.query) ?? '';
  return {
    query,
    normalizedQuery: asString(source.normalizedQuery) ?? query.trim().toLowerCase(),
    recent: Array.isArray(source.recent)
      ? source.recent.map(normalizeLink).filter((item): item is SearchSuggestionLink => Boolean(item))
      : [],
    trending: Array.isArray(source.trending)
      ? source.trending.map(normalizeTrendingLink).filter((item): item is SearchTrendingLink => Boolean(item))
      : [],
    profiles: normalizeSection(source.profiles),
    products: normalizeSection(source.products),
    brands: normalizeSection(source.brands),
    designs: normalizeSection(source.designs),
    storeCollections: normalizeSection(source.storeCollections),
    tags: Array.isArray(source.tags)
      ? source.tags.map(normalizeTag).filter((item): item is SearchSuggestionTag => Boolean(item))
      : [],
  };
}

function normalizeSearchResponse(payload: unknown, params: SearchRequestParams): SearchResponse {
  const source = asRecord(payload) ?? {};
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeItem).filter((item): item is SearchItem => Boolean(item))
    : [];
  const sourceCounts = asRecord(source.counts);
  const counts = { ...EMPTY_COUNTS };
  for (const type of SEARCH_ENTITY_TYPES) {
    counts[type] = asNumber(sourceCounts?.[type]) ?? 0;
  }
  const sourceMeta = asRecord(source.meta);
  const requestedTypes = Array.isArray(source.types)
    ? source.types.map(asEntityType).filter((type): type is SearchEntityType => Boolean(type))
    : [];
  const query = asString(source.query) ?? params.q;

  return {
    query,
    normalizedQuery: asString(source.normalizedQuery) ?? query.trim().toLowerCase(),
    types: requestedTypes.length > 0
      ? requestedTypes
      : params.type && params.type !== 'all'
        ? [params.type]
        : ['profile', 'product', 'brand', 'design', 'collection', 'tag'],
    items,
    counts,
    meta: {
      page: asNumber(sourceMeta?.page) ?? params.page ?? 1,
      limit: asNumber(sourceMeta?.limit) ?? params.limit ?? items.length,
      hasNextPage: Boolean(sourceMeta?.hasNextPage),
    },
  };
}

export const SearchApi = {
  async suggest(params: { q?: string; brandId?: string }, signal?: AbortSignal) {
    const response = await apiClient.get<unknown>('/v1/search/suggest', {
      params,
      signal,
    });
    return normalizeSuggestionResponse(unwrapData<unknown>(response.data));
  },

  async search(params: SearchRequestParams, signal?: AbortSignal) {
    const response = await apiClient.get<unknown>('/v1/search', {
      params,
      signal,
    });
    return normalizeSearchResponse(unwrapData<unknown>(response.data), params);
  },
};

export default SearchApi;
