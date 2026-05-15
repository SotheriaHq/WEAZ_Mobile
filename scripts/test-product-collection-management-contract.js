const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readProjectFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

const studioRoutesSource = readProjectFile('src', 'features', 'studio', 'studioRoutes.ts');
assert.match(studioRoutesSource, /key:\s*'createProduct'[\s\S]*path:\s*'\/studio\/store\/products\/new'/);
assert.match(studioRoutesSource, /key:\s*'editProduct'[\s\S]*path:\s*'\/studio\/store\/products\/:id\/edit'/);
assert.match(studioRoutesSource, /key:\s*'createCollection'[\s\S]*path:\s*'\/studio\/store\/collections\/new'/);

const studioBridgeSource = readProjectFile('src', 'features', 'studio', 'studioNavigationBridge.ts');
assert.match(studioBridgeSource, /pathname === '\/products\/create'[\s\S]*\/studio\/store\/products\/new/);
assert.ok(studioBridgeSource.includes("const productEditMatch = pathname.match(/^\\/products\\/([^/]+)\\/edit$/);"));
assert.ok(
  studioBridgeSource.includes('path: `/studio/store/products/${encodeURIComponent(decodeURIComponent(productEditMatch[1]))}/edit`,'),
);

const brandApiSource = readProjectFile('src', 'api', 'BrandApi.ts');
const createCollectionStart = brandApiSource.indexOf('async createCollection');
const createCollectionEnd = brandApiSource.indexOf('/**\r\n   * Delete a collection', createCollectionStart);
const createCollectionBlock = brandApiSource.slice(
  createCollectionStart,
  createCollectionEnd > createCollectionStart ? createCollectionEnd : undefined,
);
assert.match(createCollectionBlock, /\/store-collections\/initialize/);
assert.match(createCollectionBlock, /\/store-collections\/\$\{collectionId\}\/finalize/);
assert.doesNotMatch(createCollectionBlock, /apiClient\.post\(['"`]\/collections/);

const createCollectionScreenSource = readProjectFile('app', 'catalog', 'create-collection.tsx');
assert.match(createCollectionScreenSource, /routeKey:\s*'createCollection'/);
assert.match(createCollectionScreenSource, /brandApi\.createCollection/);
assert.match(createCollectionScreenSource, /Open Studio Builder/);

console.log('Product and collection management contract tests passed.');
