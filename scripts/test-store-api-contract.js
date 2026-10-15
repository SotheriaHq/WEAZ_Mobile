const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { compile, createScriptRequire } = require('./helpers/mobile-script-require');

const repoRoot = path.resolve(__dirname, '..');
const storeApiPath = path.join(repoRoot, 'src', 'api', 'StoreApi.ts');
const brandShopTabPath = path.join(repoRoot, 'components', 'catalog', 'BrandShopTab.tsx');
const legacyStoreTabPath = path.join(repoRoot, 'app', '(tabs)', 'store.tsx');
const discoverTabPath = path.join(repoRoot, 'app', '(tabs)', 'discover.tsx');
const tabLayoutPath = path.join(repoRoot, 'app', '(tabs)', '_layout.tsx');
const nativeIslandConfigPath = path.join(repoRoot, 'src', 'navigation', 'nativeIslandConfig.ts');

function loadStoreApiWithMock(mockApiClient) {
  const module = { exports: {} };
  const scriptRequire = createScriptRequire({
    repoRoot,
    mocks: {
      '@/src/api/httpClient': { apiClient: mockApiClient },
      '@/src/features/catalog/catalogEntity': {
        resolveCatalogEntityType: (item) => item?.entityType ?? 'PRODUCT',
      },
    },
  });
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => scriptRequire(request, storeApiPath),
    URL,
    Intl,
    console,
  };

  vm.runInNewContext(compile(storeApiPath), sandbox, { filename: storeApiPath });
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
  // The island chip is labelled "Market" — the commerce discover surface's
  // product name. This assertion still read 'Shop' from before the rename and
  // had been failing on an unchanged config.
  assert.match(nativeIslandConfigSource, /label:\s*'Market'/);
  assert.match(nativeIslandConfigSource, /return '\/\(tabs\)\/discover' as const/);

  /*
    The pager-dot regression, reproduced against the REAL payload shape.

    `store.service.ts` builds `media` as `images.map(...)` where each object's
    `url` has been swapped for a resolved display URL. So the same photograph
    appears twice under two different hosts and paths, and the string alias
    carries no file id — nothing links the two by identity, which is why five
    photos rendered ten dots on a product whose server-side cap is six.

    This is a behavioural test on purpose: the failure is silent (no error, no
    type change, just a wrong count in a row of dots) and a source-text
    assertion would not have caught it.
  */
  const RAW = (n) => `https://bucket.s3.eu-west-1.amazonaws.com/products/p${n}.webp`;
  const DISPLAY = (n) => `https://cdn.test/media/file-${n}?X-Amz-Signature=abc${n}`;
  const photoCount = 5;

  const dualAliasProduct = {
    ...rawProduct,
    id: 'product-dual-alias',
    images: Array.from({ length: photoCount }, (_, i) => RAW(i)),
    media: Array.from({ length: photoCount }, (_, i) => ({
      id: `file-${i}`,
      fileUploadId: `file-${i}`,
      url: DISPLAY(i),
      sourceUrl: RAW(i),
    })),
  };

  const loadOne = async (product) => {
    calls.length = 0;
    nextPayload = { data: { items: [product], hasNextPage: false, total: 1 } };
    const [normalized] = await MobileStoreApi.getBrandProducts('brand-1', 25);
    return normalized;
  };

  const dualAliasItem = await loadOne(dualAliasProduct);
  assert.equal(
    dualAliasItem.images.length,
    photoCount,
    `raw + display aliases for the same ${photoCount} photos must collapse to ${photoCount} entries, not ${photoCount * 2}`,
  );
  // Joined rather than deep-equal: the module runs in a `vm` realm, so arrays
  // it returns have that realm's Array prototype and `deepStrictEqual` fails on
  // prototype identity even when every element matches.
  assert.equal(
    dualAliasItem.images.map((entry) => entry.fileId).join(','),
    Array.from({ length: photoCount }, (_, i) => `file-${i}`).join(','),
    'the file id must survive the merge — it is what re-signs an expired URL',
  );
  assert.ok(
    dualAliasItem.images.every((entry) => !String(entry.url).includes('amazonaws.com')),
    'the RESOLVED url must win over the raw storage url; the raw one is not fetchable by the client',
  );

  // `sourceUrl` joins the aliases by identity, so it must work when the lengths
  // DISAGREE too — one resolved entry plus two raw ones is two photographs, not
  // three. Position-alignment cannot help here; only the identity can.
  const unevenProduct = {
    ...rawProduct,
    id: 'product-uneven',
    images: [RAW(0), RAW(1)],
    media: [{ id: 'file-0', fileUploadId: 'file-0', url: DISPLAY(0), sourceUrl: RAW(0) }],
  };
  const unevenItem = await loadOne(unevenProduct);
  assert.equal(
    unevenItem.images.length,
    2,
    'a raw entry with no resolved twin is still its own photo, and the twinned pair collapses',
  );

  /*
    An older API that predates `sourceUrl` must still page correctly — installed
    builds talk to whatever server they are pointed at. Equal alias lengths are
    the evidence there, since `media` is `images.map(...)`.
  */
  const legacyServerProduct = {
    ...rawProduct,
    id: 'product-legacy-server',
    images: Array.from({ length: photoCount }, (_, i) => RAW(i)),
    media: Array.from({ length: photoCount }, (_, i) => ({
      id: `file-${i}`,
      fileUploadId: `file-${i}`,
      url: DISPLAY(i),
    })),
  };
  const legacyItem = await loadOne(legacyServerProduct);
  assert.equal(
    legacyItem.images.length,
    photoCount,
    'without sourceUrl, equal alias lengths must still collapse raw-vs-display by position',
  );

  console.log('Store API contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
