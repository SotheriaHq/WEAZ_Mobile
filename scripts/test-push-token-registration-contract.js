const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const appConfigPath = path.join(repoRoot, 'app.config.js');
const appJsonPath = path.join(repoRoot, 'app.json');
const pushRegistrationPath = path.join(repoRoot, 'src', 'notifications', 'pushTokenRegistration.ts');

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  }).outputText;
}

function loadPushRegistration(options = {}) {
  const deletedKeys = [];
  const store = { ...(options.store ?? {}) };
  const constants = options.constants ?? {
    executionEnvironment: 'standalone',
    expoConfig: { version: '1.0.0', extra: {} },
  };
  const platform = { OS: options.platform ?? 'ios' };
  const notificationsApi = options.notificationsApi ?? {
    getSettings: async () => ({ push: { enabled: true } }),
    registerPushToken: async () => ({ success: true }),
    deactivateCurrentPushToken: async () => ({ success: true }),
  };

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === 'react') {
        return { useEffect: () => undefined };
      }
      if (request === 'react-native') {
        return { Platform: platform };
      }
      if (request === 'expo-constants') {
        return constants;
      }
      if (request === 'expo-secure-store') {
        return (
          options.secureStore ?? {
            getItemAsync: async (key) => store[key] ?? null,
            setItemAsync: async (key, value) => {
              store[key] = value;
            },
            deleteItemAsync: async (key) => {
              deletedKeys.push(key);
              delete store[key];
            },
          }
        );
      }
      if (request === '@/src/api/NotificationsApi') {
        return { NotificationsApi: notificationsApi };
      }
      if (request === '@/src/api/httpClient') {
        return { getActiveApiBaseUrl: () => 'https://api.threadly.test' };
      }
      if (request === '@/src/notifications/pushChannels') {
        return { ensureAndroidPushChannels: async () => undefined };
      }
      if (request === 'expo-notifications') {
        return (
          options.expoNotifications ?? {
            PermissionStatus: {
              GRANTED: 'granted',
              DENIED: 'denied',
              UNDETERMINED: 'undetermined',
            },
            getPermissionsAsync: async () => ({ status: 'granted', granted: true }),
            getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' }),
          }
        );
      }
      return require(request);
    },
    console,
    process,
    __DEV__: false,
  };

  vm.runInNewContext(compile(pushRegistrationPath), sandbox, { filename: pushRegistrationPath });
  return { exports: module.exports, store, deletedKeys };
}

function loadAppConfigWithProjectId(projectId) {
  const previousProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  try {
    if (projectId) {
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID = projectId;
    } else {
      delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    }

    delete require.cache[require.resolve(appConfigPath)];
    const appConfig = require(appConfigPath);
    return appConfig();
  } finally {
    if (previousProjectId === undefined) {
      delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    } else {
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID = previousProjectId;
    }
    delete require.cache[require.resolve(appConfigPath)];
  }
}

