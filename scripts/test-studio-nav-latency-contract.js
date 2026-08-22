const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const webview = read('app/(tabs)/studio/webview.tsx');
const tabLayout = read('app/(tabs)/_layout.tsx');
const studioLayout = read('app/(tabs)/studio/_layout.tsx');
const studioRoutes = read('src/features/studio/studioRoutes.ts');
const studioNav = read('src/features/studio/studioNavController.ts');
const islandConfig = read('src/navigation/nativeIslandConfig.ts');

assert.match(
  studioNav,
  /export function requestStudioInPlaceNav/,
  'Studio island hops must have a WebView injector that does not go through Expo Router.',
);
assert.match(
  tabLayout,
  /requestStudioInPlaceNav/,
  'The Studio dock must call the in-place injector on chip press.',
);
assert.match(
  tabLayout,
  /router\.setParams/,
  'A successful in-place hop must update native chrome via setParams, not navigate/push.',
);

assert.doesNotMatch(
  webview,
  /location\.assign\(/,
  'Studio in-place navigation must never fall back to location.assign (full document reload).',
);
assert.match(
  webview,
  /__WIEZ_STUDIO_NAV_GO__/,
  'The WebView must install a durable GO dispatcher that queues until the SPA bridge exists.',
);
assert.match(
  webview,
  /__WIEZ_STUDIO_NAV_PENDING__/,
  'Hops that beat React hydration must queue on __WIEZ_STUDIO_NAV_PENDING__.',
);
assert.match(
  webview,
  /registerStudioInPlaceHandler/,
  'The WebView screen must register its injector for the island to call.',
);
assert.match(
  webview,
  /key=\{String\(retryKey\)\}/,
  'The WebView instance must not remount when the handoff URL string changes.',
);

assert.match(
  studioRoutes,
  /reviews:\s*\{[\s\S]*path:\s*'\/studio\?tab=reviews'/,
  'Reviews must be a valid Studio route. Missing it put the whole WebView into the error overlay.',
);
assert.match(
  studioRoutes,
  /path:\s*'\/studio\?tab=store'/,
  'Store island hops must stay on StudioHome (?tab=store), not remount /studio/store.',
);
assert.match(
  islandConfig,
  /reviews:\s*STUDIO_ISLAND_KEYS\.reviews/,
  'The Studio dock Reviews chip must map onto the reviews section.',
);

assert.match(
  studioLayout,
  /dangerouslySingular=\{\(\) => 'studio-webview'\}/,
  'The Studio WebView stack screen must be singular so Finance→Store cannot push a second WebView.',
);
assert.match(
  studioLayout,
  /animation:\s*'none'/,
  'WebView island hops must not slide as if they were a new stack screen.',
);

console.log('Studio navigation latency contract checks passed.');
