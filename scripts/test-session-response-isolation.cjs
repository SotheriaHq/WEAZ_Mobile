const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const axios = require('axios');
const toByteArray = value => new Uint8Array(Buffer.from(value, 'base64'));

const ownRoot = path.resolve(__dirname, '..');
const nativeRoot = process.env.WIEZ_NATIVE_SECURITY_ROOT ||
  (fs.existsSync(path.join(ownRoot, 'src/storage/secureStorage.ts')) ? ownRoot : path.resolve(ownRoot, '../threadly-mobile'));
const webRoot = process.env.WIEZ_WEB_SECURITY_ROOT ||
  (fs.existsSync(path.join(ownRoot, 'src/context/AuthContext.tsx')) ? ownRoot : path.resolve(ownRoot, '../fthreadly'));
const token = (sub = '11111111-1111-4111-8111-111111111111', exp = 1, sid = '22222222-2222-4222-8222-222222222222', authVersion = 1) =>
  `e30.${Buffer.from(JSON.stringify({ sub, sid, authVersion, role: 'User', exp })).toString('base64url')}.sig`;

function fixture(root, native) {
  const pending = [];
  const writes = [];
  let expired = 0;
  const expiredDetails = [];
  const adapter = config => new Promise((resolve, reject) => pending.push({ config,
    resolve(data = {}) { resolve({ config, status: 200, statusText: 'OK', headers: {}, data }); },
    reject(status = 401, data = {}) { reject(new axios.AxiosError('Rejected', 'ERR_BAD_RESPONSE', config, undefined,
      { config, status, statusText: 'Rejected', headers: {}, data })); },
    offline() { reject(new axios.AxiosError('Offline', 'ERR_NETWORK', config)); },
  }));
  const wrappedAxios = { ...axios, create: config => axios.create({ ...config, adapter }) };
  const security = load(path.join(root, 'src/auth/securityChallenge.ts'), {});
  const retry = load(path.join(root, 'src/auth/securityRequestRetry.ts'), { './securityChallenge': security });
  const passwordRotation = load(path.join(root, 'src/auth/passwordSessionRotation.ts'), { './securityChallenge': security });
  const dependencies = {
    axios: { ...wrappedAxios, __esModule: true, default: wrappedAxios },
    'base64-js': { toByteArray },
    'react-native': { Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { isDevice: true } },
    './networkTrace': { startNetworkTrace: config => config, finishNetworkTrace() {} },
  };
  const common = {
    'auth/securityChallenge': security, 'auth/securityRequestRetry': retry,
    'auth/passwordSessionRotation': passwordRotation,
    'auth/securityDevice': { getSecurityDeviceId: () => 'device' },
    'utils/deviceId': { getDeviceId: () => 'device', getCachedDeviceId: () => 'device', getWebDeviceId: () => 'device', WIEZ_DEVICE_ID_HEADER: 'x-device-id' },
    'utils/requestId': { createRequestId: () => 'request' },
    'config/env': { env: { apiBaseUrl: 'https://example.invalid', api: { defaultConfig: {} } } },
  };
  for (const [name, value] of Object.entries(common)) {
    dependencies[`@/${name}`] = value; dependencies[`@/src/${name}`] = value;
    dependencies[`../${name}`] = value;
  }
  dependencies['../types/auth'] = { unwrapApiResponse: data => data?.data ?? data };
  if (!native) dependencies['@/auth/sessionRefreshLock'] = load(path.join(root, 'src/auth/sessionRefreshLock.ts'), {});
  dependencies['@/src/storage/secureStorage'] = { setSessionTokens: async (access, refresh, current) => {
    if (!current()) return false; writes.push({ access, refresh }); return true;
  } };
  dependencies['@/src/features/feed/utils/feedDiagnostics'] = { apiHostDevLog() {}, apiHostDevWarn() {}, isWiezDebugEnabled: () => false };
  dependencies['@/src/perf/wiezPerf'] = { perfEnabled: () => false, perfNote() {} };
  const api = load(path.join(root, 'src/api/httpClient.ts'), dependencies, {
    __DEV__: false, process: { env: { EXPO_PUBLIC_API_URL: 'https://example.invalid' } },
    window: { dispatchEvent(event) { expired++; expiredDetails.push(event.detail); } },
    CustomEvent: class { constructor(_name, init) { this.detail = init?.detail; } },
  });
  return { api, pending, writes, security, expired: () => expired, expiredDetails,
    set(access) { native ? api.setApiAuthToken(access) : api.persistAccessToken(access); },
    clear() { if (native) { api.beginAuthTransition(); api.setApiAuthToken(null); api.setApiRefreshToken(null); } else api.dropStoredAccessToken(); },
    get: () => native ? api.getApiSecurityIdentity() : api.getStoredAccessToken(),
  };
}
function load(filename, dependencies, extra = {}, sourceOverride) {
  const output = ts.transpileModule(sourceOverride ?? fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, performance, setTimeout, clearTimeout, AbortController,
    atob: value => Buffer.from(value, 'base64').toString('binary'), URL, console, ...extra,
    require: name => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); },
  }, { filename });
  return module.exports;
}
function draftApi(f) {
  const filename = path.join(webRoot, 'src/api/BrandApi.ts');
  const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const methods = [];
  const visit = node => {
    if (ts.isMethodDeclaration(node) && ['getMyDraftCollectionsPage', 'getMyDraftCollections'].includes(node.name.getText(ast))) methods.push(node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(methods.length, 2);
  return load(filename, {}, { apiClient: f.api.apiClient, getStoredAccessToken: f.api.getStoredAccessToken,
    securityIdentityFromToken: f.security.securityIdentityFromToken, SecurityVerificationCancelled: f.security.SecurityVerificationCancelled },
    `const brandApi = { ${methods.join(',')} }; module.exports = brandApi;`);
}
async function sent(f, count) {
  for (let i = 0; i < 100 && f.pending.length < count; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.pending.length, count, 'expected real Axios adapter sends');
}
const cancelled = error => error?.code === 'ERR_CANCELED';

for (const [surface, root, native] of [['web', webRoot, false], ['native', nativeRoot, true]]) {
  const run = (name, fn) => test(`${surface}: ${name}`, async context => {
    if (!fs.existsSync(path.join(root, 'src/api/httpClient.ts'))) {
      context.skip(`Sibling ${surface} source unavailable; set WIEZ_WEB_SECURITY_ROOT/WIEZ_NATIVE_SECURITY_ROOT for paired checks`); return;
    }
    await fn(fixture(root, native));
  });
  run('late successful private read cannot reach the next sign-in or repopulate its cache', async f => {
    f.set(token()); const old = f.api.apiClient.get('/private');
    const rejected = assert.rejects(old, cancelled); await sent(f, 1);
    f.clear(); f.set(token('33333333-3333-4333-8333-333333333333'));
    f.pending[0].resolve({ private: 'old' }); await rejected;
    const current = f.api.apiClient.get('/private'); await sent(f, 2);
    f.pending[1].resolve({ private: 'new' }); assert.equal((await current).data.private, 'new');
  });
  if (!native) run('actual draft API rejects an account switch before the asynchronous request interceptor sends', async f => {
    f.set(token()); const drafts = draftApi(f);
    const pending = drafts.getMyDraftCollectionsPage(); const rejected = assert.rejects(pending, cancelled);
    f.clear(); f.set(token('33333333-3333-4333-8333-333333333333')); await rejected;
    assert.equal(f.pending.length, 0, 'No first-page request may be sent as the replacement account');
  });
  if (!native) run('actual flat draft adapter cannot return accumulated pages after the last response switches account', async f => {
    f.set(token()); const drafts = draftApi(f);
    const pending = drafts.getMyDraftCollections(); const rejected = assert.rejects(pending, cancelled); await sent(f, 1);
    f.pending[0].resolve({ items: [{ id: 'first', title: 'Old draft' }], nextCursor: 'second-page' }); await sent(f, 2);
    const data = { items: [], get nextCursor() {
      f.clear(); f.set(token('33333333-3333-4333-8333-333333333333')); return null;
    } };
    f.pending[1].resolve(data); await rejected;
    assert.equal(f.pending.length, 2);
  });
  run('same-session JWT rotation preserves a valid in-flight response', async f => {
    f.set(token()); const read = f.api.apiClient.get('/private'); await sent(f, 1);
    f.set(token(undefined, 2)); f.pending[0].resolve({ valid: true }); assert.equal((await read).data.valid, true);
  });
  if (native) run('password commit-before-delivery cannot race a realtime refresh into signing out this device', async f => {
    const after = token(undefined, 2, undefined, 2); f.set(token()); f.api.setApiRefreshToken('old-refresh');
    let signOuts = 0; f.api.setUnauthorizedHandler(() => { signOuts++; f.clear(); });
    const changed = f.api.changePasswordWithSessionRotation({ currentPassword: 'fixture-old', newPassword: 'fixture-new' });
    await sent(f, 1);
    const realtime = f.api.refreshRealtimeAccessToken();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.pending.length, 1, 'Do not send an old refresh after password commit');
    f.pending[0].resolve({ message: 'Password updated successfully', accessToken: after,
      refreshToken: '22222222-2222-4222-8222-222222222222.new-secret' });
    assert.equal((await changed).message, 'Password updated successfully');
    assert.equal(await realtime, after); assert.equal(signOuts, 0); assert(f.get().includes(':2:'));
  });
  if (native) run('password transition defers a stale private401 and keeps explicit sign-out authoritative', async f => {
    f.set(token()); f.api.setApiRefreshToken('old-refresh'); let signOuts = 0;
    f.api.setUnauthorizedHandler(() => { signOuts++; f.clear(); });
    const privateRead = f.api.apiClient.get('/private'); const rejected = assert.rejects(privateRead, cancelled); await sent(f, 1);
    const changed = f.api.changePasswordWithSessionRotation({ currentPassword: 'fixture-old', newPassword: 'fixture-new' }); await sent(f, 2);
    f.pending[0].reject(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.pending.length, 2);
    f.pending[1].resolve({ message: 'changed', accessToken: token(undefined, 2, undefined, 2),
      refreshToken: '22222222-2222-4222-8222-222222222222.new-secret' });
    await changed; await rejected; assert.equal(signOuts, 0);
    const another = f.api.changePasswordWithSessionRotation({ currentPassword: 'fixture-new', newPassword: 'fixture-next' });
    const cancelledChange = assert.rejects(another, cancelled); await sent(f, 3);
    f.clear(); f.set(token('33333333-3333-4333-8333-333333333333')); f.api.setApiRefreshToken('next-account-refresh');
    const nextRefresh = f.api.refreshRealtimeAccessToken(); await sent(f, 4);
    f.pending[2].resolve({ message: 'old-account', accessToken: token(undefined, 3, undefined, 3),
      refreshToken: '22222222-2222-4222-8222-222222222222.old-secret' });
    await cancelledChange;
    const nextToken = token('33333333-3333-4333-8333-333333333333', 2);
    f.pending[3].resolve({ accessToken: nextToken, refreshToken: 'next-rotated' }); assert.equal(await nextRefresh, nextToken);
  });
  if (native) run('password MFA releases the refresh barrier while verification is open and restores it on the approved send', async f => {
    f.set(token()); f.api.setApiRefreshToken('old-refresh'); let prompt;
    const remove = f.security.securityChallenges.register(value => { prompt = value; });
    try {
      const changed = f.api.changePasswordWithSessionRotation({ currentPassword: 'fixture-old', newPassword: 'fixture-new' });
      await sent(f, 1); const now = Date.now();
      f.pending[0].reject(428, { code: 'STEP_UP_REQUIRED', sensitivity: 'CRITICAL_CHANGE',
        challengeId: '11111111-1111-4111-8111-111111111111', serverNow: new Date(now).toISOString(),
        expiresAt: new Date(now + 300000).toISOString(), review: { title: 'Verify password change' } });
      for (let i = 0; i < 100 && !prompt; i++) await new Promise(resolve => setImmediate(resolve));
      assert(prompt, 'MFA remains reachable');
      const refreshing = f.api.refreshRealtimeAccessToken(); await sent(f, 2);
      f.pending[1].resolve({ accessToken: token(undefined, 2), refreshToken: 'same-session-refreshed' }); await refreshing;
      prompt.complete({ actionProof: '11111111-1111-4111-8111-111111111111.' + 'A'.repeat(43) }); await sent(f, 3);
      assert.equal(f.pending[2].config.headers.get('x-wiez-action-proof'), '11111111-1111-4111-8111-111111111111.' + 'A'.repeat(43));
      const duringCommit = f.api.refreshRealtimeAccessToken();
      await new Promise(resolve => setImmediate(resolve)); assert.equal(f.pending.length, 3);
      const after = token(undefined, 3, undefined, 2);
      f.pending[2].resolve({ message: 'changed', accessToken: after, refreshToken: '22222222-2222-4222-8222-222222222222.new-secret' });
      await changed; assert.equal(await duringCommit, after);
    } finally { remove(); }
  });
  run('password rotation adopts exactly the approved next revision and cancels old private responses', async f => {
    const before = token(), after = token(undefined, 2, undefined, 2); f.set(before);
    const read = f.api.apiClient.get('/private'); const rejected = assert.rejects(read, cancelled); await sent(f, 1);
    await f.api.acceptPasswordSessionRotation(before, after, '22222222-2222-4222-8222-222222222222.new-secret');
    f.pending[0].resolve({ private: 'old-revision' }); await rejected;
    assert(native ? f.get().includes(':2:') : f.get() === after);
    if (native) assert.equal(f.writes[0].access, after);
  });
  run('a password result cannot overwrite a newer sign-in, skip an authority revision or change its session', async f => {
    const before = token(); f.set(before);
    for (const after of [token(undefined, 2, undefined, 3), token(undefined, 2, '44444444-4444-4444-8444-444444444444', 2)]) {
      await assert.rejects(async () => f.api.acceptPasswordSessionRotation(before, after,
        '22222222-2222-4222-8222-222222222222.new-secret'), error => error.code === 'ERR_CANCELED');
    }
    f.clear(); f.set(token('33333333-3333-4333-8333-333333333333')); const current = f.get();
    await assert.rejects(async () => f.api.acceptPasswordSessionRotation(before, token(undefined, 2, undefined, 2),
      '22222222-2222-4222-8222-222222222222.new-secret'), error => error.code === 'ERR_CANCELED');
    assert.equal(f.get(), current); assert.equal(f.writes.length, 0);
  });
  run('sign-out cancels a late anonymous response even if no access token existed', async f => {
    if (native) f.api.markApiAuthHydrated();
    const read = f.api.apiClient.get('/anonymous'); const rejected = assert.rejects(read, cancelled); await sent(f, 1);
    f.clear(); f.pending[0].resolve({ old: true }); await rejected;
  });
  run('late 401 cannot retry or expire the next sign-in', async f => {
    f.set(token()); const request = f.api.apiClient.get('/private'); const rejected = assert.rejects(request, cancelled);
    await sent(f, 1); f.clear(); f.set(token('33333333-3333-4333-8333-333333333333'));
    f.pending[0].reject(); await rejected; assert.equal(f.pending.length, 1); assert.equal(f.expired(), 0);
  });
  run('late network failures are cancelled rather than retried as the next sign-in', async f => {
    f.set(token()); const request = f.api.apiClient.get('/private'); const rejected = assert.rejects(request, cancelled);
    await sent(f, 1); f.clear(); f.set(token('33333333-3333-4333-8333-333333333333'));
    f.pending[0].offline(); await rejected; assert.equal(f.pending.length, 1); assert.equal(f.expired(), 0);
  });
  run('a fresh session for the same person invalidates the previous session response', async f => {
    f.set(token()); const request = f.api.apiClient.get('/private'); const rejected = assert.rejects(request, cancelled);
    await sent(f, 1); f.set(token(undefined, 2, '44444444-4444-4444-8444-444444444444'));
    f.pending[0].resolve({ private: 'old-session' }); await rejected;
  });
  run('late refresh success cannot replace a newer sign-in', async f => {
    f.set(token()); if (native) f.api.setApiRefreshToken('old-refresh');
    const refresh = f.api.refreshAccessToken(); await sent(f, 1);
    f.clear(); f.set(token('33333333-3333-4333-8333-333333333333'));
    if (native) f.api.setApiRefreshToken('new-refresh'); const before = f.get();
    f.pending[0].resolve({ accessToken: token(undefined, 2), refreshToken: 'rotated-old' });
    assert.equal(await refresh, null); assert.equal(f.get(), before); assert.equal(f.writes.length, 0);
  });
  run('old refresh rejection cannot sign out or poison the new session', async f => {
    f.set(token()); if (native) f.api.setApiRefreshToken('old-refresh');
    const old = f.api.refreshAccessToken(); await sent(f, 1); f.clear();
    f.set(token('33333333-3333-4333-8333-333333333333')); if (native) f.api.setApiRefreshToken('new-refresh');
    const before = f.get(); f.pending[0].reject(); assert.equal(await old, null);
    assert.equal(f.get(), before); assert.equal(f.expired(), 0);
    const fresh = f.api.refreshAccessToken(); await sent(f, 2);
    f.pending[1].resolve({ accessToken: token('33333333-3333-4333-8333-333333333333', 2), refreshToken: 'fresh' });
    assert(await fresh);
  });
  run('old refresh completion cannot clear the newer refresh coalescing promise', async f => {
    f.set(token()); if (native) f.api.setApiRefreshToken('old-refresh');
    const old = f.api.refreshAccessToken(); await sent(f, 1); f.clear();
    f.set(token('33333333-3333-4333-8333-333333333333')); if (native) f.api.setApiRefreshToken('new-refresh');
    const fresh = f.api.refreshAccessToken();
    if (native) await sent(f, 2);
    f.pending[0].resolve({ accessToken: token(undefined, 2), refreshToken: 'old-rotated' }); await old; await sent(f, 2);
    const shared = f.api.refreshAccessToken(); await sent(f, 2);
    const next = token('33333333-3333-4333-8333-333333333333', 2);
    f.pending[1].resolve({ accessToken: next, refreshToken: 'new-rotated' });
    assert.equal(await fresh, next); assert.equal(await shared, next);
  });
  if (native) run('account-bound push cleanup keeps its original credential after account switch', async f => {
    const a = token(); f.set(a); f.clear(); f.set(token('33333333-3333-4333-8333-333333333333'));
    const cleanup = f.api.apiClient.delete('/notifications/device', { _accountToken: a }); await sent(f, 1);
    assert.equal(f.pending[0].config.headers.get('Authorization'), `Bearer ${a}`);
    f.pending[0].resolve({ removed: true }); assert.equal((await cleanup).data.removed, true);
  });
  if (native) run('realtime refresh rejection signs out only the rejected current session', async f => {
    f.set(token()); f.api.setApiRefreshToken('rejected-refresh'); let signOuts = 0;
    f.api.setUnauthorizedHandler(() => { signOuts++; f.clear(); });
    const refresh = f.api.refreshRealtimeAccessToken(); await sent(f, 1); f.pending[0].reject();
    assert.equal(await refresh, null); assert.equal(signOuts, 1); assert.equal(f.get(), null);
  });
  if (native) run('late realtime rejection cannot sign out a later account', async f => {
    f.set(token()); f.api.setApiRefreshToken('old-refresh'); let signOuts = 0;
    f.api.setUnauthorizedHandler(() => { signOuts++; f.clear(); });
    const refresh = f.api.refreshRealtimeAccessToken(); await sent(f, 1); f.clear();
    f.set(token('33333333-3333-4333-8333-333333333333')); f.api.setApiRefreshToken('later-refresh'); const current = f.get();
    f.pending[0].reject(); assert.equal(await refresh, null); assert.equal(signOuts, 0); assert.equal(f.get(), current);
  });
  if (!native) run('anonymous cookie-backed bootstrap may retry with its own restored token', async f => {
    const read = f.api.apiClient.get('/auth/profile'); await sent(f, 1); f.pending[0].reject(); await sent(f, 2);
    f.pending[1].resolve({ accessToken: token() }); await sent(f, 3); f.pending[2].resolve({ user: 'restored' });
    assert.equal((await read).data.user, 'restored');
  });
  if (!native) run('failed unbound cookie restoration clears only this tab and preserves another tab’s snapshot', async f => {
    const refresh = f.api.refreshAccessToken(); await sent(f, 1); f.pending[0].reject();
    assert.equal(await refresh, null); assert.equal(f.expired(), 1);
    assert.equal(f.expiredDetails[0]?.preserveSharedAuthStorage, true);
  });
  if (!native) run('sign-in waits for an older cookie rotation and logout keeps the outgoing credential', async f => {
    const a = token(); f.set(a); const old = f.api.refreshAccessToken(); await sent(f, 1);
    const logout = f.api.logoutCurrentSession(); f.clear();
    const login = f.api.apiClient.post('/auth/login', { email: 'new@example.invalid' });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.pending.length, 1);
    f.pending[0].resolve({ accessToken: token(undefined, 2) }); assert.equal(await old, null); await sent(f, 2);
    assert.equal(f.pending[1].config.headers.get('Authorization'), `Bearer ${a}`);
    f.pending[1].resolve(); await logout; await sent(f, 3);
    f.pending[2].resolve({ accessToken: token('33333333-3333-4333-8333-333333333333') }); await login;
  });
  if (!native) run('a different tab cookie cannot import another account into existing state', async f => {
    f.set(token()); const refresh = f.api.refreshAccessToken(); await sent(f, 1);
    f.pending[0].resolve({ accessToken: token('33333333-3333-4333-8333-333333333333') });
    assert.equal(await refresh, null); assert.equal(f.get(), null); assert.equal(f.expired(), 1);
  });
  if (!native) run('sign-out during anonymous bootstrap waits to clear the newly rotated cookies', async f => {
    const refresh = f.api.refreshAccessToken(); await sent(f, 1);
    const logout = f.api.logoutCurrentSession(); f.clear();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.pending.length, 1);
    f.pending[0].resolve({ accessToken: token() }); assert.equal(await refresh, null); await sent(f, 2);
    assert.equal(f.pending[1].config.url, '/auth/logout');
    assert.equal(f.pending[1].config.headers.get('Authorization'), undefined);
    f.pending[1].reject(); await assert.rejects(logout); assert.equal(f.pending.length, 2);
    assert.equal(f.expired(), 0); assert.equal(f.get(), null);
  });
}
