// Emailed web links open the native screen that shows the same thing, and only
// for paths the app claims as Android App Links. Runs the real routing module
// and the real Expo config.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const appLinkPaths = require('../src/navigation/appLinkPaths.json');

function load(relativePath, mocks) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireMock = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`${relativePath} imported ${id}, which this test does not provide`);
  };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, requireMock);
  return mod.exports;
}

const envMock = { env: { webAppUrl: 'https://weaz.me', apiBaseUrl: 'https://api.weaz.me' } };
const studioRoutes = load('src/features/studio/studioRoutes.ts', { '@/src/config/env': envMock });
const routing = load('src/navigation/webLinkRouting.ts', {
  './appLinkPaths.json': appLinkPaths,
  '@/src/config/env': envMock,
  '@/src/features/studio/studioRoutes': studioRoutes,
});

const open = (url) => routing.nativePathForWebLink(url);
const web = (p) => open(`https://weaz.me${p}`);

// Every link shape the backend puts in emails and notification targets.
const expectations = [
  ['/orders/ord-1', '/orders/ord-1?kind=STANDARD'],
  ['/orders', '/orders'],
  ['/custom-orders/123e4567-e89b-12d3-a456-426614174000', '/orders/123e4567-e89b-12d3-a456-426614174000?kind=CUSTOM'],
  ['/custom-orders', '/orders'],
  ['/custom-orders/123e4567-e89b-12d3-a456-426614174000/extensions/223e4567-e89b-12d3-a456-426614174000', '/orders/extension/223e4567-e89b-12d3-a456-426614174000?orderId=123e4567-e89b-12d3-a456-426614174000'],
  ['/profile?tab=orders&orderId=ord-1', '/orders/ord-1?kind=STANDARD'],
  ['/profile?tab=orders&customOrderId=co-1', '/orders/co-1?kind=CUSTOM'],
  ['/profile?tab=orders', '/orders'],
  ['/profile?tab=fits', '/fittings'],
  ['/profile?tab=Account', '/me'],
  ['/profile', '/me'],
  ['/profile/user-7', '/profile/user-7'],
  ['/messages?thread=th-1', '/messages/th-1'],
  ['/messages?threadId=th-1&messageId=m-2', '/messages/th-1?messageId=m-2'],
  ['/messages', '/inbox'],
  ['/studio/messages?thread=th-1', '/messages/th-1'],
  ['/notifications', '/notifications'],
  ['/settings?tab=account-security', '/settings/account-security'],
  ['/settings?tab=notifications', '/settings/notifications'],
  ['/settings?tab=billing', '/settings/subscriptions'],
  ['/settings?tab=subscription-billing', '/settings/subscriptions'],
  ['/settings?tab=patches', '/settings'],
  ['/settings?tab=store-hours', '/settings'],
  ['/settings/collections', '/settings'],
  ['/studio', '/studio'],
  ['/studio?tab=orders', '/studio?routeKey=orders'],
  ['/studio/verification', '/studio?routeKey=verification'],
  ['/studio/store/setup', '/studio?routeKey=setup'],
  ['/studio/custom-orders/co-1', '/studio?routeKey=customOrderDetail&orderId=co-1'],
  ['/studio/store/products/p-1/edit?returnTo=x', '/studio?routeKey=editProduct&productId=p-1'],
  ['/studio/products/discontinued', '/studio'],
  ['/store/payouts', '/studio?routeKey=finance'],
  ['/products/p-1', '/products/p-1'],
  ['/posts/post-1', '/posts/post-1'],
  ['/catalog/brand-1', '/catalog/brand-1'],
  ['/u/jayde', '/studio/resolve-alias?aliasType=profile&aliasValue=jayde&source=app-link'],
];
for (const [input, expected] of expectations) {
  assert.equal(web(input), expected, `https://weaz.me${input}`);
}
assert.equal(open('https://www.weaz.me/orders/ord-1'), '/orders/ord-1?kind=STANDARD', 'www twin');

// Paths the app does not claim stay on the web: admin, bag, account email
// changes and staff invites have no native screen.
for (const unclaimed of ['/', '/admin/finance', '/admin/custom-orders/co-1', '/bag', '/change-email/confirm?token=t', '/brand/staff/invite?token=t', '/market', '/designs/d-1']) {
  assert.equal(web(unclaimed), null, `${unclaimed} must stay on the web`);
  assert.equal(routing.isClaimedAppLinkPath(unclaimed.split('?')[0]), false, `${unclaimed} must not be claimed`);
}

// Recovery and creation have web checkout screens, not native order details.
// They must be excluded in Android's manifest too, or browser fallback loops.
for (const unclaimed of ['/custom-orders/new', '/custom-orders/new?designId=d-1',
  '/custom-orders/resume/123e4567-e89b-12d3-a456-426614174000',
  '/custom-orders/checkout-sessions/resume/123e4567-e89b-12d3-a456-426614174000']) {
  assert.equal(web(unclaimed), null, `${unclaimed} stays in browser checkout`);
}

