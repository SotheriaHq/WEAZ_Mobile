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
        return {
          getItemAsync: async (key) => store[key] ?? null,
          setItemAsync: async (key, value) => {
            store[key] = value;
          },
          deleteItemAsync: async (key) => {
            deletedKeys.push(key);
            delete store[key];
          },
        };
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

  // Test: Logout dual-key purge (even if API deactivation fails)
  const { exports: logoutExports, deletedKeys, store: logoutStore } = loadPushRegistration({
    store: {
      'wiez.pushTokenRegistration.v1': storedRecord,
      'aru.pushTokenRegistration.v1': storedRecord,
    },
    notificationsApi: failingApi,
  });
  await assert.doesNotReject(() => logoutExports.deactivateRegisteredPushTokenForLogout());
  assert.ok(deletedKeys.includes('aru.pushTokenRegistration.v1'), 'Must delete primary key on logout');
  assert.ok(deletedKeys.includes('wiez.pushTokenRegistration.v1'), 'Must delete legacy key on logout');
  assert.equal(logoutStore['aru.pushTokenRegistration.v1'], undefined);
  assert.equal(logoutStore['wiez.pushTokenRegistration.v1'], undefined);

  // Test: Legacy fallback and opportunistic migration on read
  const legacyStore = { 'wiez.pushTokenRegistration.v1': storedRecord };
  let apiRegistered = false;
  const { exports: migrationExports, store: migratedStore } = loadPushRegistration({
    store: legacyStore,
    constants: {
      executionEnvironment: 'standalone',
      expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'configured-eas-project' } } },
    },
    notificationsApi: {
      getSettings: async () => ({ push: { enabled: true } }),
      registerPushToken: async () => {
        apiRegistered = true;
        return { success: true };
      },
      deactivateCurrentPushToken: async () => ({ success: true }),
    },
  });
  // Logout with only legacy present should delete both keys
  const { exports: legacyLogoutExports, deletedKeys: legacyDeleted } = loadPushRegistration({
    store: { 'wiez.pushTokenRegistration.v1': storedRecord },
    notificationsApi: failingApi,
  });
  await legacyLogoutExports.deactivateRegisteredPushTokenForLogout();
  assert.ok(legacyDeleted.includes('aru.pushTokenRegistration.v1'));
  assert.ok(legacyDeleted.includes('wiez.pushTokenRegistration.v1'));

  // Test: clearStoredPushRegistration purges both keys
  const { exports: clearExports, deletedKeys: clearDeleted, store: clearStore } = loadPushRegistration({
    store: {
      'aru.pushTokenRegistration.v1': storedRecord,
      'wiez.pushTokenRegistration.v1': storedRecord,
    },
  });
  await clearExports.clearStoredPushRegistration();
  assert.ok(clearDeleted.includes('aru.pushTokenRegistration.v1'));
  assert.ok(clearDeleted.includes('wiez.pushTokenRegistration.v1'));
  assert.equal(clearStore['aru.pushTokenRegistration.v1'], undefined);
  assert.equal(clearStore['wiez.pushTokenRegistration.v1'], undefined);

  // Test: Opportunistic migration on registration write
  const oppInitialStore = { 'wiez.pushTokenRegistration.v1': storedRecord };
  let oppServerCalled = false;
  const { exports: oppExports, store: oppStore } = loadPushRegistration({
    store: oppInitialStore,
    constants: {
      executionEnvironment: 'standalone',
      expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'project-1' } } },
    },
    notificationsApi: {
      getSettings: async () => ({ push: { enabled: true } }),
      registerPushToken: async () => {
        oppServerCalled = true;
        return { success: true };
      },
      deactivateCurrentPushToken: async () => ({ success: true }),
    },
  });
  const regResult = await oppExports.registerAuthenticatedPushToken({
    userId: 'user-1',
    authToken: 'token',
  });
  assert.equal(oppServerCalled, true, 'Server registration is called to establish token');
  assert.equal(regResult.status, 'registered');
  // Primary key should now be written and legacy retired
  assert.ok(oppStore['aru.pushTokenRegistration.v1'], 'Primary key must be populated after migration');
  assert.equal(oppStore['wiez.pushTokenRegistration.v1'], undefined, 'Legacy key must be deleted after verified migration');

  console.log('Push token registration contract tests passed.');
}

main();
