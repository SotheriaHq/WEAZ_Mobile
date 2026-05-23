const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const storeApiPath = path.join(repoRoot, 'src', 'api', 'StoreApi.ts');
const brandShopTabPath = path.join(repoRoot, 'components', 'catalog', 'BrandShopTab.tsx');
const legacyStoreTabPath = path.join(repoRoot, 'app', '(tabs)', 'store.tsx');
const discoverTabPath = path.join(repoRoot, 'app', '(tabs)', 'discover.tsx');
const tabLayoutPath = path.join(repoRoot, 'app', '(tabs)', '_layout.tsx');
const nativeIslandConfigPath = path.join(repoRoot, 'src', 'navigation', 'nativeIslandConfig.ts');

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
      if (request === '@/src/features/catalog/catalogEntity') {
        return { resolveCatalogEntityType: (item) => item?.entityType ?? 'PRODUCT' };
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
    post: async (url, body) => {
      calls.push({ url, body });
      return { data: { items: [], itemCount: 0, totalQuantity: 0 } };
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
  assert.equal(brandProducts[0].categoryName, 'Ready to Wear');
  assert.equal(brandProducts[0].categorySlug, 'ready-to-wear');

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

  calls.length = 0;
  nextPayload = {
    recommendedSize: 'XL',
    selectedRegion: 'UK',
    confidenceLabel: 'HIGH',
  };
  const recommendation = await MobileStoreApi.getProductSizeRecommendation('product-1', {
    region: 'UK',
    selectedSize: 'XXL',
  });
  assert.equal(calls[0].url, '/store/products/product-1/size-recommendation');
  assert.equal(calls[0].config.params.region, 'UK');
  assert.equal(calls[0].config.params.selectedSize, 'XXL');
  assert.equal(recommendation.recommendedSize, 'XL');

  calls.length = 0;
  await MobileStoreApi.addToCart({
    productId: 'product-1',
    selectedSize: 'XXL',
    sizeRecommendationSnapshot: {
      recommendedSize: 'XL',
      selectedSize: 'XXL',
      confidenceLabel: 'HIGH',
      wasManuallyChanged: true,
    },
  });
  assert.equal(calls[0].url, '/store/cart');
  assert.equal(calls[0].body.selectedSize, 'XXL');
  assert.equal(calls[0].body.sizeRecommendationSnapshot.recommendedSize, 'XL');
  assert.equal(calls[0].body.sizeRecommendationSnapshot.wasManuallyChanged, true);

  const brandShopSource = fs.readFileSync(brandShopTabPath, 'utf8');
  assert.match(brandShopSource, /MobileStoreApi\.getBrandProducts\(normalizedBrandId,\s*80\)/);
  assert.match(brandShopSource, /Store identity missing/);
  assert.match(brandShopSource, /Filters hide all products/);

  assert.equal(
    fs.existsSync(legacyStoreTabPath),
    false,
    'The removed Store tab route must not be recreated; Market is the current store entry point.',
  );

  const discoverTabSource = fs.readFileSync(discoverTabPath, 'utf8');
  assert.match(discoverTabSource, /import \{ MarketScreen \}/);
  assert.match(discoverTabSource, /return <MarketScreen \/>/);

  const tabLayoutSource = fs.readFileSync(tabLayoutPath, 'utf8');
  assert.match(tabLayoutSource, /<Tabs\.Screen\s+name="discover"[\s\S]*title:\s*'Market'/);
  assert.doesNotMatch(tabLayoutSource, /<Tabs\.Screen\s+name="store"/);

  const nativeIslandConfigSource = fs.readFileSync(nativeIslandConfigPath, 'utf8');
  assert.match(nativeIslandConfigSource, /market:\s*'market'/);
  assert.match(nativeIslandConfigSource, /label:\s*'Market'/);
  assert.match(nativeIslandConfigSource, /return '\/\(tabs\)\/discover' as const/);

  console.log('Store API contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
