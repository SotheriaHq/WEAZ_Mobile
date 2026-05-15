import React from 'react';

import { CollectionCard, type CollectionCardProps } from './CollectionCard';
import { resolveCatalogCardBranch } from '@/src/features/catalog/catalogCardBranch';

export type CatalogEntityCardProps = Omit<CollectionCardProps, 'cardKind'>;

export const DesignCard = React.memo(function DesignCard(props: CatalogEntityCardProps) {
  return <CollectionCard {...props} cardKind="design" />;
});

export const CatalogCollectionCard = React.memo(function CatalogCollectionCard(props: CatalogEntityCardProps) {
  return <CollectionCard {...props} cardKind="collection" />;
});

export const CatalogEntityCard = React.memo(function CatalogEntityCard({
  collection,
  ...props
}: CatalogEntityCardProps) {
  const branch = resolveCatalogCardBranch(
    collection,
    collection.isAvailableInStore ? 'COLLECTION' : 'DESIGN',
  );

  if (branch === 'collection') {
    return (
      <CatalogCollectionCard
        {...props}
        collection={{ ...collection, entityType: 'COLLECTION' }}
      />
    );
  }

  if (branch === 'product') {
    // Product rows should use product-specific cards. Preserve collection-compatible
    // rendering here if a legacy product-shaped row enters the old grid surface.
    return (
      <CatalogCollectionCard
        {...props}
        collection={{ ...collection, entityType: 'COLLECTION' }}
      />
    );
  }

  return (
    <DesignCard
      {...props}
      collection={{ ...collection, entityType: 'DESIGN' }}
    />
  );
});

export default CatalogEntityCard;
