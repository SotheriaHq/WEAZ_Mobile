const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { toByteArray } = require('base64-js');

function load(name, dependencies = {}) {
  const filename = path.join(__dirname, '..', 'src', 'auth', name);
  return loadFile(filename, dependencies);
}
function loadFile(filename, dependencies = {}) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, performance, setTimeout, clearTimeout, AbortController, URL, URLSearchParams,
    require: name => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); } }, { filename });
  return module.exports;
}
const { createSecurityChallengeBroker, parseSecurityChallenge, securityIdentityFromToken } = load('securityChallenge.ts');
const { scrubSecurityTelemetry } = load('securityTelemetry.ts');
const id = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const proof = `${id}.${'A'.repeat(43)}`;
const challenge = (critical = true) => ({ code: 'STEP_UP_REQUIRED', sensitivity: critical ? 'CRITICAL_CHANGE' : 'SENSITIVE_READ',
  challengeId: id, deadline: 5000, review: { title: 'Verify this action' } });

test('web and native explain the server recovery policy without fabricating independent approvals', context => {
  const webRoot = process.env.WIEZ_WEB_SECURITY_ROOT || path.resolve(__dirname, '../../fthreadly');
  const webFile = path.join(webRoot, 'src/auth/useMfaRecovery.ts');
  if (!fs.existsSync(webFile)) { context.skip('Sibling web recovery source is unavailable'); return; }
  const dependencies = { react: {}, '../api/SecurityMfaApi': {}, './securityChallenge': {} };
  const native = load('useMfaRecovery.ts', dependencies);
  const web = loadFile(webFile, dependencies);
  for (const status of ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'CANCELLED', 'COMPLETED']) {
    for (const requiredApprovals of [0, 2]) {
      const request = { status, requiredApprovals };
      const expected = requiredApprovals === 0 && ['PENDING_REVIEW', 'NEEDS_INFORMATION'].includes(status);
      assert.equal(native.mfaRecoveryCanContinueWithoutReview(request), expected);
      assert.equal(web.mfaRecoveryCanContinueWithoutReview(request), expected);
    }
  }
  for (const request of [{ requiredApprovals: 0, approvals: 0 }, { requiredApprovals: 2, approvals: 1 }]) {
    const result = native.mfaRecoveryApprovalSummary(request);
    assert.equal(result, web.mfaRecoveryApprovalSummary(request));
    if (request.requiredApprovals === 0) {
      assert.match(result, /test-environment SuperAdmin/);
      assert.match(result, /password, email code and verified replacement/);
      assert.doesNotMatch(result, /0 of 0/);
    } else assert.equal(result, '1 of 2 independent approvals for this revision.');
  }
});

test('password rotation retains only this principal and session with exactly one new authority revision', context => {
  const webRoot = process.env.WIEZ_WEB_SECURITY_ROOT || path.resolve(__dirname, '../../fthreadly');
  const webFile = path.join(webRoot, 'src/auth/passwordSessionRotation.ts');
  if (!fs.existsSync(webFile)) { context.skip('Sibling web password transition is unavailable'); return; }
  const dependencies = { './securityChallenge': load('securityChallenge.ts') };
  const native = load('passwordSessionRotation.ts', dependencies);
  const web = loadFile(webFile, dependencies);
  const encoded = (change = {}) => `e30.${Buffer.from(JSON.stringify({ sub: id, sid, authVersion: 1, role: 'User', ...change })).toString('base64url')}.sig`;
  const decode = value => Buffer.from(value, 'base64').toString('binary');
  const original = encoded();
  for (const [patch, expected] of [[{ authVersion: 2 }, true], [{ authVersion: 1 }, false], [{ authVersion: 3 }, false],
    [{ authVersion: 0 }, false], [{ authVersion: 2, sub: sid }, false], [{ authVersion: 2, sid: id }, false],
    [{ authVersion: 2, role: 'SuperAdmin' }, false]]) {
    assert.equal(native.isPasswordSessionRotation(original, encoded(patch), decode), expected);
    assert.equal(web.isPasswordSessionRotation(original, encoded(patch), decode), expected);
  }
});

