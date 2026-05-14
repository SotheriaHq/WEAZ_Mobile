import type { CatalogEntityType } from '@/src/features/catalog/catalogDomain';
import { CATALOG_ENTITY_TYPES, isCatalogEntityType } from '@/src/features/catalog/catalogDomain';

export const CATALOG_TARGET_TYPES = CATALOG_ENTITY_TYPES;

export type CatalogTargetType = CatalogEntityType;

export type LegacyCatalogApiTargetType = 'COLLECTION' | 'COLLECTION_MEDIA' | 'PRODUCT';

export type CatalogTargetInput = {
  targetType?: CatalogTargetType | string | null;
  entityType?: CatalogTargetType | string | null;
  targetId?: string | null;
  designId?: string | null;
  productId?: string | null;
  collectionId?: string | null;
  legacyCollectionId?: string | null;
};

export type NormalizedCatalogTarget = {
  targetType: CatalogTargetType;
  targetId: string;
  designId?: string;
  productId?: string;
  collectionId?: string;
  legacyCollectionId?: string;
};

export type LegacyCatalogApiTarget = {
  targetType: LegacyCatalogApiTargetType;
  targetId: string;
  legacyCollectionId?: string;
};

const normalizeId = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeType = (value?: string | null): CatalogTargetType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return isCatalogEntityType(normalized) ? normalized : null;
};

export const isCatalogTargetType = isCatalogEntityType;

export function normalizeCatalogTarget(input: CatalogTargetInput): NormalizedCatalogTarget | null {
  const targetType = normalizeType(input.targetType) ?? normalizeType(input.entityType);

  if (targetType === 'DESIGN') {
    const designId =
      normalizeId(input.designId) ??
      normalizeId(input.targetId) ??
      normalizeId(input.legacyCollectionId) ??
      normalizeId(input.collectionId);
    if (!designId) return null;
    const legacyCollectionId =
      normalizeId(input.legacyCollectionId) ?? normalizeId(input.collectionId) ?? designId;
    return {
      targetType,
      targetId: designId,
      designId,
      legacyCollectionId,
      collectionId: legacyCollectionId,
    };
  }

  if (targetType === 'PRODUCT') {
    const productId = normalizeId(input.productId) ?? normalizeId(input.targetId);
    if (!productId) return null;
    return { targetType, targetId: productId, productId };
  }

  if (targetType === 'COLLECTION') {
    const collectionId = normalizeId(input.collectionId) ?? normalizeId(input.targetId);
    if (!collectionId) return null;
    return { targetType, targetId: collectionId, collectionId };
  }

  if (normalizeId(input.designId)) return normalizeCatalogTarget({ ...input, targetType: 'DESIGN' });
  if (normalizeId(input.productId)) return normalizeCatalogTarget({ ...input, targetType: 'PRODUCT' });
  if (normalizeId(input.collectionId)) return normalizeCatalogTarget({ ...input, targetType: 'COLLECTION' });

  return null;
}

export function buildCatalogTargetPayload(input: CatalogTargetInput): NormalizedCatalogTarget {
  const target = normalizeCatalogTarget(input);
  if (!target) {
    throw new Error('A DESIGN, PRODUCT, or COLLECTION target with an id is required.');
  }
  return target;
}

export function mapCatalogTargetForLegacyApi(input: CatalogTargetInput): LegacyCatalogApiTarget {
  const target = buildCatalogTargetPayload(input);
  if (target.targetType === 'DESIGN') {
    return {
      targetType: 'COLLECTION',
      targetId: target.legacyCollectionId ?? target.designId ?? target.targetId,
      legacyCollectionId: target.legacyCollectionId ?? target.targetId,
    };
  }
  if (target.targetType === 'PRODUCT') {
    return { targetType: 'PRODUCT', targetId: target.productId ?? target.targetId };
  }
  return { targetType: 'COLLECTION', targetId: target.collectionId ?? target.targetId };
}
