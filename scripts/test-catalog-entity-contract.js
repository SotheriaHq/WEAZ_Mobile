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
assert.doesNotMatch(marketScreenSource, /typeLabel="Product"/);
assert.doesNotMatch(marketScreenSource, /typeLabel="Runway"/);
assert.match(marketScreenSource, /actionLabel=\{unavailable \? 'Out' : BAG_IT_LABEL\}/);
assert.match(marketScreenSource, /actionLabel=\{canRequestCustomOrder \? BAG_IT_LABEL : undefined\}/);

assert.match(catalogCardBranchSource, /resolveCatalogCardBranch/);
assert.match(catalogCardBranchSource, /primaryActionKind:\s*'view-design'/);
assert.match(catalogCardBranchSource, /primaryActionKind:\s*'view-product'/);
assert.match(catalogCardBranchSource, /primaryActionKind:\s*'view-collection'/);
assert.match(catalogEntityCardSource, /export const DesignCard/);
assert.match(catalogEntityCardSource, /export const CatalogCollectionCard/);
assert.match(catalogEntityCardSource, /resolveCatalogCardBranch/);
assert.match(collectionCardSource, /testID=\{`catalog-card-\$\{cardBranch\}`\}/);
assert.match(collectionCardSource, /accessibilityLabel=\{copy\.ownerActionsLabel\}/);

assert.match(mobileRoutingSource, /export function routeForDesignTarget/);
assert.match(mobileRoutingSource, /pathname:\s*'\/designs\/\[designId\]'/);
assert.match(mobileRoutingSource, /export function routeForStoreCollectionTarget/);
assert.match(mobileRoutingSource, /pathname:\s*'\/collections\/\[collectionId\]'/);
assert.match(mobileRoutingSource, /routeForLegacyCollectionBackedDesignTarget/);
assert.match(mobileRoutingSource, /targetType === 'DESIGN'/);
assert.match(studioNavigationBridgeSource, /pathname === '\/designs\/create'/);
assert.match(studioNavigationBridgeSource, /pathname:\s*'\/designs\/\[designId\]\/edit'/);
assert.match(studioNavigationBridgeSource, /routeForStoreCollectionTarget\(collectionId\)/);
assert.match(savedItemsApiSource, /saveCatalogTarget/);
assert.match(savedItemsApiSource, /unsaveCatalogTarget/);
assert.match(savedItemsApiSource, /mapCatalogTargetForLegacyApi/);

console.log('Catalog entity contract checks passed.');
