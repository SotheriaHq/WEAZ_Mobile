import { apiClient } from '@/src/api/httpClient';
import type {
  SearchRequestParams,
  SearchResponse,
  SearchSuggestionResponse,
} from '@/src/types/search';

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const SearchApi = {
  async suggest(params: { q?: string; brandId?: string }, signal?: AbortSignal) {
    const response = await apiClient.get<SearchSuggestionResponse>('/v1/search/suggest', {
      params,
      signal,
    });
    return unwrapData<SearchSuggestionResponse>(response.data as any);
  },

  async search(params: SearchRequestParams, signal?: AbortSignal) {
    const response = await apiClient.get<SearchResponse>('/v1/search', {
      params,
      signal,
    });
    return unwrapData<SearchResponse>(response.data as any);
  },
};

export default SearchApi;
