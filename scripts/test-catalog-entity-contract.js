const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const catalogEntitySource = read('src/features/catalog/catalogEntity.ts');
const catalogTargetSource = read('src/features/catalog/catalogTarget.ts');
const marketApiSource = read('src/api/MarketApi.ts');
const storeApiSource = read('src/api/StoreApi.ts');
const brandApiSource = read('src/api/BrandApi.ts');
const marketTypesSource = read('src/features/market/types.ts');
const marketScreenSource = read('src/features/market/components/MarketScreen.tsx');
const catalogCardBranchSource = read('src/features/catalog/catalogCardBranch.ts');
const catalogEntityCardSource = read('components/catalog/CatalogEntityCard.tsx');
const collectionCardSource = read('components/catalog/CollectionCard.tsx');
const mobileRoutingSource = read('src/utils/mobileRouting.ts');
const studioNavigationBridgeSource = read('src/features/studio/studioNavigationBridge.ts');
const savedItemsApiSource = read('src/api/SavedItemsApi.ts');

assert.match(catalogEntitySource, /SOURCE_TYPE_TO_ENTITY_TYPE/);
assert.match(catalogEntitySource, /COLLECTION_MEDIA:\s*'DESIGN'/);
assert.match(catalogEntitySource, /STORE_PRODUCT:\s*'PRODUCT'/);
assert.match(catalogEntitySource, /STORE_COLLECTION:\s*'COLLECTION'/);
assert.match(catalogEntitySource, /return fallback \?\? null/);

assert.match(catalogTargetSource, /export type CatalogTargetType/);
assert.match(catalogTargetSource, /normalizeCatalogTarget/);
assert.match(catalogTargetSource, /mapCatalogTargetForLegacyApi/);
assert.match(catalogTargetSource, /targetType:\s*'COLLECTION'/);
assert.match(catalogTargetSource, /legacyCollectionId/);

assert.match(marketApiSource, /entityType:\s*resolveCatalogEntityType\(raw,\s*'DESIGN'\)\s*\?\?\s*'DESIGN'/);
assert.match(storeApiSource, /entityType:\s*resolveCatalogEntityType\(raw,\s*'PRODUCT'\)\s*\?\?\s*'PRODUCT'/);
assert.match(brandApiSource, /entityType:\s*\n\s*resolveCatalogEntityType\(/);

assert.match(marketTypesSource, /entityType:\s*'PRODUCT'/);
assert.match(marketTypesSource, /entityType:\s*'DESIGN'/);
assert.match(marketScreenSource, /entityType:\s*'PRODUCT' as const/);
assert.match(marketScreenSource, /entityType:\s*'DESIGN' as const/);
assert.match(marketScreenSource, /function MarketProductCard/);
assert.match(marketScreenSource, /function MarketDesignCard/);
// Product vs Design cards are now distinguished by entityType branching in
// MarketCard (the prior `typeLabel="Product"/"Design"` props were removed when
// the cards were unified onto UnifiedProductCard). Assert the live contract.
assert.match(marketScreenSource, /props\.item\.entityType === 'PRODUCT'/);
assert.match(marketScreenSource, /const canRequestCustomOrder = isCustomReady\(item\)/);
// Design custom-order action label now uses the shared BAG_IT_LABEL constant
// instead of a hardcoded 'Request' string.
assert.match(marketScreenSource, /actionLabel=\{canRequestCustomOrder \? BAG_IT_LABEL : undefined\}/);

assert.match(catalogCardBranchSource, /resolveCatalogCardBranch/);
assert.match(catalogCardBranchSource, /primaryActionKind:\s*'view-design'/);
assert.match(catalogCardBranchSource, /primaryActionKind:\s*'view-product'/);
assert.match(catalogCardBranchSource, /primaryActionKind:\s*'view-collection'/);
assert.match(catalogEntityCardSource, /export const DesignCard/);
assert.match(catalogEntityCardSource, /export const CatalogCollectionCard/);
assert.match(catalogEntityCardSource, /resolveCatalogCardBranch/);
assert.doesNotMatch(
  catalogEntityCardSource,
  /collection=\{\{\s*\.\.\.collection/,
  'CatalogEntityCard must preserve collection object identity for memoized cards.',
);
assert.match(collectionCardSource, /testID=\{`catalog-card-\$\{cardBranch\}`\}/);
assert.match(collectionCardSource, /accessibilityLabel=\{copy\.ownerActionsLabel\}/);
assert.doesNotMatch(
  collectionCardSource,
  /imageToneOverlay/,
  'Catalog thumbnails must not apply a full-image dark tone overlay.',
);

/*
  There is ONE content viewer per kind, and these builders must point at it.

  `routeForDesignTarget` used to return `/designs/[designId]`, which rendered a
  completely different screen from the one the catalogue opens — so a design
  reached from a notification, a search result or saved items looked nothing
  like the same design reached by tapping its card. The old screen and its two
  alias routes are deleted; these assertions stop them being reintroduced by a
  builder quietly pointing back at a path that no longer has a viewer.
*/
assert.match(mobileRoutingSource, /export function routeForDesignTarget/);
assert.match(mobileRoutingSource, /pathname:\s*'\/market-viewer'/);
assert.match(mobileRoutingSource, /sourceType:\s*'DESIGN'/);
assert.match(mobileRoutingSource, /export function routeForStoreCollectionTarget/);
assert.match(mobileRoutingSource, /pathname:\s*'\/collection-viewer'/);
assert.doesNotMatch(
  mobileRoutingSource,
  /pathname:\s*'\/designs\/\[designId\]'/,
  'the retired second design viewer must not come back',
);
assert.doesNotMatch(
  mobileRoutingSource,
  /pathname:\s*'\/collections\/\[collectionId\]'/,
  'the retired second collection viewer must not come back',
);
assert.match(mobileRoutingSource, /routeForLegacyCollectionBackedDesignTarget/);
assert.match(mobileRoutingSource, /targetType === 'DESIGN'/);

// The route files themselves are gone. A stale alias would render a viewer
// nobody maintains, which is exactly how the split survived unnoticed.
for (const retired of [
  path.join('app', 'designs', '[designId].tsx'),
  path.join('app', 'collections', '[collectionId].tsx'),
  path.join('components', 'catalog', 'CollectionDetailViewer.tsx'),
]) {
  assert.equal(
    fs.existsSync(path.join(root, retired)),
    false,
    `${retired} was retired when the content viewers were consolidated; do not recreate it`,
  );
}

// Comments moved with the viewers — the retired screen was the only one that
// had them, so a comment notification must still land somewhere that shows one.
const marketViewerSource = read('src/features/market/components/MarketCommerceViewer.tsx');
assert.match(marketViewerSource, /CollectionCommentsSheet/);
assert.match(marketViewerSource, /openComments/);
assert.match(studioNavigationBridgeSource, /pathname === '\/designs\/create'/);
assert.match(studioNavigationBridgeSource, /pathname:\s*'\/designs\/\[designId\]\/edit'/);
assert.match(studioNavigationBridgeSource, /routeForStoreCollectionTarget\(collectionId\)/);
assert.match(savedItemsApiSource, /saveCatalogTarget/);
assert.match(savedItemsApiSource, /unsaveCatalogTarget/);
assert.match(savedItemsApiSource, /mapCatalogTargetForLegacyApi/);

console.log('Catalog entity contract checks passed.');
