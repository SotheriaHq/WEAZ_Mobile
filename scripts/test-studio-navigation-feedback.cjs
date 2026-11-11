const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function compile(code, context) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, ...context });
  return module.exports;
}
const routes = compile(fs.readFileSync(path.join(root, 'src/features/studio/studioRoutes.ts'), 'utf8'), {
  URL, URLSearchParams, require: () => ({ env: { webAppUrl: 'https://weaz.me', trustedWebOrigins: [] } }),
});
const { getStudioRouteReport, getStudioRouteSignature } = routes;
assert.equal(getStudioRouteReport('/studio?tab=customers').routeKey, 'customers');
assert.equal(getStudioRouteReport('/studio').routeKey, 'overview');
assert.equal(getStudioRouteReport('/unrelated'), null);
const product = getStudioRouteReport('/studio/store/products/product-2/edit');
assert.equal(product.productId, 'product-2');
assert.equal(product.studioRouteReport, getStudioRouteSignature('editProduct', { productId: 'product-2' }));
assert.equal(getStudioRouteReport('/studio/store/products/new').productId, '');
assert.equal(getStudioRouteReport('/studio/custom-orders/order-2').orderId, 'order-2');
assert.equal(getStudioRouteReport('/studio/store/products/%/edit'), null);

const source = fs.readFileSync(path.join(root, 'app/(tabs)/studio/webview.tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect, messageHandler;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const fn = node.arguments[0];
    if (fn?.getText(ast).includes('StudioApi.createHandoff(intendedPath)')) effect = fn.getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useCallback' &&
      node.arguments[0]?.getText(ast).includes("message.action === 'STORE_SETUP_COMPLETE'")) messageHandler = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'Exercise the actual Studio routing effect.');
function run(routeKey, report, params = {}, overrides = {}) {
  const commands = [];
  const cleanup = compile(`module.exports = (${effect})();`, {
    status: 'authenticated', invalidRouteKey: false, isStudioEligible: true, hasBrandWorkspace: true,
    actorId: 'actor', nativeIdentity: 'actor:session:1:User', getApiSecurityIdentity: () => 'actor:session:1:User',
    storeSetupComplete: true, resolvedRouteKey: routeKey, reportedRouteSignature: report,
    productId: params.productId, orderId: params.orderId, getStudioRouteSignature,
    sessionEstablishedRef: { current: true }, loadStateRef: { current: 'ready' },
    webViewRef: { current: {} }, pendingRouteRef: { current: null },
    navigateStudioInPlace: (...args) => commands.push(args),
    STORE_SETUP_EXEMPT_ROUTES: new Set(['setup', 'essentials']),
    ...overrides,
  });
  cleanup();
  return commands;
}
for (const key of ['overview', 'customers', 'analytics', 'orders']) {
  assert.equal(run(key, getStudioRouteSignature(key)).length, 0,
    'A web report must update chrome without injecting another navigation.');
}
assert.equal(run('editProduct', product.studioRouteReport, { productId: 'product-2' }).length, 0);
assert.equal(run('customers', '').length, 1, 'An explicit island intent must still navigate.');
assert.equal(run('analytics', getStudioRouteSignature('customers')).length, 1,
  'An external destination must not be swallowed by an older web report.');
assert.equal(run('customers', '', {}, { getApiSecurityIdentity: () => 'next:session:1:User' }).length, 0,
  'A retained screen cannot navigate its old document after the credential changes.');

const { getActiveBrandId } = compile(fs.readFileSync(path.join(root, 'src/auth/brandAccess.ts'), 'utf8'), {});
const { queryKeys } = compile(fs.readFileSync(path.join(root, 'src/query/queryKeys.ts'), 'utf8'), {});
const user = { id: 'actor', type: 'BRAND', activeBrandId: null,
  brandMemberships: [{ brandId: 'brand-a', role: 'OWNER', status: 'ACTIVE', isOwner: true }] };
assert.ok(messageHandler, 'Exercise the actual scoped message handler.');
function publishMessage(overrides = {}) {
  const writes = [], invalidates = [], routes = [];
  const scope = 'actor:brand-a:actor:session:1:User';
  const handler = compile(`module.exports = ${messageHandler};`, {
    actorId: user.id, activeBrandId: getActiveBrandId(user), nativeIdentity: 'actor:session:1:User', studioScope: scope,
    currentStudioScopeRef: { current: scope }, documentStudioScopeRef: { current: scope },
    getApiSecurityIdentity: () => 'actor:session:1:User', webBackPendingRef: { current: false }, lastPageSignalRef: { current: 0 },
    trackStudioWebViewEvent() {}, sanitizePathForTelemetry() {}, queryKeys,
    queryClient: { setQueryData(key, update) { writes.push({ key: Array.from(key), value: update({ isSetupComplete: false }) }); },
      invalidateQueries({ queryKey }) { invalidates.push(Array.from(queryKey)); return Promise.resolve(); } },
    router: { setParams: value => routes.push(value) }, ...overrides,
  });
  handler({ nativeEvent: { url: 'https://weaz.me/studio', data: JSON.stringify({ type: 'ACTION_COMPLETE', action: 'STORE_SETUP_COMPLETE' }) } });
  return { writes, invalidates, routes };
}
const publication = publishMessage();
assert.deepEqual(publication.writes[0].key, Array.from(queryKeys.store.status(user.id, getActiveBrandId(user))));
assert.deepEqual(publication.invalidates[0], publication.writes[0].key);
assert.equal(publication.writes[0].value.isSetupComplete, true);
assert.equal(publication.routes[0].routeKey, 'store');
assert.equal(publishMessage({ currentStudioScopeRef: { current: 'actor:brand-b:new-session' } }).writes.length, 0,
  'A delayed old-workspace message cannot update the new workspace.');
assert.equal(publishMessage({ getApiSecurityIdentity: () => 'other:session:1:User' }).writes.length, 0,
  'A credential change is enforced even before the next React render.');
assert.match(source, /router\.setParams\(report as never\)/);
const layout = fs.readFileSync(path.join(root, 'app/(tabs)/_layout.tsx'), 'utf8');
assert.equal((layout.match(/studioRouteReport: ''/g) || []).length, 2,
  'Both foreground and native-stack island intents must clear the report marker.');
console.log('Studio feedback regression: route resources, observed-only effects and explicit intents passed.');
