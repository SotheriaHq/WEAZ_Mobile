import type { CatalogEntityType } from '@/src/features/catalog/catalogDomain';
import { isCatalogEntityType } from '@/src/features/catalog/catalogDomain';

export type CatalogCard =
  | { entityType: 'DESIGN'; design: unknown }
  | { entityType: 'PRODUCT'; product: unknown }
  | { entityType: 'COLLECTION'; collection: unknown };

const SOURCE_TYPE_TO_ENTITY_TYPE: Record<string, CatalogEntityType> = {
  DESIGN: 'DESIGN',
  COLLECTION_MEDIA: 'DESIGN',
  PRODUCT: 'PRODUCT',
  STORE_PRODUCT: 'PRODUCT',
  COLLECTION: 'COLLECTION',
  STORE_COLLECTION: 'COLLECTION',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

export const resolveCatalogEntityType = (
  value: unknown,
  fallback?: CatalogEntityType | null,
): CatalogEntityType | null => {
  const record = asRecord(value);

  const explicit = normalizeKey(record.entityType);
  if (isCatalogEntityType(explicit)) return explicit;

  const sourceType = normalizeKey(record.sourceType);
  if (sourceType && SOURCE_TYPE_TO_ENTITY_TYPE[sourceType]) {
    return SOURCE_TYPE_TO_ENTITY_TYPE[sourceType];
  }

  const domain = normalizeKey(record.domain);
  if (domain === 'DESIGN') return 'DESIGN';
  if (domain === 'STORE') return 'COLLECTION';

  const lowerType = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
  if (lowerType === 'design') return 'DESIGN';
  if (lowerType === 'product') return 'PRODUCT';
  if (lowerType === 'collection') return 'COLLECTION';

  const count = asRecord(record._count);
  if (
    record.sku ||
    record.totalStock !== undefined ||
    record.stock !== undefined ||
    record.variants !== undefined ||
    record.price !== undefined ||
    record.collectionIds !== undefined
  ) {
    return 'PRODUCT';
  }

  if (
    record.isAvailableInStore === true ||
    record.isSystemGenerated !== undefined ||
    count.products !== undefined ||
    (Array.isArray(record.products) && record.medias === undefined)
  ) {
    return 'COLLECTION';
  }

  if (
    record.designId ||
    record.legacyCollectionId ||
    record.coverMediaId ||
    record.customOrderEnabled !== undefined ||
    record.fitPreference !== undefined ||
    record.targetAgeGroup !== undefined ||
    Array.isArray(record.medias)
  ) {
    return 'DESIGN';
  }

  return fallback ?? null;
};
