const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  }).outputText;
}

function loadMobileRouting() {
  const filePath = path.join(repoRoot, 'src', 'utils', 'mobileRouting.ts');
  const module = { exports: {} };
  vm.runInNewContext(compile(filePath), { module, exports: module.exports, URL, URLSearchParams }, { filename: filePath });
  return module.exports;
}

function loadSearchApi(apiClient) {
  const filePath = path.join(repoRoot, 'src', 'api', 'SearchApi.ts');
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === '@/src/api/httpClient') {
      return { apiClient };
    }
    throw new Error(`Unexpected SearchApi import: ${specifier}`);
  };
  vm.runInNewContext(
    compile(filePath),
    { module, exports: module.exports, require, URL, URLSearchParams },
    { filename: filePath },
  );
  return module.exports;
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const searchTypes = read('src/types/search.ts');
const searchApi = read('src/api/SearchApi.ts');
const searchScreen = read('app/search.tsx');
const mobileRouting = read('src/utils/mobileRouting.ts');
const searchHistory = read('src/utils/searchHistory.ts');
const marketScreen = read('src/features/market/components/MarketScreen.tsx');
const marketSuggestions = read('src/features/market/components/MobileMarketSuggestionBlocks.tsx');

assert.match(searchTypes, /export type SearchEntityType = 'profile' \| 'product' \| 'brand' \| 'design' \| 'collection' \| 'tag'/);
assert.match(searchTypes, /profiles: SearchSuggestionSection/);
assert.match(searchScreen, /\{ key: 'profile', label: 'Profiles' \}/);
assert.match(searchScreen, /item\.type === 'profile'[\s\S]*\? 'Profile'/);
assert.match(searchScreen, /sectionItems\(payload\.profiles\)/);
assert.match(searchScreen, /getRecentQueryForSearchItem/);
assert.match(searchScreen, /item\.type === 'profile'[\s\S]*item\.subtitle\?\.trim/);
assert.doesNotMatch(searchScreen, /saveRecentSearch\(item\.href\)/);
assert.match(searchScreen, /searchRequestIdRef/);
assert.match(searchScreen, /controller\.signal\.aborted/);
assert.match(searchScreen, /requestIdRef\.current \+= 1/);
assert.match(searchScreen, /searchRequestIdRef\.current \+= 1/);

assert.match(searchApi, /normalizeSuggestionResponse/);
assert.match(searchApi, /profiles: normalizeSection\(source\.profiles\)/);
assert.match(searchApi, /products: normalizeSection\(source\.products\)/);
assert.match(searchApi, /storeCollections: normalizeSection\(source\.storeCollections\)/);
assert.match(searchApi, /tags: Array\.isArray\(source\.tags\)/);
assert.match(searchApi, /const EMPTY_COUNTS: Record<SearchEntityType, number>/);
assert.match(searchApi, /profile: 0/);
assert.match(searchApi, /normalizeSearchResponse/);

assert.match(mobileRouting, /case 'profile'/);
assert.match(mobileRouting, /pathname: '\/profile\/\[id\]'/);
// Phase 1: brand-owning profile results (carrying brand metadata) must reach the
// brand catalogue, while plain user profiles still open the public profile. The
// previous guard forbidding any catalog routing inside the profile case is
// intentionally removed; the runtime fixtures below enforce both behaviors.
assert.match(mobileRouting, /isBrandProfile[\s\S]{0,160}pathname: '\/catalog\/\[brandId\]'/);

const { routeForSearchItem } = loadMobileRouting();

assert.deepEqual(
  toJson(routeForSearchItem({
    id: 'profile-row-id',
    type: 'profile',
    title: 'Avery Cotour',
    subtitle: '@averycotour',
    href: '/profile/user-1',
    score: 100,
    metadata: {
      profileUserId: 'user-1',
      ownerId: 'owner-1',
      resultKind: 'identity',
      isStoreOpen: false,
    },
  })),
  {
    pathname: '/profile/[id]',
    params: { id: 'user-1' },
  },
);

assert.deepEqual(
  toJson(routeForSearchItem({
    id: 'non-owner-id',
    type: 'profile',
    title: 'Jaff View Cotour',
    subtitle: '@jaffviewcotour',
    href: '/profile/user-from-href',
    score: 100,
    metadata: { ownerId: 'owner-user-1', resultKind: 'identity', isStoreOpen: false },
  })),
  {
    pathname: '/profile/[id]',
    params: { id: 'owner-user-1' },
  },
);

assert.deepEqual(
  toJson(routeForSearchItem({
    id: 'non-user-id',
    type: 'profile',
    title: 'Avery Cotour',
    subtitle: '@averycotour',
    href: '/profile/user-from-href',
    score: 100,
  })),
  {
    pathname: '/profile/[id]',
    params: { id: 'user-from-href' },
  },
);

assert.deepEqual(
  toJson(routeForSearchItem({
    id: 'profile-item-id',
    type: 'profile',
    title: 'Fallback Profile',
    href: '/profile',
    score: 100,
  })),
  {
    pathname: '/profile/[id]',
    params: { id: 'profile-item-id' },
  },
);

assert.deepEqual(
  toJson(routeForSearchItem({
    id: 'brand-1',
    type: 'brand',
    title: 'Open Brand',
    href: '/profile/owner-1',
    score: 90,
    metadata: { ownerId: 'owner-1', isStoreOpen: true },
  })),
  {
    pathname: '/catalog/[brandId]',
    params: { brandId: 'owner-1' },
  },
);

