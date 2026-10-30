// Push registration recovers on its own, reports the phone and the server
// separately, writes only as the account that started it, and stops pushes to
// this phone when that account signs out. Runs the real module with a fake
// phone and API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
// Objects made inside the vm sandbox carry its prototypes; compare their data.
const plain = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const sameData = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);

function compile(relative) {
  return ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function loadRegistration({ phone = {}, api = {}, storage = {} } = {}) {
  const store = {};
  const calls = { register: [], deactivate: [] };
  const notificationsModule = {
    PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
    AndroidImportance: { DEFAULT: 3 },
    getPermissionsAsync: async () => ({ status: phone.permission ?? 'granted' }),
    requestPermissionsAsync: async () => ({ status: phone.permission ?? 'granted' }),
    getExpoPushTokenAsync: phone.getToken ?? (async () => ({ data: 'ExponentPushToken[phone]' })),
    addPushTokenListener: () => ({ remove() {} }),
  };
  const notificationsApi = {
    getSettings: api.getSettings ?? (async () => ({ push: { enabled: true } })),
    registerPushToken: async (payload, options) => {
      calls.register.push({ payload, options });
      return api.register ? api.register(payload, options) : { success: true };
    },
    deactivateCurrentPushToken: async (token, options) => {
      calls.deactivate.push({ token, options });
      return api.deactivate ? api.deactivate(token, options) : { success: true };
    },
  };
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === 'react') return { useEffect: () => undefined, useSyncExternalStore: () => undefined };
      if (request === 'react-native') return { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) } };
      if (request === 'expo-constants') {
        return { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } };
      }
      if (request === 'expo-secure-store') {
        return {
          getItemAsync: async (key) => store[key] ?? null,
          setItemAsync: async (key, value) => {
            if (storage.beforeSet) await storage.beforeSet();
            store[key] = value;
          },
          deleteItemAsync: async (key) => {
            if (storage.beforeDelete) await storage.beforeDelete();
            delete store[key];
          },
        };
      }
      if (request === 'expo-notifications') return notificationsModule;
      if (request === '@/src/api/NotificationsApi') return { NotificationsApi: notificationsApi };
      if (request === '@/src/api/httpClient') return { getActiveApiBaseUrl: () => 'https://api.wiez.test' };
      if (request === '@/src/notifications/pushChannels') return { ensureAndroidPushChannels: async () => undefined };
      throw new Error(`unexpected import ${request}`);
    },
    console: { ...console, warn: () => undefined, log: () => undefined },
    process,
    setTimeout,
    clearTimeout,
    __DEV__: false,
  };
  vm.runInNewContext(compile('src/notifications/pushTokenRegistration.ts'), sandbox);
  return { push: module.exports, calls, store };
}

