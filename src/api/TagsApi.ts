import { apiClient } from '@/src/api/httpClient';

export type TagSuggestion = {
  name: string;
  usageCount: number;
  status?: 'PENDING' | 'APPROVED';
};

type RawTagSuggestion = {
  name?: unknown;
  tag?: unknown;
  usageCount?: unknown;
  count?: unknown;
  status?: unknown;
};

function extractSuggestions(payload: unknown): TagSuggestion[] {
  let items: any[] = [];
  
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === 'object') {
    const p = payload as any;
    if (Array.isArray(p.items)) {
      items = p.items;
    } else if (Array.isArray(p.data)) {
      items = p.data;
    } else if (p.data && typeof p.data === 'object') {
      if (Array.isArray(p.data.items)) {
        items = p.data.items;
      } else if (Array.isArray(p.data.data)) {
        items = p.data.data;
      }
    }
  }

  return items
    .map((item: any) => {
      const name =
        typeof item === 'string'
          ? item.trim()
          : typeof item?.name === 'string'
            ? item.name.trim()
            : typeof item?.tag === 'string'
              ? item.tag.trim()
              : '';
      const usageCount = Number(item?.usageCount ?? item?.count ?? 0);
      return {
        name,
        usageCount: Number.isFinite(usageCount) ? usageCount : 0,
        status:
          item?.status === 'PENDING'
            ? ('PENDING' as const)
            : ('APPROVED' as const),
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
    const response = await apiClient.get('/tags/search', {
      params: { q: query, limit },
    });
    return extractSuggestions(response.data);
  },
};

export default TagsApi;