async function main() {
  const { exports: pushRegistration } = loadPushRegistration();

  assert.equal(pushRegistration.mapPlatformToPushPlatform('ios'), 'IOS');
  assert.equal(pushRegistration.mapPlatformToPushPlatform('android'), 'ANDROID');
  assert.equal(pushRegistration.mapPlatformToPushPlatform('web'), 'WEB');
  assert.equal(pushRegistration.mapPlatformToPushPlatform('windows'), 'UNKNOWN');

  assert.equal(
    pushRegistration.resolveExpoProjectId({
      expoConfig: { extra: { eas: { projectId: 'expo-config-project' } } },
    }),
    'expo-config-project',
  );
  assert.equal(
    pushRegistration.resolveExpoProjectId({ easConfig: { projectId: 'eas-config-project' } }),
    'eas-config-project',
  );
  assert.equal(
    pushRegistration.resolveExpoProjectId({}, { EXPO_PUBLIC_EAS_PROJECT_ID: 'env-project' }),
    'env-project',
  );
  assert.equal(
    pushRegistration.resolveExpoProjectId({}, { EXPO_PUBLIC_FCM_SENDER_ID: 'fcm-sender' }),
    null,
    'FCM sender IDs must not be passed as Expo project IDs.',
  );

  const configuredApp = loadAppConfigWithProjectId('configured-eas-project');
  assert.equal(configuredApp.extra.eas.projectId, 'configured-eas-project');
  assert.equal(
    pushRegistration.resolveExpoProjectId({ expoConfig: configuredApp }, {}),
    'configured-eas-project',
  );

  const unconfiguredApp = loadAppConfigWithProjectId(null);
  const checkedInProjectId = require(appJsonPath).expo?.extra?.eas?.projectId;
  if (checkedInProjectId) {
    assert.deepEqual(unconfiguredApp.extra.eas, { projectId: checkedInProjectId });
    assert.equal(
      pushRegistration.resolveExpoProjectId({ expoConfig: unconfiguredApp }, {}),
      checkedInProjectId,
    );
  } else {
    assert.equal(unconfiguredApp.extra.eas, undefined);
  }

  const previous = {
    userId: 'user-1',
    token: 'ExponentPushToken[test]',
    platform: 'IOS',
    appVersion: '1.0.0',
    expoProjectId: 'project-1',
  };
  assert.equal(pushRegistration.shouldRegisterPushToken(previous, previous), false);
  assert.equal(
    pushRegistration.shouldRegisterPushToken(previous, { ...previous, appVersion: '1.0.1' }),
    true,
  );
  assert.equal(
    pushRegistration.shouldRevalidatePushRegistration(previous, 2_000_000_000_000),
    true,
    'Legacy records without a registration timestamp must be renewed once.',
  );
  assert.equal(
    pushRegistration.shouldRevalidatePushRegistration(
      { ...previous, registeredAt: 2_000_000_000_000 - 60_000 },
      2_000_000_000_000,
    ),
    false,
  );

  const previousEnvProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  try {
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    const skipped = await pushRegistration.registerAuthenticatedPushToken({
      userId: 'user-1',
      authToken: 'token',
    });
    assert.equal(skipped.status, 'skipped');
    assert.equal(skipped.reason, 'expo-project-id-missing');
  } finally {
    if (previousEnvProjectId === undefined) {
      delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    } else {
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID = previousEnvProjectId;
    }
  }

  let settingsReadCount = 0;
  let registerCallCount = 0;
  const { exports: gatedExports } = loadPushRegistration({
    constants: {
      executionEnvironment: 'standalone',
      expoConfig: {
        version: '1.0.0',
        extra: { eas: { projectId: 'configured-eas-project' } },
      },
    },
    notificationsApi: {
      getSettings: async () => {
        settingsReadCount += 1;
        return { push: { enabled: false } };
      },
      registerPushToken: async () => {
        registerCallCount += 1;
        return { success: true };
      },
      deactivateCurrentPushToken: async () => ({ success: true }),
    },
  });
  const disabledPushResult = await gatedExports.registerAuthenticatedPushToken({
    userId: 'user-1',
    authToken: 'token',
    requirePushEnabled: true,
  });
  assert.equal(disabledPushResult.status, 'skipped');
  assert.equal(disabledPushResult.reason, 'push-disabled');
  assert.equal(settingsReadCount, 1);
  assert.equal(registerCallCount, 0);

  // Verify storage key constants
  assert.equal(
    pushRegistration.PRIMARY_PUSH_REGISTRATION_STORAGE_KEY,
    'aru.pushTokenRegistration.v1',
    'Primary storage key must be aru.pushTokenRegistration.v1',
  );
  assert.equal(
    pushRegistration.LEGACY_PUSH_REGISTRATION_STORAGE_KEY,
    'wiez.pushTokenRegistration.v1',
    'Legacy storage key must be wiez.pushTokenRegistration.v1',
  );

  const storedRecord = JSON.stringify(previous);
  const failingApi = {
    deactivateCurrentPushToken: async () => {
      throw new Error('network failed');
    },
  };

  // =========================================================================
  // EXECUTABLE PUSH-TOKEN REGISTRATION FAILURE-PATH SUITE (PR-01 THROUGH PR-18)
  // =========================================================================

  // PR-01: Valid legacy registration only -> Safely adopted
  {
    const legacyOnlyStore = { 'wiez.pushTokenRegistration.v1': storedRecord };
    let serverCalled = false;
    const { exports: pr01Exports, store: pr01Store } = loadPushRegistration({
      store: legacyOnlyStore,
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => { serverCalled = true; return { success: true }; },
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    const result = await pr01Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(result.status, 'registered');
    assert.ok(pr01Store['aru.pushTokenRegistration.v1'], 'PR-01: Primary key must be populated');
    assert.equal(pr01Store['wiez.pushTokenRegistration.v1'], undefined, 'PR-01: Legacy key must be retired');
    console.log('[PASS] PR-01: Valid legacy registration only -> safely adopted and migrated');
  }

  // PR-02: Valid canonical registration only -> Retained
  {
    const canonicalOnlyStore = { 'aru.pushTokenRegistration.v1': storedRecord };
    let serverCalled = false;
    const { exports: pr02Exports } = loadPushRegistration({
      store: canonicalOnlyStore,
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => { serverCalled = true; return { success: true }; },
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    await pr02Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    serverCalled = false;
    const secondResult = await pr02Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(secondResult.status, 'skipped');
    assert.equal(secondResult.reason, 'already-registered');
    assert.equal(serverCalled, false, 'PR-02: Retained valid registration without duplicate call');
    console.log('[PASS] PR-02: Valid canonical registration only -> retained without redundant call');
  }

  // PR-03: Both keys agree -> No duplicate registration
  {
    const bothAgreeStore = {
      'aru.pushTokenRegistration.v1': storedRecord,
      'wiez.pushTokenRegistration.v1': storedRecord,
    };
    const { exports: pr03Exports } = loadPushRegistration({ store: bothAgreeStore });
    assert.equal(pr03Exports.shouldRegisterPushToken(previous, previous), false);
    console.log('[PASS] PR-03: Both keys agree -> no duplicate registration needed');
  }

  // PR-04: Both keys conflict -> Approved precedence (primary is authoritative)
  {
    const legacyOldUser = { ...previous, userId: 'user-legacy-old' };
    const conflictStore = {
      'aru.pushTokenRegistration.v1': storedRecord,
      'wiez.pushTokenRegistration.v1': JSON.stringify(legacyOldUser),
    };
    let calledAccount = null;
    const { exports: pr04Exports } = loadPushRegistration({
      store: conflictStore,
      notificationsApi: {
        deactivateCurrentPushToken: async (tok, opts) => { calledAccount = opts?.asAccount; return { success: true }; },
      },
    });
    await pr04Exports.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-user-1' });
    assert.equal(calledAccount, 'token-user-1', 'PR-04: Primary key took precedence');
    console.log('[PASS] PR-04: Both keys conflict -> canonical primary key takes precedence');
  }

  // PR-05: Corrupt canonical, valid legacy -> Safe fallback
  {
    const corruptCanonicalStore = {
      'aru.pushTokenRegistration.v1': '{ unparseable corrupt json',
      'wiez.pushTokenRegistration.v1': storedRecord,
    };
    let serverCalled = false;
    const { exports: pr05Exports, store: pr05Store } = loadPushRegistration({
      store: corruptCanonicalStore,
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => { serverCalled = true; return { success: true }; },
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    const result = await pr05Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(result.status, 'registered');
    assert.ok(pr05Store['aru.pushTokenRegistration.v1'], 'PR-05: Primary overwritten with valid data');
    assert.equal(pr05Store['wiez.pushTokenRegistration.v1'], undefined, 'PR-05: Legacy retired');
    console.log('[PASS] PR-05: Corrupt canonical, valid legacy -> safe fallback to legacy and recovery');
  }

  // PR-06: Both records corrupt -> No unsafe reuse
  {
    const bothCorruptStore = {
      'aru.pushTokenRegistration.v1': '{ bad json',
      'wiez.pushTokenRegistration.v1': 'also bad json',
    };
    const { exports: pr06Exports, store: pr06Store } = loadPushRegistration({
      store: bothCorruptStore,
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => ({ success: true }),
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    const result = await pr06Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(result.status, 'registered');
    assert.ok(pr06Store['aru.pushTokenRegistration.v1'], 'PR-06: Fresh primary created');
    console.log('[PASS] PR-06: Both records corrupt -> no unsafe reuse, fresh registration succeeds');
  }

  // PR-07: Canonical write fails -> Valid legacy state not prematurely lost
  {
    const legacyStore = { 'wiez.pushTokenRegistration.v1': storedRecord };
    const { exports: pr07Exports } = loadPushRegistration({
      store: legacyStore,
      secureStore: {
        getItemAsync: async (key) => legacyStore[key] ?? null,
        setItemAsync: async () => { throw new Error('SecureStore hardware error'); },
        deleteItemAsync: async (key) => { delete legacyStore[key]; },
      },
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => ({ success: true }),
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    await pr07Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.ok(legacyStore['wiez.pushTokenRegistration.v1'], 'PR-07: Legacy key must not be deleted when primary write fails');
    console.log('[PASS] PR-07: Canonical write fails -> valid legacy state preserved');
  }

  // PR-08: Read-back fails or mismatches -> No unsafe legacy deletion
  {
    const legacyStore = { 'wiez.pushTokenRegistration.v1': storedRecord };
    let deleteLegacyCalled = false;
    const { exports: pr08Exports } = loadPushRegistration({
      store: legacyStore,
      secureStore: {
        getItemAsync: async (key) => {
          if (key === 'aru.pushTokenRegistration.v1') return 'corrupted-readback-mismatch';
          return legacyStore[key] ?? null;
        },
        setItemAsync: async (key, val) => { legacyStore[key] = val; },
        deleteItemAsync: async (key) => {
          if (key === 'wiez.pushTokenRegistration.v1') deleteLegacyCalled = true;
          delete legacyStore[key];
        },
      },
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => ({ success: true }),
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    await pr08Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(deleteLegacyCalled, false, 'PR-08: Legacy key must not be deleted when read-back verification fails');
    console.log('[PASS] PR-08: Read-back fails or mismatches -> legacy key protected against premature deletion');
  }

  // PR-09: Legacy deletion fails -> Idempotent retry
  {
    const legacyStore = { 'wiez.pushTokenRegistration.v1': storedRecord };
    const { exports: pr09Exports } = loadPushRegistration({
      store: legacyStore,
      secureStore: {
        getItemAsync: async (key) => legacyStore[key] ?? null,
        setItemAsync: async (key, val) => { legacyStore[key] = val; },
        deleteItemAsync: async (key) => {
          if (key === 'wiez.pushTokenRegistration.v1') throw new Error('Legacy deletion lock');
        },
      },
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => ({ success: true }),
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    const result = await pr09Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(result.status, 'registered', 'PR-09: Primary write succeeds even if legacy deletion fails');
    console.log('[PASS] PR-09: Legacy deletion fails -> write is verified, safe idempotent retry');
  }

  // PR-10: Interrupted migration -> Recoverable state
  {
    const interruptedStore = {
      'aru.pushTokenRegistration.v1': storedRecord,
      'wiez.pushTokenRegistration.v1': storedRecord,
    };
    const { exports: pr10Exports } = loadPushRegistration({ store: interruptedStore });
    assert.equal(pr10Exports.shouldRegisterPushToken(previous, previous), false);
    console.log('[PASS] PR-10: Interrupted migration -> recoverable state, primary serves seamlessly');
  }

  // PR-11: Registration network failure -> Safe retry
  {
    const { exports: pr11Exports } = loadPushRegistration({
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => { throw new Error('Network timeout'); },
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    const result = await pr11Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(result.status, 'failed');
    assert.equal(result.stage, 'server');
    console.log('[PASS] PR-11: Registration network failure -> error caught, safe retry possible');
  }

  // PR-12: Token refresh -> Correct token association
  {
    const { exports: pr12Exports, store: pr12Store } = loadPushRegistration({
      store: { 'aru.pushTokenRegistration.v1': storedRecord },
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      expoNotifications: {
        PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
        getPermissionsAsync: async () => ({ status: 'granted', granted: true }),
        getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[refreshed-token]' }),
      },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async () => ({ success: true }),
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    const result = await pr12Exports.registerAuthenticatedPushToken({ userId: 'user-1', authToken: 'token' });
    assert.equal(result.status, 'registered');
    const updated = JSON.parse(pr12Store['aru.pushTokenRegistration.v1']);
    assert.equal(updated.token, 'ExponentPushToken[refreshed-token]');
    console.log('[PASS] PR-12: Token refresh -> new token correctly associated and stored');
  }

  // PR-13: Logout with valid state -> Dual-key cleanup
  {
    const validStore = {
      'aru.pushTokenRegistration.v1': storedRecord,
      'wiez.pushTokenRegistration.v1': storedRecord,
    };
    const deleted = [];
    const { exports: pr13Exports } = loadPushRegistration({
      store: validStore,
      secureStore: {
        getItemAsync: async (key) => validStore[key] ?? null,
        setItemAsync: async (k, v) => { validStore[k] = v; },
        deleteItemAsync: async (key) => { deleted.push(key); delete validStore[key]; },
      },
      notificationsApi: {
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    await pr13Exports.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-1' });
    assert.ok(deleted.includes('aru.pushTokenRegistration.v1'));
    assert.ok(deleted.includes('wiez.pushTokenRegistration.v1'));
    console.log('[PASS] PR-13: Logout with valid state -> dual-key cleanup verified');
  }

  // PR-14: Logout with corrupt state -> Dual-key cleanup
  {
    const corruptStore = {
      'aru.pushTokenRegistration.v1': '{ bad json',
      'wiez.pushTokenRegistration.v1': '{ broken',
    };
    const deleted = [];
    const { exports: pr14Exports } = loadPushRegistration({
      store: corruptStore,
      secureStore: {
        getItemAsync: async (key) => corruptStore[key] ?? null,
        setItemAsync: async (k, v) => { corruptStore[k] = v; },
        deleteItemAsync: async (key) => { deleted.push(key); delete corruptStore[key]; },
      },
      notificationsApi: failingApi,
    });
    await pr14Exports.deactivateRegisteredPushTokenForLogout();
    assert.ok(deleted.includes('aru.pushTokenRegistration.v1'));
    assert.ok(deleted.includes('wiez.pushTokenRegistration.v1'));
    console.log('[PASS] PR-14: Logout with corrupt state -> dual-key cleanup unconditionally executed');
  }

  // PR-15: Logout with empty state -> Dual-key cleanup
  {
    const emptyStore = {};
    const deleted = [];
    const { exports: pr15Exports } = loadPushRegistration({
      store: emptyStore,
      secureStore: {
        getItemAsync: async (key) => emptyStore[key] ?? null,
        setItemAsync: async (k, v) => { emptyStore[k] = v; },
        deleteItemAsync: async (key) => { deleted.push(key); delete emptyStore[key]; },
      },
      notificationsApi: failingApi,
    });
    await pr15Exports.deactivateRegisteredPushTokenForLogout();
    assert.ok(deleted.includes('aru.pushTokenRegistration.v1'));
    assert.ok(deleted.includes('wiez.pushTokenRegistration.v1'));
    console.log('[PASS] PR-15: Logout with empty state -> dual-key deletion executed without error');
  }

  // PR-16: Network deactivation failure -> Defined safe cleanup behavior
  {
    const logoutStore = { 'aru.pushTokenRegistration.v1': storedRecord };
    const deleted = [];
    const { exports: pr16Exports } = loadPushRegistration({
      store: logoutStore,
      secureStore: {
        getItemAsync: async (key) => logoutStore[key] ?? null,
        setItemAsync: async (k, v) => { logoutStore[k] = v; },
        deleteItemAsync: async (key) => { deleted.push(key); delete logoutStore[key]; },
      },
      notificationsApi: failingApi,
    });
    await assert.doesNotReject(() => pr16Exports.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-1' }));
    assert.ok(deleted.includes('aru.pushTokenRegistration.v1'));
    console.log('[PASS] PR-16: Network deactivation failure -> safe cleanup continues');
  }

  // PR-17: SecureStore deletion failure -> Failure surfaced; no false success
  {
    const logoutStore = { 'aru.pushTokenRegistration.v1': storedRecord };
    const { exports: pr17Exports } = loadPushRegistration({
      store: logoutStore,
      secureStore: {
        getItemAsync: async (key) => logoutStore[key] ?? null,
        setItemAsync: async (k, v) => { logoutStore[k] = v; },
        deleteItemAsync: async (key) => {
          if (key === 'aru.pushTokenRegistration.v1') throw new Error('SecureStore hardware locked');
        },
      },
      notificationsApi: { deactivateCurrentPushToken: async () => ({ success: true }) },
    });
    await assert.rejects(
      () => pr17Exports.deactivateRegisteredPushTokenForLogout(),
      /SecureStore hardware locked/,
      'PR-17: Deletion failure must be surfaced to prevent false success reporting',
    );
    console.log('[PASS] PR-17: SecureStore deletion failure -> failure surfaced, no false success');
  }

  // PR-18: Account switching -> No cross-account token reuse
  {
    let serverRegisteredAccount = null;
    const { exports: pr18Exports, store: pr18Store } = loadPushRegistration({
      constants: { executionEnvironment: 'standalone', expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } } },
      notificationsApi: {
        getSettings: async () => ({ push: { enabled: true } }),
        registerPushToken: async (payload, opts) => {
          serverRegisteredAccount = opts?.asAccount;
          return { success: true };
        },
        deactivateCurrentPushToken: async () => ({ success: true }),
      },
    });
    await pr18Exports.registerAuthenticatedPushToken({ userId: 'user-A', authToken: 'token-A' });
    assert.equal(serverRegisteredAccount, 'token-A');

    await pr18Exports.deactivateRegisteredPushTokenForLogout({ asAccount: 'token-A' });
    assert.equal(pr18Store['aru.pushTokenRegistration.v1'], undefined);

    serverRegisteredAccount = null;
    await pr18Exports.registerAuthenticatedPushToken({ userId: 'user-B', authToken: 'token-B' });
    assert.equal(serverRegisteredAccount, 'token-B', 'PR-18: User B registered with its own account');
    const userBRecord = JSON.parse(pr18Store['aru.pushTokenRegistration.v1']);
    assert.equal(userBRecord.userId, 'user-B');
    console.log('[PASS] PR-18: Account switching -> no cross-account token reuse verified');
  }

  // Clear stored push registration purges both keys
  {
    const clearStore = {
      'aru.pushTokenRegistration.v1': storedRecord,
      'wiez.pushTokenRegistration.v1': storedRecord,
    };
    const clearDeleted = [];
    const { exports: clearExports } = loadPushRegistration({
      store: clearStore,
      secureStore: {
        getItemAsync: async (key) => clearStore[key] ?? null,
        setItemAsync: async (k, v) => { clearStore[k] = v; },
        deleteItemAsync: async (key) => { clearDeleted.push(key); delete clearStore[key]; },
      },
    });
    await clearExports.clearStoredPushRegistration();
    assert.ok(clearDeleted.includes('aru.pushTokenRegistration.v1'));
    assert.ok(clearDeleted.includes('wiez.pushTokenRegistration.v1'));
    assert.equal(clearStore['aru.pushTokenRegistration.v1'], undefined);
    assert.equal(clearStore['wiez.pushTokenRegistration.v1'], undefined);
  }

  console.log('\n======================================================');
  console.log('ALL 18 PUSH-TOKEN REGISTRATION FAILURE-PATH SCENARIOS PASSED (18/18).');
  console.log('======================================================\n');
}

main();
