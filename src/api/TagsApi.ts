import { apiClient } from '@/src/api/httpClient';

export type TagSuggestion = {
  name: string;
  usageCount: number;
};

type RawTagSuggestion = {
  name?: unknown;
  tag?: unknown;
  usageCount?: unknown;
  count?: unknown;
};

function extractSuggestions(payload: unknown): TagSuggestion[] {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.items)
      ? (payload as any).items
      : Array.isArray((payload as any)?.data?.items)
        ? (payload as any).data.items
        : Array.isArray((payload as any)?.data)
          ? (payload as any).data
          : [];

  return items
    .map((item: RawTagSuggestion) => {
      const name = typeof item?.name === 'string' ? item.name.trim() : typeof item?.tag === 'string' ? item.tag.trim() : '';
      const usageCount = Number(item?.usageCount ?? item?.count ?? 0);
      return {
        name,
        usageCount: Number.isFinite(usageCount) ? usageCount : 0,
      };
    })
    .filter((item: TagSuggestion) => item.name.length > 0);
}

export const TagsApi = {
  async getTags(limit = 50): Promise<TagSuggestion[]> {
    const response = await apiClient.get('/tags', { params: { limit } });
    return extractSuggestions(response.data);
  },

  async searchTags(query: string, limit = 20): Promise<TagSuggestion[]> {
    const response = await apiClient.get('/tags/search', { params: { q: query, limit } });
    return extractSuggestions(response.data);
  },
};

export default TagsApi;
