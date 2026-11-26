import type { AxiosRequestConfig } from 'axios';

import { apiClient } from '@/src/api/httpClient';
import {
  marketV2FacetQuery,
  marketV2ListQuery,
  marketV2PageQuery,
  marketV2QueryString,
  isMarketV2SectionPayload,
  parseMarketV2Catalog,
  parseMarketV2Facets,
  parseMarketV2Page,
  parseMarketV2SectionPage,
  type MarketV2Facets,
  type MarketV2Filters,
  type MarketV2ListPage,
  type MarketV2ListRequest,
  type MarketV2PageResponse,
  type MarketV2SectionPage,
} from '@/src/features/market/v2/marketV2Contract';

/**
 * Server-composed Market reads. Every route is private/no-store on the
 * server and default-off behind its own rollout surface: a 404 here means
 * "use the retained Market", which the availability store records.
 *
 * Queries are built by the contract module, so the exact wire encoding the
 * backend parser accepts lives in one place and is covered by the contract
 * test. Requests pass an AbortSignal, which also opts them out of the shared
 * GET coalescing (one screen cancelling must not cancel another's request).
 */

/** Composition and media signing run under a server deadline; give the slow phone some room. */
const MARKET_V2_TIMEOUT_MS = 20_000;

const withQuery = (path: string, entries: ReadonlyArray<[string, string]>) => {
  const query = marketV2QueryString(entries);
  return query ? `${path}?${query}` : path;
};

const requestConfig = (signal?: AbortSignal): AxiosRequestConfig => ({
  timeout: MARKET_V2_TIMEOUT_MS,
  signal,
});

export async function getMarketV2Page(
  filters: MarketV2Filters,
  guestSession: string | null,
  signal?: AbortSignal,
): Promise<MarketV2PageResponse> {
  const response = await apiClient.get(withQuery('/market/page', marketV2PageQuery(filters, guestSession)), requestConfig(signal));
  return parseMarketV2Page(response.data);
}

export async function getMarketV2Catalog(request: MarketV2ListRequest, signal?: AbortSignal): Promise<MarketV2ListPage> {
  const response = await apiClient.get(withQuery('/market/catalog', marketV2ListQuery(request)), requestConfig(signal));
  return parseMarketV2Catalog(response.data);
}

export type MarketV2SectionResult =
  | { kind: 'pipeline'; page: MarketV2SectionPage }
  | { kind: 'legacy' };

/**
 * One See All page. The same route also serves the retained section reader
 * when the See All surface is off or the key is not a pipeline section; that
 * response has no list controls, and the caller then shows the retained
 * screen instead of guessing at its shape.
 */
export async function getMarketV2Section(
  key: string,
  request: MarketV2ListRequest,
  signal?: AbortSignal,
): Promise<MarketV2SectionResult> {
  const response = await apiClient.get(
    withQuery(`/market/sections/${encodeURIComponent(key)}`, marketV2ListQuery({ ...request, includeFacets: false })),
    requestConfig(signal),
  );
  if (!isMarketV2SectionPayload(response.data)) return { kind: 'legacy' };
  return { kind: 'pipeline', page: parseMarketV2SectionPage(response.data) };
}

/**
 * Filter counts for a See All list, read only when the filter sheet opens.
 * The catalogue gets its counts with its first page instead.
 */
export async function getMarketV2Facets(
  filters: MarketV2Filters,
  sectionKey: string | null,
  guestSession: string | null,
  signal?: AbortSignal,
): Promise<MarketV2Facets | null> {
  const response = await apiClient.get(
    withQuery('/market/facets', marketV2FacetQuery(filters, sectionKey, guestSession)),
    requestConfig(signal),
  );
  return parseMarketV2Facets(response.data);
}