test('trusted Studio password links open native security while foreign origins never open a native account screen', () => {
  const bridge = load('../features/studio/studioNavigationBridge.ts', {
    '@/src/config/env': { env: { webAppUrl: 'https://weaz.me' } },
    '@/src/features/studio/studioRoutes': { getTrustedStudioOrigins: () => new Set(['https://weaz.me']) },
    '@/src/navigation/nativeIslandConfig': { STUDIO_SURFACE_PARAM: 'surface', STUDIO_SURFACE_PARAM_VALUE: 'mobile-app' },
    '@/src/utils/mobileRouting': {},
  });
  for (const path of ['/settings/account-security', '/settings?tab=security', '/settings?tab=account-security']) {
    const result = bridge.classifyStudioWebUrl(`https://weaz.me${path}`);
    assert.equal(result.type, 'native'); assert.equal(result.nativeRoute, '/settings/account-security');
    assert.equal(bridge.classifyStudioWebUrl(`https://untrusted.invalid${path}`).type, 'external');
  }
  assert.equal(bridge.classifyStudioWebUrl('https://weaz.me/settings?tab=store-hours').type, 'studio');
});

test('phone verification uses only the matching root session and discards a later account switch', async () => {
  let identity = `${id}:${sid}:1:User`, finish;
  const calls = [];
  const { verifyStudioParentSession } = load('../features/studio/verifyParentSession.ts', {
    '@/src/api/httpClient': { getApiSecurityIdentity: () => identity, apiClient: { get: (url, config) => {
      calls.push({ url, config }); return new Promise(resolve => { finish = resolve; });
    } } },
    '@/src/auth/securityChallenge': load('securityChallenge.ts'),
  });
  await assert.rejects(verifyStudioParentSession(id, new AbortController().signal), error => error.code === 'ERR_CANCELED');
  assert.equal(calls.length, 0);
  const controller = new AbortController(), request = verifyStudioParentSession(sid, controller.signal);
  assert.equal(calls[0].url, '/auth/profile'); assert.equal(calls[0].config.signal, controller.signal);
  assert.equal(calls[0].config.headers['Cache-Control'], 'no-cache');
  identity = `${sid}:${id}:1:User`; finish({});
  await assert.rejects(request, error => error.code === 'ERR_CANCELED');
});

test('phone verification keeps MFA attached to the native root and returns no proof to Studio', async () => {
  const identity = `${id}:${sid}:1:User`, broker = createSecurityChallengeBroker(() => 0);
  let prompt;
  broker.register(value => { prompt = value; value.complete({ actionProof: null }); });
  const { verifyStudioParentSession } = load('../features/studio/verifyParentSession.ts', {
    '@/src/api/httpClient': { getApiSecurityIdentity: () => identity,
      apiClient: { get: () => broker.request(challenge(false), identity, () => identity) } },
    '@/src/auth/securityChallenge': load('securityChallenge.ts'),
  });
  assert.equal(await verifyStudioParentSession(sid, new AbortController().signal), undefined);
  assert.equal(prompt.identity, identity);
});

