const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
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
      return require(request);
    },
    console,
    process,
    __DEV__: false,
  };

  vm.runInNewContext(compile(pushRegistrationPath), sandbox, { filename: pushRegistrationPath });
  return { exports: module.exports, store, deletedKeys };
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

  const skipped = await pushRegistration.registerAuthenticatedPushToken({
    userId: 'user-1',
    authToken: 'token',
  });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.reason, 'expo-project-id-missing');

  const storedRecord = JSON.stringify(previous);
  const failingApi = {
    deactivateCurrentPushToken: async () => {
      throw new Error('network failed');
    },
  };
  const { exports: logoutExports, deletedKeys } = loadPushRegistration({
    store: { 'threadly.pushTokenRegistration.v1': storedRecord },
    notificationsApi: failingApi,
  });
  await assert.doesNotReject(() => logoutExports.deactivateRegisteredPushTokenForLogout());
  assert.deepEqual(deletedKeys, ['threadly.pushTokenRegistration.v1']);

  console.log('Push token registration contract tests passed.');
}

main();
