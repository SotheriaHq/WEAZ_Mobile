import type { CatalogEntityType } from '@/src/features/catalog/catalogDomain';
import { resolveCatalogEntityType } from '@/src/features/catalog/catalogEntity';

export type CatalogCardBranch = 'design' | 'product' | 'collection' | 'legacy';

export const CATALOG_CARD_BRANCH_COPY: Record<
  CatalogCardBranch,
  {
    badgeLabel: string;
    titleFallback: string;
    countSingular: string;
    countPlural: string;
    ownerActionsLabel: string;
    editLabel: string;
    deleteLabel: string;
    primaryActionKind: 'view-design' | 'view-product' | 'view-collection' | 'legacy-view';
  }
> = {
  design: {
    badgeLabel: 'Design',
    titleFallback: 'Untitled design',
    countSingular: 'media',
    countPlural: 'media',
    ownerActionsLabel: 'Design actions',
    editLabel: 'Edit design',
    deleteLabel: 'Delete design',
    primaryActionKind: 'view-design',
  },
  product: {
    badgeLabel: 'Product',
    titleFallback: 'Untitled product',
    countSingular: 'item',
    countPlural: 'items',
    ownerActionsLabel: 'Product actions',
    editLabel: 'Edit product',
    deleteLabel: 'Delete product',
    primaryActionKind: 'view-product',
  },
  collection: {
    badgeLabel: 'Collection',
    titleFallback: 'Untitled collection',
    countSingular: 'item',
    countPlural: 'items',
    ownerActionsLabel: 'Collection actions',
    editLabel: 'Edit collection',
    deleteLabel: 'Delete collection',
    primaryActionKind: 'view-collection',
  },
  legacy: {
    badgeLabel: 'Catalog item',
    titleFallback: 'Untitled item',
    countSingular: 'item',
    countPlural: 'items',
    ownerActionsLabel: 'Catalog item actions',
    editLabel: 'Edit',
    deleteLabel: 'Delete',
    primaryActionKind: 'legacy-view',
  },
};

export const resolveCatalogCardBranch = (
  value: unknown,
  fallback?: CatalogEntityType | null,
): CatalogCardBranch => {
  const entityType = resolveCatalogEntityType(value, fallback);
  if (entityType === 'DESIGN') return 'design';
  if (entityType === 'PRODUCT') return 'product';
  if (entityType === 'COLLECTION') return 'collection';
  return 'legacy';
};

export const getCatalogCardCopy = (branch: CatalogCardBranch) =>
  CATALOG_CARD_BRANCH_COPY[branch] ?? CATALOG_CARD_BRANCH_COPY.legacy;