test('native identity decoding uses the installed base64 decoder and survives token rotation', () => {
  const token = data => `e30.${Buffer.from(JSON.stringify({ sub: id, sid, role: 'User', authVersion: 1, ...data })).toString('base64url')}.sig`;
  const decode = value => String.fromCharCode(...toByteArray(value));
  assert.equal(securityIdentityFromToken(token({ exp: 1 }), decode), securityIdentityFromToken(token({ exp: 2 }), decode));
  assert.notEqual(securityIdentityFromToken(token({ sid: id }), decode), securityIdentityFromToken(token({}), decode));
  assert.equal(securityIdentityFromToken('malformed', decode), null);
});
test('native viewing verification cannot forward a critical action proof', async () => {
  const broker = createSecurityChallengeBroker(() => 0);
  broker.register(prompt => prompt.complete({ actionProof: proof }));
  const result = await broker.request(challenge(false), 'actor', () => 'actor');
  assert.equal(result.actionProof, null);
});
test('native account switch cancels the old prompt and stale completion cannot approve a new one', async () => {
  const broker = createSecurityChallengeBroker(() => 0); let prompt;
  broker.register(value => { prompt = value; });
  const old = broker.request(challenge(), 'old', () => 'old'); const oldPrompt = prompt;
  const rejection = assert.rejects(old, error => error.code === 'ERR_CANCELED');
  const current = broker.request(challenge(), 'new', () => 'new');
  oldPrompt.complete({ actionProof: proof }); prompt.complete({ actionProof: proof });
  await rejection; assert.equal((await current).actionProof, proof);
});
test('native cancellation never completes the waiting action', async () => {
  const broker = createSecurityChallengeBroker(() => 0); let prompt;
  broker.register(value => { prompt = value; });
  const controller = new AbortController();
  const result = broker.request(challenge(), 'actor', () => 'actor', controller.signal);
  const rejection = assert.rejects(result, error => error.code === 'ERR_CANCELED');
  controller.abort(); assert.equal(prompt.isCurrent(), false); prompt.complete({ actionProof: proof }); await rejection;
});

function passkeys(os = 'android', sdk = {}) {
  let imports = 0;
  const dependencies = { 'react-native': { Platform: { OS: os } }, './securityChallenge': load('securityChallenge.ts') };
  Object.defineProperty(dependencies, 'react-native-passkeys', { get() { imports++; return sdk; } });
  return { adapter: load('passkeys.ts', dependencies), imports: () => imports };
}
test('Apple passkeys stay deferred without loading a native SDK; Android configuration stays independent', async () => {
  const ios = passkeys('ios');
  assert.equal((await ios.adapter.passkeyAvailability({ webConfigured: true, androidConfigured: true })).available, false);
  await assert.rejects(ios.adapter.createPasskey({}), /not available.*iOS/);
  assert.equal(ios.imports(), 0);
  const android = passkeys('android');
  assert.equal((await android.adapter.passkeyAvailability({ webConfigured: true, androidConfigured: false })).available, false);
  assert.equal(android.imports(), 0);
});
test('older native builds without the module fail safely instead of crashing app startup', async () => {
  const { adapter } = passkeys('android', { isSupported() { throw new Error('module unavailable'); } });
  assert.equal((await adapter.passkeyAvailability({ webConfigured: true, androidConfigured: true })).available, false);
});
test('Android discards a cancelled late result, prevents competing ceremonies, and recovers afterwards', async () => {
  let resolve;
  const fixture = passkeys('android', { isSupported: () => true, create: () => new Promise(yes => { resolve = yes; }) });
  const controller = new AbortController();
  const first = fixture.adapter.createPasskey({}, controller.signal);
  await assert.rejects(fixture.adapter.createPasskey({}), /current passkey prompt/);
  while (!resolve) await Promise.resolve();
  controller.abort(); resolve({ id: 'late' });
  await assert.rejects(first, error => error.code === 'ERR_CANCELED');
  assert.equal((await fixture.adapter.passkeyAvailability({ webConfigured: true, androidConfigured: true })).available, true);
});
test('Android cancellation before lazy module loading never opens the system prompt', async () => {
  let opened = 0;
  const { adapter } = passkeys('android', { create() { opened++; return { id: 'bad' }; } });
  const controller = new AbortController(); const first = adapter.createPasskey({}, controller.signal); controller.abort();
  await assert.rejects(first, error => error.code === 'ERR_CANCELED'); assert.equal(opened, 0);
});
test('Android serializes only the standard credential response and safely handles an empty cancellation', async () => {
  const fixture = passkeys('android', { create: async () => ({ id: 'credential', getPublicKey: () => 'private-function' }), get: async () => null });
  assert.equal(JSON.stringify(await fixture.adapter.createPasskey({})), '{"id":"credential"}');
  await assert.rejects(fixture.adapter.authenticatePasskey({}), /cancelled/);
});
test('native server-duration metadata rejects stale or malformed challenges', () => {
  const data = { code: 'STEP_UP_REQUIRED', sensitivity: 'CRITICAL_CHANGE', challengeId: id,
    serverNow: '2026-11-02T00:00:00Z', expiresAt: '2026-11-02T00:05:00Z' };
  assert.equal(parseSecurityChallenge(data, 100, () => 200).deadline, 300100);
  assert.equal(parseSecurityChallenge(data, 0, () => 300001), null);
  assert.equal(parseSecurityChallenge({ ...data, challengeId: 'invalid' }, 0, () => 0), null);
});

