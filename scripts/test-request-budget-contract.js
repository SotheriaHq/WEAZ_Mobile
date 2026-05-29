const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const marketScreen = read('src/features/market/components/MarketScreen.tsx');
const searchScreen = read('app/search.tsx');

assert.match(
  marketScreen,
  /MARKET_SEARCH_DEBOUNCE_MS\s*=\s*350/,
  'Market search must debounce before network-backed query changes.',
);
assert.match(
  marketScreen,
  /useDebouncedValue\(search,\s*MARKET_SEARCH_DEBOUNCE_MS\)/,
  'Market search input must use the debounce helper.',
);
assert.match(
  marketScreen,
  /buildMarketQueryKey\(filters,\s*debouncedSearch\)/,
  'Market query key must be based on debounced search state.',
);
assert.match(
  marketScreen,
  /search:\s*debouncedSearch/,
  'Market API requests must use debounced search state.',
);
assert.doesNotMatch(
  marketScreen,
  /\[filters\.category,\s*filters\.maxPrice,\s*filters\.minPrice,\s*filters\.sort,\s*search\]/,
  'Market reset effect must not depend on raw search keystrokes.',
);
assert.match(
  marketScreen,
  /\[marketQueryKey\]/,
  'Market reset effect must be driven by the stable query key.',
);
assert.match(
  marketScreen,
  /marketSnapshotCache/,
  'Market screen should keep a short-lived snapshot cache for navigation return.',
);
assert.match(
  marketScreen,
  /MARKET_HOME_CACHE_TTL_MS\s*=\s*3 \* 60 \* 1000/,
  'Market snapshot cache must have a bounded freshness window.',
);
assert.match(
  marketScreen,
  /marketRequestInFlight/,
  'Market requests must dedupe identical in-flight API batches.',
);
assert.match(
  marketScreen,
  /resetInFlightKeyRef/,
  'Market reset requests must be guarded while in flight.',
);
assert.match(
  marketScreen,
  /moreInFlightKeyRef/,
  'Market pagination requests must be guarded while in flight.',
);
assert.match(
  marketScreen,
  /loadedMorePageKeysRef/,
  'Market pagination must avoid refetching the same cursor page.',
);
assert.match(
  marketScreen,
  /loadMarket\('reset', \{ forceRefresh: true \}\)/,
  'Pull-to-refresh and retry flows must still force a fresh request.',
);

assert.match(
  searchScreen,
  /SEARCH_SCREEN_DEBOUNCE_MS\s*=\s*350/,
  'Search screen must debounce network-backed query changes.',
);
assert.match(
  searchScreen,
  /activeSearchRequestKeyRef/,
  'Search screen must dedupe duplicate in-flight searches.',
);
assert.match(
  searchScreen,
  /setTimeout\(\(\) => \{[\s\S]*SEARCH_SCREEN_DEBOUNCE_MS/,
  'Search screen debounce timeout must use the shared debounce budget.',
);
assert.doesNotMatch(
  searchScreen,
  /setFilterType\(option\.key\);[\s\S]{0,160}void runSearch\(query,\s*option\.key/,
  'Changing a search filter must not also fire an immediate duplicate search request.',
);

console.log('Request budget contract passed.');