// Other hosts, plain http, custom schemes and native paths pass through.
for (const passthrough of [
  'https://evil.example/orders/ord-1',
  'http://weaz.me/orders/ord-1',
  'wiezmobile://orders/ord-1',
  'com.wiez.wiez:/oauthredirect?code=x',
  '/orders/ord-1',
  'not a url',
]) {
  assert.equal(open(passthrough), null, passthrough);
}

// An id cannot smuggle a path: the family list opens instead.
assert.equal(web('/orders/..%2Fadmin'), '/orders');
assert.equal(web('/messages?thread=..%2F..%2Fadmin'), '/inbox');
assert.equal(web('/products/a%5Cb'), '/');

// Every claimed prefix is routed; none of them is a web-only area.
for (const prefix of appLinkPaths.pathPrefixes) {
  assert.ok(prefix.startsWith('/'), prefix);
  assert.ok(!/^\/(admin|bag|change-email|brand)/.test(prefix), `${prefix} has no native screen`);
  assert.notEqual(routing.nativePathForWebPath(`${prefix}x`), undefined);
}

// No https web app → nothing claimed.
assert.equal(routing.appLinkHosts('http://localhost:5173').size, 0);
assert.deepEqual([...routing.appLinkHosts('https://weaz.me')].sort(), ['weaz.me', 'www.weaz.me']);

// The Expo config claims exactly these prefixes, verified, on the web host only.
function loadAppConfig(env) {
  const saved = { ...process.env };
  delete process.env.APP_LINK_HOSTS;
  delete process.env.EXPO_PUBLIC_WEB_APP_URL;
  Object.assign(process.env, env);
  const configPath = require.resolve('../app.config.js');
  delete require.cache[configPath];
  try {
    return require(configPath)({ config: {} });
  } finally {
    process.env = saved;
  }
}
const appLinkFilter = (config) =>
  (config.android.intentFilters ?? []).find((filter) => filter.autoVerify === true);

const sitConfig = loadAppConfig({ EXPO_PUBLIC_WEB_APP_URL: 'https://weaz.me' });
const filter = appLinkFilter(sitConfig);
assert.ok(filter, 'an https web app gets a verified App Links filter');
assert.equal(filter.action, 'VIEW');
assert.deepEqual(filter.category, ['BROWSABLE', 'DEFAULT']);
assert.deepEqual(
  filter.data,
  [
    ...appLinkPaths.pathPrefixes.map((pathPrefix) => ({ scheme: 'https', host: 'weaz.me', pathPrefix })),
    ...appLinkPaths.paths.map((path) => ({ scheme: 'https', host: 'weaz.me', path })),
    ...appLinkPaths.pathPatterns.map((pathPattern) => ({ scheme: 'https', host: 'weaz.me', pathPattern })),
  ],
);
// These fixed simple globs have no '*' or advanced API-31-only operators.
// Verify Android's single-character '.' rule against the real reserved paths.
for (const input of ['/custom-orders/new', '/custom-orders/resume/123e4567-e89b-12d3-a456-426614174000']) {
  assert.equal(filter.data.some((entry) => entry.path === input ||
    (entry.pathPrefix && input.startsWith(entry.pathPrefix)) ||
    (entry.pathPattern && new RegExp(`^${entry.pathPattern}$`).test(input))), false);
}
assert.equal(sitConfig.android.package, 'com.wiez.wiez');

const overridden = appLinkFilter(loadAppConfig({ APP_LINK_HOSTS: 'wiez.com, www.wiez.com', EXPO_PUBLIC_WEB_APP_URL: 'https://weaz.me' }));
assert.deepEqual([...new Set(overridden.data.map((entry) => entry.host))], ['wiez.com', 'www.wiez.com']);

assert.equal(appLinkFilter(loadAppConfig({})), undefined, 'no web app URL → no claim');
assert.equal(appLinkFilter(loadAppConfig({ EXPO_PUBLIC_WEB_APP_URL: 'http://192.168.1.4:5173' })), undefined, 'http → no claim');

// +native-intent: auth links are resolved before web links, and the replay
// ledger sees the URL Android delivered.
const intent = fs.readFileSync(path.join(root, 'app/+native-intent.tsx'), 'utf8');
assert.ok(intent.indexOf('resolveMobileAuthRoute(path)') < intent.indexOf('nativePathForWebLink('), 'auth links first');
assert.match(intent, /claimFreshLaunchUrl\(path\)/);

// The running app's Linking listener sees the same App Link. It must leave it
// to +native-intent, or it builds a routeless notification and replaces the
// opened screen with the notifications list.
const deepLinks = fs.readFileSync(path.join(root, 'src/utils/notificationRouting.ts'), 'utf8');
const handler = deepLinks.slice(deepLinks.indexOf('const handleDeepLink = useCallback('));
assert.ok(
  handler.indexOf('nativePathForWebLink(url)') > 0 &&
    handler.indexOf('nativePathForWebLink(url)') < handler.indexOf('buildNotificationFromPushData({ targetUrl: url })'),
  'handleDeepLink must skip claimed web links before treating a URL as a notification',
);

console.log(`app link routing contract: ${expectations.length} link shapes, all checks passed`);