test('native explicit transaction restart never opens verification or automatically retries the action', async () => {
  const security = load('securityChallenge.ts');
  let prompted = 0;
  const retry = load('securityRequestRetry.ts', { './securityChallenge': { ...security,
    securityChallenges: { request() { prompted++; throw new Error('Must not present'); } } } });
  const result = await retry.verifyChallengedRequest({ _securityStartedAt: performance.now() }, {
    code: 'SECURITY_VERIFICATION_RESTART_REQUIRED', message: 'Review the current state, then retry this action.',
  }, 'current-session', () => 'current-session');
  assert.equal(result, null); assert.equal(prompted, 0);
});
test('native telemetry removes serialized passwords, MFA material and recovery codes', () => {
  const output = JSON.stringify(scrubSecurityTelemetry({ data: JSON.stringify({ password: 'private-password',
    secret: 'private-seed', actionProof: proof, recoveryCodes: ['private-backup'] }), status: 400 }));
  assert(!/private-password|private-seed|private-backup|AAAAAAAA/.test(output));
  assert(output.includes('400'));
});

test('web/native verification decisions and malformed-status rejection stay aligned', context => {
  const web = process.env.WIEZ_WEB_SECURITY_ROOT || path.resolve(__dirname, '../../fthreadly');
  const sibling = path.join(web, 'src/auth/securityChallenge.ts');
  if (!fs.existsSync(sibling)) { context.skip('Sibling web security source is not checked out; run with WIEZ_WEB_SECURITY_ROOT for paired verification'); return; }
  const browser = loadFile(sibling);
  const common = { code: 'STEP_UP_REQUIRED', sensitivity: 'CRITICAL_CHANGE', challengeId: id,
    serverNow: '2026-11-02T00:00:00Z', expiresAt: '2026-11-02T00:05:00Z' };
  for (const value of [common, { ...common, challengeId: 'bad' }, { ...common, expiresAt: 'invalid' },
    { ...common, sensitivity: 'SENSITIVE_READ' }, { ...common, code: 'MFA_ENROLLMENT_REQUIRED', challengeId: undefined }]) {
    assert.equal(JSON.stringify(browser.parseSecurityChallenge(value, 100, () => 200)), JSON.stringify(parseSecurityChallenge(value, 100, () => 200)));
  }
  const nativeApi = loadFile(path.join(__dirname, '../src/api/SecurityMfaApi.ts'), { './httpClient': { apiClient: {} },
    '../auth/securityChallenge': load('securityChallenge.ts') });
  const webApi = loadFile(path.join(web, 'src/api/SecurityMfaApi.ts'), { './httpClient': { apiClient: {} }, '../auth/securityChallenge': browser });
  const status = { factors: [], recoveryCodesRemaining: 0, readVerificationSeconds: 300, setup: { hasPassword: true, emailVerified: true },
    passkeys: { webConfigured: true, androidConfigured: false } };
  for (const value of [status, { data: status }, {}, { ...status, passkeys: null }, { ...status, recoveryCodesRemaining: 11 }]) {
    const decision = api => { try { return JSON.stringify(api.parseMfaStatus(value)); } catch { return 'rejected'; } };
    assert.equal(decision(nativeApi), decision(webApi));
  }
});
