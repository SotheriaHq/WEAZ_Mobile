/**
 * Market overnight restore and automatic freshness (work queue item 7).
 *
 * Measured on device: after an idle night Android reclaimed the app, and
 * Market reopened on `cache_miss` and a cold skeleton because its snapshot
 * map lived only in memory. These checks pin the fix: the home snapshot is
 * persisted per viewer, restored stale and refreshed behind the screen, a
 * fast first tap waits for the boot prime, and returning to Market refreshes
 * a stale snapshot inline.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function compile(relative) {
  return ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
}

function loadPersistentCache() {
  const warm = new Map();
  const disk = new Map();
  let getAllKeysCalls = 0;
  const asyncStorage = {
    getAllKeys: async () => {
      getAllKeysCalls += 1;
      return [...disk.keys()];
    },
    multiGet: async (keys) => keys.map((key) => [key, disk.get(key) ?? null]),
    multiSet: async (entries) => entries.forEach(([key, value]) => disk.set(key, value)),
    multiRemove: async (keys) => keys.forEach((key) => disk.delete(key)),
  };
  const module = { exports: {} };
  vm.runInNewContext(compile('src/state/persistentScreenCache.ts'), {
    module,
    exports: module.exports,
    setTimeout,
    clearTimeout,
    globalThis: {},
    require: (request) => {
      if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
      if (request === '@/src/perf/wiezPerf') return { perfEnabled: () => false, perfNote: () => undefined };
      if (request === './screenWarmState') {
        return {
          readWarmScreenState: (key) => (warm.has(key) ? warm.get(key) : null),
          writeWarmScreenState: (key, value) => warm.set(key, value),
        };
      }
      return require(request);
    },
  });
  return { cache: module.exports, warm, disk, getAllKeysCalls: () => getAllKeysCalls };
}

async function main() {
  // ---- the boot prime is shared, awaitable, and never overwrites this session
  const { cache, warm, disk, getAllKeysCalls } = loadPersistentCache();
  disk.set('warm:v1:market-home:v1:user_1', JSON.stringify({ cachedAt: 1, products: [] }));
  disk.set('warm:v1:profile:user_1', JSON.stringify({ from: 'disk' }));
  warm.set('profile:user_1', { from: 'this-session' });

  assert.equal(cache.isPersistentScreenCachePrimed(), true, 'nothing started: nothing to wait for');
  const first = cache.primePersistentScreenCache();
  const second = cache.primePersistentScreenCache();
  assert.equal(first, second, 'repeated calls share one prime');
  assert.equal(cache.isPersistentScreenCachePrimed(), false, 'in progress');
  await cache.persistentScreenCacheReady();
  assert.equal(cache.isPersistentScreenCachePrimed(), true);
  assert.equal(getAllKeysCalls(), 1, 'the keyspace is scanned once');
  // Compared as JSON: objects parsed inside the vm carry another realm's prototype.
  assert.equal(JSON.stringify(warm.get('market-home:v1:user_1')), '{"cachedAt":1,"products":[]}', 'the Market home snapshot is restored');
  assert.equal(JSON.stringify(warm.get('profile:user_1')), '{"from":"this-session"}', 'fresher state from this session wins');

  // ---- Market wiring
  const market = read('src/features/market/components/MarketScreen.tsx');
  assert.match(
    market,
    /queryKey === buildMarketQueryKey\(DEFAULT_MARKET_FILTERS, '', viewerKey\)\s*\?\s*`market-home:v1:\$\{viewerKey\}`/,
    'only the home view (no filters, no search) is persisted, under the viewer\'s own key',
  );
  assert.match(market, /if \(persistKey\) persistScreenState\(persistKey, entry\);/, 'the home snapshot is written through to disk');
  assert.match(market, /readWarmScreenState<unknown>\(persistKey\)/, 'memory misses fall back to the restored snapshot');
  assert.match(market, /now - snapshot\.cachedAt < MARKET_HOME_PERSIST_MAX_AGE_MS/, 'a snapshot too old is not restored');
  assert.match(market, /MARKET_HOME_PERSIST_MAX_AGE_MS = 48 \* 60 \* 60 \* 1000/);
  assert.match(
    market,
    /!isPersistentScreenCachePrimed\(\)\) \{\s*await persistentScreenCacheReady\(\);/,
    'a fast first tap waits for the boot prime instead of declaring a miss',
  );
  assert.match(
    market,
    /useFocusEffect\(\s*useCallback\(\(\) => \{\s*const refreshIfStale/,
    'freshness runs only while Market is on screen, without re-rendering the body on focus',
  );
  assert.match(market, /if \(cached && !cached\.isFresh\) void loadMarketRef\.current\('reset'\);/, 'only a stale snapshot refreshes');
  assert.match(market, /AppState\.addEventListener\('change'/, 'returning to the app refreshes a stale Market');
  assert.match(
    market,
    /if \(!productOk && !designOk && !hasVisibleMarketState\) \{/,
    'offline: a failed refresh never replaces content on screen with an error',
  );

  // ---- identity: sign-out clears every persisted screen snapshot
  assert.match(read('src/auth/sessionCleanup.ts'), /clearPersistentScreenCache\(\)/);

  console.log('market overnight restore contract: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
