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
let effect, messageHandler, profileReplayEffect, eligibility, resetScopeEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'isStudioEligible') eligibility = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const fn = node.arguments[0];
    if (fn?.getText(ast).includes('StudioApi.createHandoff(intendedPath)')) effect = fn.getText(ast);
    if (fn?.getText(ast).includes('documentStudioScopeRef.current === studioScope')) resetScopeEffect = fn.getText(ast);
    if (fn?.getText(ast).includes('const deferred = deferredProfileSetupRef.current')) profileReplayEffect = fn.getText(ast);
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
function publishMessage(overrides = {}, message = { type: 'ACTION_COMPLETE', action: 'STORE_SETUP_COMPLETE' }) {
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
  handler({ nativeEvent: { url: 'https://weaz.me/studio', data: JSON.stringify(message) } });
  return { writes, invalidates, routes, handler };
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

assert.ok(eligibility,'Exercise actual WebView admission');
const {isBrandAccount}=compile(fs.readFileSync(path.join(root,'src/auth/brandAccess.ts'),'utf8'),{});
const staff={id:'staff',type:'REGULAR',activeBrandId:'brand-a',brandMemberships:[{brandId:'brand-a',role:'MANAGER',status:'ACTIVE'}]};
const staffEligible=compile('module.exports = '+eligibility,{user:staff,hasBrandWorkspace:true,isBrandAccount});
assert.equal(staffEligible,false);assert.equal(run('customers','',{}, {isStudioEligible:staffEligible,setErrorMessage:()=>{},setLoadState:()=>{}}).length,0);
assert.equal(compile('module.exports = '+eligibility,{user:{type:'REGULAR'},hasBrandWorkspace:false,isBrandAccount}),false);
const deferredProfileSetupRef={current:null}, navigation=[];
const profile=publishMessage({isFocusedRef:{current:false},deferredProfileSetupRef,toast:{info:()=>navigation.push('toast')},router:{replace:target=>navigation.push(target)},closeStudio:()=>navigation.push('close'),describeMissingBrandProfileFields:()=>''},{type:'PROFILE_SETUP_REQUIRED',reason:'brand-profile',missingFields:['location']});
assert.equal(navigation.length,0,'Hidden Studio must not navigate or toast');assert.ok(deferredProfileSetupRef.current);
assert.ok(profileReplayEffect,'Exercise actual focus replay effect');
const deferred=deferredProfileSetupRef.current;
function replay(scope,isFocused=true){compile('module.exports = ('+profileReplayEffect+')();',{isFocused,studioScope:scope,deferredProfileSetupRef,handleMessage:profile.handler});}
replay(deferred.scope,false);assert.equal(navigation.length,0);assert.ok(deferredProfileSetupRef.current);
replay('different-workspace');assert.equal(navigation.length,0);assert.equal(deferredProfileSetupRef.current,null);
const focus={current:false};const q={current:null};const actual=publishMessage({isFocusedRef:focus,deferredProfileSetupRef:q,toast:{info:()=>{}},router:{replace:target=>navigation.push(target)},closeStudio:()=>{},describeMissingBrandProfileFields:()=>''},{type:'PROFILE_SETUP_REQUIRED',reason:'brand-profile'});
focus.current=true;compile('module.exports = ('+profileReplayEffect+')();',{isFocused:true,studioScope:q.current.scope,deferredProfileSetupRef:q,handleMessage:actual.handler});assert.deepEqual(navigation,['/catalog/edit-profile']);assert.equal(q.current,null);
console.log('Actual brand-only browser admission and scoped hidden-profile focus recovery passed');

assert.ok(resetScopeEffect);const abandoned={current:{scope:'workspace-A',message:{type:'PROFILE_SETUP_REQUIRED'}}};
compile('module.exports = ('+resetScopeEffect+')();',{documentStudioScopeRef:{current:'workspace-A'},studioScope:'workspace-B',phoneVerification:{current:null},deferredProfileSetupRef:abandoned,sessionEstablishedRef:{current:true},lastInjectedRouteRef:{current:'old'},pendingRouteRef:{current:null},setWebUrl:()=>{},setCanGoBack:()=>{},setLoadState:()=>{}});assert.equal(abandoned.current,null,'A→B→A must not restore an old profile assessment');
