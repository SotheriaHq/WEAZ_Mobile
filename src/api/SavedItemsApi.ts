import { apiClient } from '@/src/api/httpClient';
import {
  mapCatalogTargetForLegacyApi,
  type CatalogTargetInput,
} from '@/src/features/catalog/catalogTarget';
import { queryClient, THREADLY_SAVED_STATUS_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

export type SavedItemTargetType = 'COLLECTION' | 'COLLECTION_MEDIA';

const unwrapData = <T,>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const savedPayloadForCatalogTarget = (target: CatalogTargetInput) => {
  const legacyTarget = mapCatalogTargetForLegacyApi(target);
  if (legacyTarget.targetType === 'PRODUCT') {
    throw new Error('Product favorites use the wishlist API, not /saved.');
  }
  return legacyTarget;
};

export const SavedItemsApi = {
  async saveItem(targetType: SavedItemTargetType, targetId: string): Promise<void> {
    await apiClient.post('/saved', { targetType, targetId });
    await queryClient.invalidateQueries({ queryKey: queryKeys.saved.root() });
  },

  async saveCatalogTarget(target: CatalogTargetInput): Promise<void> {
    await apiClient.post('/saved', savedPayloadForCatalogTarget(target));
    await queryClient.invalidateQueries({ queryKey: queryKeys.saved.root() });
  },

  async unsaveItem(targetType: SavedItemTargetType, targetId: string): Promise<void> {
    await apiClient.delete('/saved', { data: { targetType, targetId } });
    await queryClient.invalidateQueries({ queryKey: queryKeys.saved.root() });
  },

  async unsaveCatalogTarget(target: CatalogTargetInput): Promise<void> {
    await apiClient.delete('/saved', { data: savedPayloadForCatalogTarget(target) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.saved.root() });
  },

  async checkBatch(targetType: SavedItemTargetType, targetIds: string[]): Promise<Record<string, boolean>> {
    const normalizedIds = Array.from(new Set(targetIds.map((id) => String(id ?? '').trim()).filter(Boolean))).sort();
    if (normalizedIds.length === 0) return {};

    return queryClient.fetchQuery({
      queryKey: queryKeys.saved.batch(targetType, normalizedIds),
      queryFn: async () => {
        const response = await apiClient.post('/saved/check/batch', {
          targetType,
          targetIds: normalizedIds,
        });
        const payload = unwrapData<unknown>(response.data);
        const rows: unknown[] = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.items) ? (payload as any).items : [];
        return rows.reduce<Record<string, boolean>>((acc, row) => {
          const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
          const id = typeof record.targetId === 'string' ? record.targetId : typeof record.id === 'string' ? record.id : null;
          if (id) {
            acc[id] = Boolean(record.isSaved ?? record.saved);
          }
          return acc;
        }, {});
      },
      staleTime: THREADLY_SAVED_STATUS_STALE_TIME_MS,
    });
  },

  async checkCatalogTargetBatch(target: CatalogTargetInput, targetIds: string[]): Promise<Record<string, boolean>> {
    if (targetIds.length === 0) return {};
    const legacyTarget = savedPayloadForCatalogTarget(target);
    return this.checkBatch(legacyTarget.targetType as SavedItemTargetType, targetIds);
  },
};

export default SavedItemsApi;