// Phase 1: a profile result that owns a brand storefront (brandId/brandName in
// metadata) must open the brand catalogue using its owner user id, since the
// backend collapses the standalone brand row into this richer profile row.
assert.deepEqual(
  toJson(routeForSearchItem({
    id: 'brand-owner-profile',
    type: 'profile',
    title: 'Avery',
    subtitle: '@avery',
    href: '/profile/owner-9',
    score: 100,
    metadata: {
      profileUserId: 'owner-9',
      ownerId: 'owner-9',
      brandId: 'brand-9',
      brandName: 'Avery',
      resultKind: 'identity',
      isStoreOpen: true,
    },
  })),
  {
    pathname: '/catalog/[brandId]',
    params: { brandId: 'owner-9' },
  },
);

assert.match(searchHistory, /const normalized = query\.trim\(\)\.toLowerCase\(\)/);
assert.doesNotMatch(searchHistory, /href/);
assert.doesNotMatch(searchHistory, /\/profile\//);

assert.match(searchScreen, /const onClearQuery = useCallback/);
assert.match(searchScreen, /requestIdRef\.current \+= 1;[\s\S]*searchRequestIdRef\.current \+= 1;/);
assert.match(searchScreen, /setSuggestions\(null\);[\s\S]*setSuggestionsError\(null\);[\s\S]*setSuggestionsLoading\(false\);[\s\S]*setResultState\(\{ status: 'idle' \}\);/);

assert.match(marketScreen, /MobileStoreApi\.getMarketplaceProducts/);
assert.match(marketScreen, /getMarketFeed/);
assert.doesNotMatch(marketScreen, /SearchApi\.search/);
assert.doesNotMatch(marketScreen, /SearchApi\.suggest/);
assert.match(marketSuggestions, /getMarketSuggestions/);
assert.doesNotMatch(marketSuggestions, /SearchApi\.search/);
assert.doesNotMatch(marketSuggestions, /SearchApi\.suggest/);

async function runSearchApiNormalizationChecks() {
  const calls = [];
  const apiClient = {
    get: async (url, options) => {
      calls.push({ url, options });
      if (url === '/v1/search/suggest') {
        return {
          data: {
            data: {
              query: 'cotour',
              normalizedQuery: 'cotour',
              profiles: {
                items: [
                  {
                    id: 'user-1',
                    type: 'profile',
                    title: 'Avery Cotour',
                    subtitle: '@averycotour',
                    href: '/profile/user-1',
                    score: '900',
                  },
                  {
                    id: 'bad-type',
                    type: 'unknown',
                    title: 'Bad item',
                    href: '/profile/bad-type',
                    score: 1,
                  },
                ],
                total: '2',
              },
              products: { items: [{ type: 'product', title: 'Missing id' }], total: '1' },
              brands: null,
              designs: undefined,
              storeCollections: { items: 'not-array', total: 'not-a-number' },
              tags: [
                { id: 'tag-1', title: 'cotour', score: '4' },
                { id: '', title: 'bad-tag', score: 1 },
              ],
            },
          },
        };
      }
      return {
        data: {
          data: {
            query: '@averycotour',
            normalizedQuery: 'averycotour',
            types: ['profile', 'unknown'],
            items: [
              {
                id: 'user-1',
                type: 'profile',
                title: 'Avery Cotour',
                subtitle: '@averycotour',
                score: '1000',
                metadata: { profileUserId: 'user-1', isStoreOpen: false },
              },
              {
                id: 'bad',
                type: 'profile',
                score: 5,
              },
            ],
            counts: { profile: '1', product: undefined },
            meta: { page: '1', limit: '24', hasNextPage: false },
          },
        },
      };
    },
  };
  const { SearchApi } = loadSearchApi(apiClient);

  const suggestions = await SearchApi.suggest({ q: 'cotour' });
  assert.equal(suggestions.profiles.total, 2);
  assert.equal(suggestions.profiles.items.length, 1);
  assert.equal(suggestions.profiles.items[0].title, 'Avery Cotour');
  assert.equal(suggestions.products.items.length, 0);
  assert.deepEqual(toJson(suggestions.brands), { items: [], total: 0 });
  assert.deepEqual(toJson(suggestions.designs), { items: [], total: 0 });
  assert.deepEqual(toJson(suggestions.storeCollections), { items: [], total: 0 });
  assert.equal(suggestions.tags.length, 1);
  assert.equal(suggestions.tags[0].href, '/search?q=cotour&type=tag');

  const searchResult = await SearchApi.search({ q: '@averycotour', type: 'profile', page: 1, limit: 24 });
  assert.deepEqual(toJson(searchResult.types), ['profile']);
  assert.equal(searchResult.items.length, 1);
  assert.equal(searchResult.items[0].href, '/profile/user-1');
  assert.equal(searchResult.counts.profile, 1);
  assert.equal(searchResult.counts.product, 0);
  assert.equal(searchResult.meta.page, 1);
  assert.equal(searchResult.meta.limit, 24);

  calls.length = 0;
  apiClient.get = async () => ({ data: { data: { query: 'legacy' } } });
  const legacySuggestions = await SearchApi.suggest({ q: 'legacy' });
  assert.deepEqual(toJson(legacySuggestions.profiles), { items: [], total: 0 });
  assert.deepEqual(toJson(legacySuggestions.products), { items: [], total: 0 });
  assert.deepEqual(toJson(legacySuggestions.tags), []);

  const legacySearch = await SearchApi.search({ q: 'legacy', type: 'all', page: 1, limit: 20 });
  assert.deepEqual(toJson(legacySearch.counts), {
    profile: 0,
    product: 0,
    brand: 0,
    design: 0,
    collection: 0,
    tag: 0,
  });
  assert.deepEqual(toJson(legacySearch.items), []);
}

runSearchApiNormalizationChecks()
  .then(() => {
    console.log('Mobile search contract checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