async function main() {
  // A phone without Firebase is a build to replace, not an attempt to repeat.
  {
    const { push } = loadRegistration();
    assert.equal(
      push.classifyDeviceRegistrationError(new Error('Default FirebaseApp is not initialized in this process com.wiez.wiez')),
      'push-service-not-configured',
    );
    assert.equal(push.classifyDeviceRegistrationError(new Error('SERVICE_NOT_AVAILABLE')), 'device-registration-failed');

    const failedServer = { status: 'failed', stage: 'server', reason: 'server-registration-failed' };
    const delays = [0, 1, 2, 3, 4].map((n) => push.nextRegistrationRetryDelay(failedServer, n));
    sameData(delays, [30_000, 120_000, 600_000, 1_800_000, null], 'short and finite: never a polling loop');
    assert.equal(
      push.nextRegistrationRetryDelay({ status: 'failed', stage: 'device', reason: 'push-service-not-configured' }, 0),
      null,
    );
    for (const reason of ['permission-denied', 'push-disabled', 'expo-project-id-missing', 'already-registered']) {
      assert.equal(push.nextRegistrationRetryDelay({ status: 'skipped', reason }, 0), null, reason);
    }
    assert.equal(push.nextRegistrationRetryDelay({ status: 'skipped', reason: 'push-settings-unavailable' }, 0), 30_000);

    sameData(push.describePushDeviceStatus(null), { phone: 'not-checked', server: 'not-checked', retryable: true });
    sameData(push.describePushDeviceStatus({ status: 'registered', token: 't' }), { phone: 'ready', server: 'saved', retryable: false });
    sameData(push.describePushDeviceStatus(failedServer), { phone: 'ready', server: 'failed', retryable: true });
    sameData(
      push.describePushDeviceStatus({ status: 'failed', stage: 'device', reason: 'push-service-not-configured' }),
      { phone: 'needs-app-update', server: 'waiting', retryable: false },
    );
    sameData(
      push.describePushDeviceStatus({ status: 'skipped', reason: 'permission-denied' }),
      { phone: 'waiting-for-permission', server: 'waiting', retryable: false },
    );
  }

  // The phone failing is reported, not thrown, and recorded for the screen.
  {
    const { push, calls } = loadRegistration({
      phone: { getToken: async () => { throw new Error('Default FirebaseApp is not initialized'); } },
    });
    const result = await push.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1' });
    sameData(result, { status: 'failed', stage: 'device', reason: 'push-service-not-configured' });
    assert.equal(calls.register.length, 0);
    sameData(push.getPushRegistrationState().result, result);
  }

  // The server failing is reported as the server, not thrown.
  {
    const { push } = loadRegistration({ api: { register: async () => { throw new Error('network down'); } } });
    const result = await push.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1' });
    sameData(result, { status: 'failed', stage: 'server', reason: 'server-registration-failed' });
  }

  // Success: written as the starting account. A repeat is skipped; Retry
  // (force) and token rotation reach the server again.
  {
    const { push, calls } = loadRegistration();
    const first = await push.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1' });
    assert.equal(first.status, 'registered');
    assert.equal(calls.register[0].options.asAccount, 'token-u1');
    const repeat = await push.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1' });
    sameData(repeat, { status: 'skipped', reason: 'already-registered' });
    const forced = await push.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1', force: true });
    assert.equal(forced.status, 'registered');
    assert.equal(calls.register.length, 2);
  }

  // Account change: B's write waits for A's to land, so the last write, which
  // owns the device on the server, is the account signed in now.
  {
    const slowA = deferred();
    const { push, calls } = loadRegistration({
      api: { register: (payload, options) => (options.asAccount === 'token-a' ? slowA.promise : { success: true }) },
    });
    const order = [];
    const a = push.registerAuthenticatedPushToken({ userId: 'a', authToken: 'token-a' }).then((r) => order.push(['a', r.status]));
    await new Promise((resolve) => setImmediate(resolve));
    const b = push.registerAuthenticatedPushToken({ userId: 'b', authToken: 'token-b' }).then((r) => order.push(['b', r.status]));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.register.length, 1, 'B must not write while A is in flight');
    slowA.resolve({ success: true });
    await Promise.all([a, b]);
    sameData(calls.register.map((c) => c.options.asAccount), ['token-a', 'token-b']);
    sameData(order.map(([who]) => who), ['a', 'b']);
  }

  // Sign-out while a write is in flight: it lands first, then is undone as
  // the account that made it; the logout deactivation is sent as that account.
  {
    const slow = deferred();
    const { push, calls } = loadRegistration({ api: { register: () => slow.promise } });
    const pending = push.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1' });
    await new Promise((resolve) => setImmediate(resolve));
    const logout = push.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-u1' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.deactivate.length, 0, 'logout waits for the in-flight write');
    slow.resolve({ success: true });
    const result = await pending;
    await logout;
    sameData(result, { status: 'skipped', reason: 'registration-cancelled' });
    assert.ok(calls.deactivate.length >= 1);
    for (const call of calls.deactivate) assert.equal(call.options.asAccount, 'token-u1');
    assert.equal(push.getPushRegistrationState().result, null, 'sign-out clears the device status');
  }

  // A sign-out during the attempt cancels it before it writes.
  {
    const permission = deferred();
    // Hold the attempt at the settings read, then sign out.
    const { push: gated, calls: gatedCalls } = loadRegistration({
      api: { getSettings: () => permission.promise },
    });
    const attempt = gated.registerAuthenticatedPushToken({ userId: 'u1', authToken: 'token-u1', requirePushEnabled: true });
    await new Promise((resolve) => setImmediate(resolve));
    await gated.clearStoredPushRegistration();
    permission.resolve({ push: { enabled: true } });
    sameData(await attempt, { status: 'skipped', reason: 'registration-cancelled' });
    assert.equal(gatedCalls.register.length, 0);
  }

  // Late logout cleanup must finish before B writes, and cannot subsequently
  // invalidate B's epoch, durable record, status or server ownership.
  for (const failCleanup of [false, true]) {
    const cleanup = deferred();
    let serverOwner = null;
    const { push, store, calls } = loadRegistration({ api: {
      register: async (_, options) => { serverOwner = options.asAccount; },
      deactivate: async (_, options) => {
        await cleanup.promise;
        if (failCleanup) throw new Error('cleanup network failure');
        if (serverOwner === options.asAccount) serverOwner = null;
      },
    } });
    await push.registerAuthenticatedPushToken({ userId: 'a', authToken: 'token-a' });
    const logout = push.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-a' });
    await new Promise((resolve) => setImmediate(resolve));
    const b = push.registerAuthenticatedPushToken({ userId: 'b', authToken: 'token-b' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.register.length, 1, 'B waits for outgoing cleanup');
    cleanup.resolve();
    await logout;
    assert.equal((await b).status, 'registered');
    assert.equal(serverOwner, 'token-b');
    assert.equal(push.getPushRegistrationState().result.status, 'registered');
    assert.equal(JSON.parse(Object.values(store)[0]).userId, 'b');
    sameData(calls.deactivate.map((call) => call.options.asAccount), ['token-a']);
  }

  // An outgoing attempt blocked before POST must not overwrite B's successful
  // screen status when it finally returns, even with the same phone token.
  {
    const settings = deferred();
    let reads = 0;
    const { push, calls } = loadRegistration({ api: {
      getSettings: () => ++reads === 1 ? settings.promise : { push: { enabled: true } },
    } });
    const a = push.registerAuthenticatedPushToken({ userId: 'a', authToken: 'token-a', requirePushEnabled: true });
    await push.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-a' });
    await push.registerAuthenticatedPushToken({ userId: 'b', authToken: 'token-b' });
    settings.resolve({ push: { enabled: true } });
    sameData(await a, { status: 'skipped', reason: 'registration-cancelled' });
    assert.equal(push.getPushRegistrationState().result.status, 'registered');
    sameData(calls.register.map((call) => call.options.asAccount), ['token-b']);
  }

  // Settings visibility: push off hides its dependents; times need quiet hours.
  // SecureStore failures cannot orphan a server-accepted token, nor can an old
  // durable record falsely claim that a deactivated token remains subscribed.
  for (const fault of ['beforeSet', 'beforeDelete']) {
    let active = false;
    const { push, calls } = loadRegistration({
      api: {
        register: async () => { active = true; },
        deactivate: async () => { active = false; },
      },
      storage: { [fault]: async () => { throw new Error('secure storage unavailable'); } },
    });
    assert.equal((await push.registerAuthenticatedPushToken({ userId: 'a', authToken: 'token-a' })).status, 'registered');
    await push.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-a' });
    assert.equal(active, false, 'logout deactivates even if the durable write failed');
    assert.equal((await push.registerAuthenticatedPushToken({ userId: 'a', authToken: 'token-a' })).status, 'registered');
    assert.equal(active, true, 'new session re-registers despite a retained stale disk record');
    assert.equal(calls.register.length, 2);
  }

  // Settings visibility: push off hides its dependents; times need quiet hours.
  {
    const mod = { exports: {} };
    vm.runInNewContext(compile('src/notifications/notificationSettings.ts'), { module: mod, exports: mod.exports });
    const { pushControlVisibility } = mod.exports;
    sameData(pushControlVisibility({ enabled: false, quietHoursEnabled: true }), { pushDependents: false, quietHourTimes: false });
    sameData(pushControlVisibility({ enabled: true, quietHoursEnabled: false }), { pushDependents: true, quietHourTimes: false });
    sameData(pushControlVisibility({ enabled: true, quietHoursEnabled: true }), { pushDependents: true, quietHourTimes: true });
  }

  // Wiring the module tests cannot reach.
  const screen = read('app/settings/notifications.tsx');
  assert.match(screen, /onRetry=\{\(\) => triggerPushRegistration\(true\)\}/, 'Retry re-registers, not re-saves a setting');
  assert.match(screen, /DELIVERY_SECTION_PUSH_OFF/);
  assert.match(screen, /pushControlVisibility\(settings\.push\)\.pushDependents \? \(/, 'device status and quiet hours only while push is on');
  assert.match(screen, /\{showTimes \? \(/, 'quiet-hour times only while quiet hours are on');
  assert.doesNotMatch(screen, /could not register for push yet/, 'registration outcomes are not shown as an unsaved setting');

  const http = read('src/api/httpClient.ts');
  assert.match(http, /const authToken = retryableConfig\._accountToken \?\? currentAuthToken;/);
  assert.match(http, /!originalRequest\._accountToken &&\s*!isAuthEndpoint/, 'an account-bound 401 is never refreshed as someone else');

  assert.match(read('src/auth/sessionCleanup.ts'), /deactivateRegisteredPushTokenForLogout\(\{ asAccount: pushAccountToken \}\)/);
  assert.match(read('src/auth/AuthContext.tsx'), /clearMobilePrivateSessionState\(\{ client: queryClient, pushAccountToken: token \}\)/);

  // google-services.json reaches the build when present.
  const config = read('app.config.js');
  assert.match(config, /googleServicesFile/);
  assert.match(read('.github/workflows/android-preview-apk.yml'), /secrets\.GOOGLE_SERVICES_JSON/);

  console.log('push registration recovery contract: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
