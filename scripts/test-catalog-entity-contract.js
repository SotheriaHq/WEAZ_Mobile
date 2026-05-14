const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const catalogEntitySource = read('src/features/catalog/catalogEntity.ts');
const marketApiSource = read('src/api/MarketApi.ts');
const storeApiSource = read('src/api/StoreApi.ts');
const brandApiSource = read('src/api/BrandApi.ts');
const marketTypesSource = read('src/features/market/types.ts');
const marketScreenSource = read('src/features/market/components/MarketScreen.tsx');

assert.match(catalogEntitySource, /SOURCE_TYPE_TO_ENTITY_TYPE/);
assert.match(catalogEntitySource, /COLLECTION_MEDIA:\s*'DESIGN'/);
assert.match(catalogEntitySource, /STORE_PRODUCT:\s*'PRODUCT'/);
assert.match(catalogEntitySource, /STORE_COLLECTION:\s*'COLLECTION'/);
assert.match(catalogEntitySource, /return fallback \?\? null/);

assert.match(marketApiSource, /entityType:\s*resolveCatalogEntityType\(raw,\s*'DESIGN'\)\s*\?\?\s*'DESIGN'/);
assert.match(storeApiSource, /entityType:\s*resolveCatalogEntityType\(raw,\s*'PRODUCT'\)\s*\?\?\s*'PRODUCT'/);
assert.match(brandApiSource, /entityType:\s*\n\s*resolveCatalogEntityType\(/);

assert.match(marketTypesSource, /entityType:\s*'PRODUCT'/);
assert.match(marketTypesSource, /entityType:\s*'DESIGN'/);
assert.match(marketScreenSource, /entityType:\s*'PRODUCT' as const/);
assert.match(marketScreenSource, /entityType:\s*'DESIGN' as const/);

console.log('Catalog entity contract checks passed.');
