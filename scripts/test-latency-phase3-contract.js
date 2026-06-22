const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const tabLayout = read('app/(tabs)/_layout.tsx');
const market = read('src/features/market/components/MarketScreen.tsx');
const runway = read('src/features/feed/components/MarketFeedScreen.tsx');
const profile = read('app/(tabs)/me.tsx');
const inbox = read('app/(tabs)/inbox.tsx');
const catalog = read('app/(tabs)/catalog/index.tsx');

assert.match(
  tabLayout,
  /schedulePreloads\('first-media-timeout'\);\s*},\s*1500\);/,
  'Tab warming must have a bounded fallback when first Runway media is slow or absent.',
);
assert.match(
  market,
  /loading\s*&&\s*allItems\.length === 0\s*&&\s*collections\.length === 0\s*&&\s*apiSections\.length === 0/,
  'Market must not replace cached collections or backend sections with a full skeleton.',
);
assert.match(
  market,
  /buildMarketQueryKey\(filters,\s*debouncedSearch,\s*marketViewerKey\)/,
  'Market cache data must be isolated by viewer identity.',
);
assert.match(runway, /readMemoryCachedMarketFeed/, 'Runway must synchronously seed from its memory cache.');
assert.match(runway, /readCachedMarketFeed\(cacheIdentity\)/, 'Runway must hydrate its persisted cache before fetching fresh data.');
assert.match(profile, /<ProfileSectionSkeleton\s*\/>/, 'Profile secondary orders loading must use a section skeleton, not a blocking spinner.');
assert.match(
  inbox,
  /enabled:\s*deferredWorkReady\s*&&\s*status === 'authenticated'/,
  'Inbox realtime setup must wait until first-paint work has settled.',
);
assert.doesNotMatch(
  catalog,
  /!transitionReady/,
  'Catalog cold rendering must not wait for InteractionManager before showing its destination surface.',
);
assert.match(
  catalog,
  /!hasCachedCatalogContent\s*&&\s*Boolean\(/,
  'Catalog full skeleton must be limited to a genuine cold profile/grid load.',
);

for (const source of [market, runway, profile, inbox, catalog]) {
  assert.match(source, /cache_hit|cache_miss/, 'Every scoped data screen must expose cache nav-perf evidence.');
}

console.log('Latency Phase 3 cache-first contract checks passed.');
