/**
 * Studio warm entry contract.
 *
 * The first Studio entry after launch was ~5s of splash (handoff + the web app
 * booting in the WebView). The tab shell now boots Studio hidden while a brand
 * who uses it sits on their profile. These checks pin the rules that make that
 * safe: who is warmed, from where, and what a hidden Studio must never do.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadWarmEntry() {
  const source = read('src/features/studio/studioWarmEntry.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const store = new Map();
  const asyncStorage = {
    getItem: async (key) => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => { store.set(key, value); },
  };
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
      return require(request);
    },
  });
  return { warm: module.exports, store };
}

async function main() {
  const { warm, store } = loadWarmEntry();
  const now = Date.UTC(2026, 10, 9, 12, 0, 0);
  const day = 24 * 60 * 60 * 1000;

  // Recency: two weeks, inclusive; junk never counts.
  assert.equal(warm.isRecentStudioOpen(String(now - 13 * day), now), true);
  assert.equal(warm.isRecentStudioOpen(String(now - 15 * day), now), false);
  assert.equal(warm.isRecentStudioOpen(null, now), false);
  assert.equal(warm.isRecentStudioOpen('not-a-number', now), false);

  // Who and where.
  const base = {
    authenticated: true,
    isBrand: true,
    hasBrandWorkspace: true,
    storeSetupComplete: true,
    pathname: '/catalog',
    alreadyWarmed: false,
  };
  assert.equal(warm.shouldConsiderStudioWarm(base), true, 'a brand with a live store on their profile');
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, pathname: '/' }), false, 'never from the Runway');
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, pathname: '/discover' }), false, 'never from Market');
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, storeSetupComplete: false }), false, 'never into store setup');
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, storeSetupComplete: null }), false, 'not while setup is unknown');
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, isBrand: false }), false, 'shoppers have no Studio');
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, hasBrandWorkspace: false }), false);
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, authenticated: false }), false);
  assert.equal(warm.shouldConsiderStudioWarm({ ...base, alreadyWarmed: true }), false, 'once per session');

  // Marks are per user and round-trip through storage.
  await warm.markStudioOpened('user_a', now);
  assert.equal(await warm.wasStudioOpenedRecently('user_a', now + day), true);
  assert.equal(await warm.wasStudioOpenedRecently('user_b', now + day), false, 'one brand never warms for another');
  assert.equal(await warm.wasStudioOpenedRecently(null, now), false);
  assert.equal(store.size, 1);

  // Wiring the module test cannot reach.
  const layout = read('app/(tabs)/_layout.tsx');
  assert.match(layout, /shouldConsiderStudioWarm\(\{/, 'the tab shell decides with the shared rule');
  assert.match(layout, /preloadIslandTab\('studio'\)/, 'warming is a hidden tab preload, not a navigation');
  assert.match(layout, /STUDIO_WARM_SURFACES\.has\(pathnameRef\.current\)/, 're-checks the surface when the answer lands');
  assert.doesNotMatch(layout, /const nextTabsToWarm = \[[^\]]*'studio'/, 'Studio is not in the boot-time warm list');

  const studio = read('app/(tabs)/studio/webview.tsx');
  assert.match(studio, /const isFocused = useIsFocused\(\);/);
  assert.match(
    studio,
    /storeSetupComplete === false[^\n]*\n(?:[^\n]*\n){0,4}\s*if \(!isFocusedRef\.current\) return;/,
    'a hidden Studio never toasts or redirects into setup',
  );
  assert.match(
    studio,
    /if \(isFocusedRef\.current\) \{\s*void ExpoImage\.clearMemoryCache\(\)/,
    'a hidden Studio never drops the decoded images of the screen on display',
  );
  assert.match(studio, /markStudioOpened\(userIdForWarm\)/, 'only a Studio on screen counts as opened');

  // A booted Studio belongs to one account and one brand (Item 3, Nov 2026).
  assert.match(
    studio,
    /const sessionOwner =\s*status === 'authenticated' && user\?\.id \? `\$\{user\.id\}:\$\{user\.activeBrandId \?\? ''\}` : null;/,
    'the session owner is the account AND its active brand',
  );
  assert.match(
    studio,
    /sessionEstablishedRef\.current = true;\s*sessionBootedForRef\.current = sessionOwnerNowRef\.current;/,
    'the owner is recorded when the handoff succeeds',
  );
  assert.match(
    studio,
    /if \(!bootedFor \|\| bootedFor === sessionOwner\) return;\s*\/\/[^\n]*\n\s*if \(status === 'loading'\) return;\s*sessionBootedForRef\.current = null;\s*retry\(\);/,
    'a sign-out or a different account/brand tears the WebView down; a token refresh does not',
  );

  // A Studio page opened from the Catalogue goes back to the Catalogue (owner,
  // Nov 2026: "the back emoji … is not smart enough to take me back to
  // catalogue").
  assert.match(
    studio,
    /const catalogEntry = catalogEntryRef\.current;\s*if \(catalogEntry && !catalogEntry\.left\) \{\s*catalogEntryRef\.current = null;\s*webBackPendingRef\.current = false;\s*closeStudio\(\);\s*return;\s*\}/,
    'Back on the page the Catalogue opened returns to the Catalogue',
  );
  assert.ok(
    studio.indexOf('if (catalogEntry && !catalogEntry.left)') < studio.indexOf('webViewRef.current?.goBack()'),
    'the Catalogue return runs before the web history walk',
  );
  assert.match(studio, /router\.setParams\(\{ from: undefined \} as never\)/, 'the mark is consumed so an island hop does not inherit it');
  assert.match(studio, /useFocusEffect\(useCallback\(\(\) => \(\) => \{\s*catalogEntryRef\.current = null;/, 'leaving Studio ends it');
  assert.match(read('components/catalog/BrandShopTab.tsx'), /routeKey: 'editProduct', productId: product\.id, from: 'catalog'/, 'the Shop tab marks its Studio links');
  assert.equal(
    (read('app/(tabs)/catalog/index.tsx').match(/routeKey: 'essentials', from: 'catalog'/g) ?? []).length,
    2,
    'both Catalogue setup links are marked',
  );

  // The avatar menu does not repeat island links (owner, Nov 2026: "the staff
  // link should be removed. any link already on the studio island should not
  // have to be repeated on the dropdown").
  const profileMenu = read('components/studio/StudioHeaderProfile.tsx');
  assert.doesNotMatch(profileMenu, /label: 'Staff'/, 'no Staff in the Studio avatar menu');
  assert.doesNotMatch(profileMenu, /label: 'Finance'/, 'no Finance in the Studio avatar menu (it is an island chip)');

  // The brand name on the Studio header is never cut off (owner, Nov 2026).
  assert.match(
    studio,
    /numberOfLines=\{2\}\s*adjustsFontSizeToFit\s*minimumFontScale=\{0\.8\}\s*style=\{styles\.dashboardTitleText\}/,
    'the header name wraps and shrinks before it would truncate',
  );

  console.log('studio warm entry contract: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
