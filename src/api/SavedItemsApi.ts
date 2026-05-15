import { apiClient } from '@/src/api/httpClient';
import {
  mapCatalogTargetForLegacyApi,
  type CatalogTargetInput,
} from '@/src/features/catalog/catalogTarget';

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
  },

  async saveCatalogTarget(target: CatalogTargetInput): Promise<void> {
    await apiClient.post('/saved', savedPayloadForCatalogTarget(target));
  },

  async unsaveItem(targetType: SavedItemTargetType, targetId: string): Promise<void> {
    await apiClient.delete('/saved', { data: { targetType, targetId } });
  },

  async unsaveCatalogTarget(target: CatalogTargetInput): Promise<void> {
    await apiClient.delete('/saved', { data: savedPayloadForCatalogTarget(target) });
  },

  async checkBatch(targetType: SavedItemTargetType, targetIds: string[]): Promise<Record<string, boolean>> {
    if (targetIds.length === 0) return {};
    const response = await apiClient.post('/saved/check/batch', {
      targetType,
      targetIds,
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

  async checkCatalogTargetBatch(target: CatalogTargetInput, targetIds: string[]): Promise<Record<string, boolean>> {
    if (targetIds.length === 0) return {};
    const legacyTarget = savedPayloadForCatalogTarget(target);
    return this.checkBatch(legacyTarget.targetType as SavedItemTargetType, targetIds);
  },
};

export default SavedItemsApi;
