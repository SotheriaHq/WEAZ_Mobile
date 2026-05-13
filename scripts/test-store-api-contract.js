const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const storeApiPath = path.join(repoRoot, 'src', 'api', 'StoreApi.ts');
const brandShopTabPath = path.join(repoRoot, 'components', 'catalog', 'BrandShopTab.tsx');
const storeTabPath = path.join(repoRoot, 'app', '(tabs)', 'store.tsx');

function loadStoreApiWithMock(mockApiClient) {
  const source = fs.readFileSync(storeApiPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: storeApiPath,
  }).outputText;

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '@/src/api/httpClient') {
        return { apiClient: mockApiClient };
      }
      return require(request);
    },
    URL,
    Intl,
    console,
  };

  vm.runInNewContext(compiled, sandbox, { filename: storeApiPath });
  return module.exports;
}

const rawProduct = {
  id: 'product-1',
  brandId: 'brand-1',
  brandName: 'Maison Test',
  brand: {
    name: 'Maison Test',
    logoUrl: 'https://cdn.test/logo.jpg',
    logoFile: { id: 'brand-logo-file' },
  },
  name: 'Silk Set',
  description: 'A test product',
  price: '45000',
  salePrice: '40000',
  currency: 'NGN',
  coverImage: 'https://cdn.test/cover.jpg',
  images: ['https://cdn.test/cover.jpg'],
  media: [{ url: 'https://cdn.test/cover.jpg', fileId: 'cover-file' }],
  totalStock: 7,
  sizes: ['M'],
  colors: ['black'],
  variants: [{ id: 'variant-1', size: 'M', color: 'black', stock: 7 }],
  customOrderEnabled: true,
  category: { name: 'Ready to Wear', slug: 'ready-to-wear' },
  tags: ['tailored'],
  createdAt: '2026-05-13T00:00:00.000Z',
};

async function main() {
  const calls = [];
  let nextPayload = { data: { items: [rawProduct], hasNextPage: false, total: 1 } };
  const mockApiClient = {
    get: async (url, config) => {
      calls.push({ url, config });
      return { data: nextPayload };
    },
  };
  const { MobileStoreApi } = loadStoreApiWithMock(mockApiClient);

  const brandProducts = await MobileStoreApi.getBrandProducts('brand-1', 25);
  assert.equal(calls[0].url, '/store/brands/brand-1/products');
  assert.equal(calls[0].config.params.limit, 25);
  assert.equal(brandProducts.length, 1);
  assert.equal(brandProducts[0].id, 'product-1');
  assert.equal(brandProducts[0].stock, 7);
  assert.equal(brandProducts[0].coverImage, 'https://cdn.test/cover.jpg');
  assert.equal(brandProducts[0].coverImageId, 'cover-file');
  assert.equal(brandProducts[0].brandLogo, 'https://cdn.test/logo.jpg');
  assert.equal(brandProducts[0].brandLogoFileId, 'brand-logo-file');

  calls.length = 0;
  nextPayload = { items: [rawProduct], nextCursor: 'cursor-2', total: 1 };
  const directItems = await MobileStoreApi.getBrandProducts('brand-1');
  assert.equal(calls[0].url, '/store/brands/brand-1/products');
  assert.equal(directItems.length, 1);

  calls.length = 0;
  nextPayload = [rawProduct];
  const arrayItems = await MobileStoreApi.getBrandProducts('brand-1');
  assert.equal(calls[0].url, '/store/brands/brand-1/products');
  assert.equal(arrayItems.length, 1);

  calls.length = 0;
  nextPayload = { products: { items: [rawProduct], total: 1 } };
  const nestedItems = await MobileStoreApi.getBrandProducts('brand-1');
  assert.equal(calls[0].url, '/store/brands/brand-1/products');
  assert.equal(nestedItems.length, 1);

  calls.length = 0;
  nextPayload = { items: [rawProduct], hasNextPage: true, nextCursor: 'cursor-3', total: 10 };
  const marketProducts = await MobileStoreApi.getMarketplaceProducts({ limit: 12 });
  assert.equal(calls[0].url, '/products/market');
  assert.equal(calls[0].config.params.limit, 12);
  assert.equal(marketProducts.items.length, 1);
  assert.equal(marketProducts.hasNextPage, true);
  assert.equal(marketProducts.nextCursor, 'cursor-3');
  assert.equal(marketProducts.total, 10);

  const brandShopSource = fs.readFileSync(brandShopTabPath, 'utf8');
  assert.match(brandShopSource, /MobileStoreApi\.getBrandProducts\(normalizedBrandId,\s*80\)/);
  assert.match(brandShopSource, /Store identity missing/);
  assert.match(brandShopSource, /Filters hide all products/);

  const storeTabSource = fs.readFileSync(storeTabPath, 'utf8');
  assert.doesNotMatch(storeTabSource, /activeBrandId\s*\?\?\s*user\?\.id/);

  console.log('Store API contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
