const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { compile, createScriptRequire } = require('./helpers/mobile-script-require');
const { TabRouter } = require('expo-router/build/react-navigation/routers/TabRouter');
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');
const repoRoot = path.resolve(__dirname, '..');
const moduleState = { exports: {} };
vm.runInNewContext(compile(path.join(repoRoot, 'src/navigation/islandTabStack.ts')), {
  module: moduleState, exports: moduleState.exports, require: createScriptRequire({ repoRoot }),
});
const api = moduleState.exports;
const tabOptions = { routeNames: ['index', 'catalog', 'me'], routeParamList: {}, routeGetIdList: {} };
const stackOptions = { routeNames: ['index', '[brandId]', 'view'], routeParamList: {}, routeGetIdList: {} };
const tabs = TabRouter({ initialRouteName: 'index', backBehavior: 'history' });
const stack = StackRouter({ initialRouteName: 'index' });
for (const withOwnerRoot of [false, true]) {
  let state = tabs.getInitialState(tabOptions);
  const originalRoot = { name: 'index', key: 'warm-owner-root', params: { tab: 'shop', brandId: 'stale-visitor' } };
  const nested = stack.getRehydratedState({ stale: true, index: withOwnerRoot ? 2 : 0,
    routes: [...(withOwnerRoot ? [originalRoot] : []), { name: '[brandId]', params: { brandId: 'other-brand' } }, ...(withOwnerRoot ? [{ name: 'view' }] : [])],
  }, stackOptions);
  state.routes[1] = { ...state.routes[1], state: nested };
  state = tabs.getStateForAction(state, { type: 'JUMP_TO', payload: { name: 'catalog' } }, tabOptions);
  const actions = [];
  api.registerIslandTabNavigation({ getState: () => state, dispatch: (action) => actions.push(JSON.parse(JSON.stringify(action))) });
  assert.equal(api.isIslandTabAtRoot('catalog'), false, 'A visitor stack is not Me even if the URL is stale');
  assert.equal(api.jumpToIslandTabRoot('catalog'), true);
  assert.equal(actions.length, 1, 'Me must own focus and the nested destination in one action');
  const next = tabs.getStateForAction(state, actions[0], tabOptions);
  assert.equal(next.routes[next.index].name, 'catalog');
  const reset = stack.getStateForAction(nested, { type: 'RESET', payload: next.routes[next.index].params.state }, stackOptions);
  const owner = stack.getRehydratedState(reset, stackOptions);
  assert.equal(owner.routes.length, 1);
  assert.equal(owner.routes[0].name, 'index');
  assert.equal(owner.routes[0].params?.brandId, undefined);
  state = { ...next, routes: next.routes.map((route) => route.name === 'catalog' ? { ...route, state: owner } : route) };
  assert.equal(api.isIslandTabAtRoot('catalog'), true);
  assert.equal(next.routes[0], state.routes[0], 'Unrelated tabs retain their mounted state');
  if (withOwnerRoot) {
    assert.equal(owner.routes[0].key, originalRoot.key, 'Keep the warm owner screen');
    assert.equal(owner.routes[0].params.tab, 'shop', 'Keep the owner subtab');
  }
}
let state = tabs.getInitialState(tabOptions);
const actions = [];
api.registerIslandTabNavigation({ getState: () => state, dispatch: (action) => actions.push(action) });
api.jumpToIslandTabRoot('catalog');
assert.equal(actions[0].payload.params.screen, 'index', 'Cold catalog opens the owner root');
api.jumpToIslandTabRoot('me');
assert.equal(actions[1].payload.params, undefined, 'Shopper profile is a flat screen');
api.registerIslandTabNavigation(null);
assert.equal(api.jumpToIslandTabRoot('catalog'), false);
console.log('Profile root navigation: visitor-only, deep visitor, warm owner, cold owner, shopper and unavailable navigator passed against the installed Expo routers.');

const timerIds = [];
const navModule = { exports: {} };
const context = {
  module: navModule, exports: navModule.exports,
  __navCurrentPathname: '/catalog',
  setTimeout: (fn, delay) => { const id = setTimeout(fn, delay); timerIds.push(id); return id; },
  clearTimeout,
  require: createScriptRequire({ repoRoot, mocks: {
    'expo-router': { router: {} },
    '@/src/utils/navPerf': { navPerf: {}, setDrillDownFlowReadyListener: () => undefined },
  } }),
};
context.global = context;
vm.runInNewContext(compile(path.join(repoRoot, 'src/utils/mobileNavigation.ts')), context);
let dispatched = 0;
navModule.exports.withNavigationLock('/catalog', () => { dispatched++; }, { allowSamePath: true });
navModule.exports.withNavigationLock('/catalog', () => { dispatched++; }, { allowSamePath: true });
assert.equal(dispatched, 1, 'Actual visitor state may override a stale URL without accepting duplicate taps');
navModule.exports.releaseNavigationLock('test-complete');
timerIds.forEach(clearTimeout);
console.log('Me stale-URL override preserves central duplicate-tap protection.');
