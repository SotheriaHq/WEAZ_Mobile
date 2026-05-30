const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const sessionCleanupPath = path.join(repoRoot, 'src', 'auth', 'sessionCleanup.ts');
const authContextPath = path.join(repoRoot, 'src', 'auth', 'AuthContext.tsx');
const feedApiPath = path.join(repoRoot, 'src', 'features', 'feed', 'api', 'feedApi.ts');
const feedKeysPath = path.join(repoRoot, 'src', 'features', 'feed', 'utils', 'feedKeys.ts');
const imageUriPath = path.join(repoRoot, 'src', 'hooks', 'useResolvedImageUri.ts');
const notificationRealtimePath = path.join(repoRoot, 'src', 'realtime', 'notifications.ts');
const messagingRealtimePath = path.join(repoRoot, 'src', 'realtime', 'messaging.ts');

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

function loadSessionCleanup(options = {}) {
  const calls = {
    setAuthToken: [],
    setRefreshToken: [],
    secureDelete: [],
    removeAccessToken: 0,
    removeRefreshToken: 0,
    purgePersistedQueryCache: 0,
    clearFeedCache: 0,
    clearBrandApi: 0,
    clearImageUri: 0,
    clearMessagingRealtime: 0,
    clearNotificationRealtime: 0,
    clearMarketSignalQueue: 0,
    deactivatePushToken: 0,
    asyncStorageGetAllKeys: 0,
    asyncStorageMultiRemove: [],
    queryCancel: [],
    queryRemove: [],
  };

  const asyncStorageKeys = [
    'THREADLY_QUERY_CACHE_V1',
    'threadly.feed.market:api:user-1:all',
    'THREADLY_USER',
    'public.catalog.cache',
  ];

  const client = options.client ?? {
    cancelQueries: (arg) => calls.queryCancel.push(arg),
    removeQueries: (arg) => calls.queryRemove.push(arg),
  };

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '@react-native-async-storage/async-storage') {
        return {
          __esModule: true,
          default: {
            getAllKeys: async () => {
              calls.asyncStorageGetAllKeys += 1;
              return asyncStorageKeys;
            },
            multiRemove: async (keys) => {
              calls.asyncStorageMultiRemove.push(keys);
            },
          },
        };
      }
      if (request === 'expo-secure-store') {
        return {
          deleteItemAsync: async (key) => {
            calls.secureDelete.push(key);
          },
        };
      }
      if (request === '@/src/api/BrandApi') {
        return { clearBrandApiSessionCaches: () => calls.clearBrandApi++ };
      }
      if (request === '@/src/api/httpClient') {
        return {
          setApiAuthToken: (value) => calls.setAuthToken.push(value),
          setApiRefreshToken: (value) => calls.setRefreshToken.push(value),
        };
      }
      if (request === '@/src/config/env') {
        return {
          env: {
            userStorageKey: 'THREADLY_USER',
            tokenStorageKey: 'THREADLY_ACCESS_TOKEN',
            refreshTokenStorageKey: 'THREADLY_REFRESH_TOKEN',
          },
        };
      }
      if (request === '@/src/features/feed/api/feedApi') {
        return { clearCachedMarketFeed: async () => calls.clearFeedCache++ };
      }
      if (request === '@/src/features/feed/utils/feedKeys') {
        return { PERSISTED_FEED_CACHE_PREFIX: 'threadly.feed.' };
      }
      if (request === '@/src/hooks/useResolvedImageUri') {
        return { clearResolvedImageUriCache: () => calls.clearImageUri++ };
      }
      if (request === '@/src/notifications/pushTokenRegistration') {
        return {
          deactivateRegisteredPushTokenForLogout: async () => {
            calls.deactivatePushToken += 1;
            throw new Error('network failed');
          },
        };
      }
      if (request === '@/src/query/queryClient') {
        return { queryClient: client };
      }
      if (request === '@/src/query/queryPersistor') {
        return {
          purgeMobilePersistedQueryCache: async () => calls.purgePersistedQueryCache++,
          THREADLY_QUERY_CACHE_STORAGE_KEY: 'THREADLY_QUERY_CACHE_V1',
        };
      }
      if (request === '@/src/query/queryKeys') {
        return {
          queryKeys: {
            auth: { profile: () => ['auth', 'profile'] },
            notifications: { unreadCount: () => ['notifications', 'unreadCount'] },
            messaging: { unreadCount: () => ['messaging', 'unreadCount'] },
          },
        };
      }
      if (request === '@/src/realtime/messaging') {
        return { clearMessagingRealtimeSession: () => calls.clearMessagingRealtime++ };
      }
      if (request === '@/src/realtime/notifications') {
        return { clearNotificationRealtimeSession: () => calls.clearNotificationRealtime++ };
      }
      if (request === '@/src/services/marketSignals') {
        return { clearMobileMarketSignalQueue: async () => calls.clearMarketSignalQueue++ };
      }
      if (request === '@/src/storage/secureStorage') {
        return {
          removeAccessToken: async () => calls.removeAccessToken++,
          removeRefreshToken: async () => calls.removeRefreshToken++,
        };
      }
      return require(request);
    },
    console,
    Promise,
    Set,
  };

  vm.runInNewContext(compile(sessionCleanupPath), sandbox, { filename: sessionCleanupPath });
  return { exports: module.exports, calls, client };
}

async function main() {
  const { exports: cleanup, calls } = loadSessionCleanup();

  assert.equal(cleanup.isMobilePrivateSessionQueryKey(['auth', 'profile']), true);
  assert.equal(cleanup.isMobilePrivateSessionQueryKey(['media', 'signedUrl', 'file-1']), true);
  assert.equal(cleanup.isMobilePrivateSessionQueryKey(['media', 'publicUrl', 'file-1']), false);
  assert.equal(cleanup.isMobilePrivateSessionQueryKey(['config', 'uploadLimits']), false);

  await assert.doesNotReject(() => cleanup.clearMobilePrivateSessionState());

  assert.deepEqual(calls.setAuthToken, [null]);
  assert.deepEqual(calls.setRefreshToken, [null]);
  assert.equal(calls.deactivatePushToken, 1, 'logout should try push-token deactivation');
  assert.equal(calls.removeAccessToken, 1, 'logout should remove SecureStore access token');
  assert.equal(calls.removeRefreshToken, 1, 'logout should remove SecureStore refresh token');
  assert.ok(calls.secureDelete.includes('threadly.activeBrandId'), 'logout should clear active brand');
  assert.ok(calls.secureDelete.includes('threadly.pendingBagAction.v1'), 'logout should clear pending bag action');
  assert.ok(calls.secureDelete.includes('THREADLY_USER'), 'logout should clear stored user profile');
  assert.equal(calls.purgePersistedQueryCache, 1, 'logout should purge persisted React Query cache');
  assert.equal(calls.clearFeedCache, 1, 'logout should clear feed cache');
  assert.equal(calls.clearBrandApi, 1, 'logout should clear signed URL/brand API caches');
  assert.equal(calls.clearImageUri, 1, 'logout should clear resolved image URI cache');
  assert.equal(calls.clearMessagingRealtime, 1, 'logout should disconnect messaging realtime');
  assert.equal(calls.clearNotificationRealtime, 1, 'logout should disconnect notification realtime');
  assert.equal(calls.clearMarketSignalQueue, 1, 'logout should clear persisted market signal queue');
  assert.equal(calls.asyncStorageGetAllKeys, 1);
  assert.deepEqual(calls.asyncStorageMultiRemove[0], [
    'THREADLY_QUERY_CACHE_V1',
    'threadly.feed.market:api:user-1:all',
    'THREADLY_USER',
  ]);
  assert.ok(calls.queryCancel.some((entry) => typeof entry.predicate === 'function'));
  assert.ok(calls.queryRemove.some((entry) => typeof entry.predicate === 'function'));

  const skipPush = loadSessionCleanup();
  await skipPush.exports.clearMobilePrivateSessionState({ deactivatePushToken: false });
  assert.equal(skipPush.calls.deactivatePushToken, 0, 'no-session bootstrap should skip push deactivation');

  const authContextSource = fs.readFileSync(authContextPath, 'utf8');
  assert.match(authContextSource, /clearMobilePrivateSessionState\(\{\s*client:\s*queryClient\s*\}\)/);
  assert.match(authContextSource, /deactivatePushToken:\s*false/);
  assert.doesNotMatch(authContextSource, /removeAccessToken\(\)/);
  assert.doesNotMatch(authContextSource, /removeRefreshToken\(\)/);

  const feedApiSource = fs.readFileSync(feedApiPath, 'utf8');
  const feedKeysSource = fs.readFileSync(feedKeysPath, 'utf8');
  assert.match(feedKeysSource, /PERSISTED_FEED_CACHE_PREFIX\s*=\s*'threadly\.feed\.'/);
  assert.match(feedApiSource, /export const clearCachedMarketFeed/);
  assert.match(feedApiSource, /memoryCache\.clear\(\)/);
  assert.match(feedApiSource, /AsyncStorage\.getAllKeys\(\)/);
  assert.match(feedApiSource, /AsyncStorage\.multiRemove\(feedKeys\)/);

  assert.match(fs.readFileSync(imageUriPath, 'utf8'), /export const clearResolvedImageUriCache/);
  assert.match(fs.readFileSync(notificationRealtimePath, 'utf8'), /export function clearNotificationRealtimeSession/);
  assert.match(fs.readFileSync(messagingRealtimePath, 'utf8'), /export function clearMessagingRealtimeSession/);

  console.log('Session cleanup contract tests passed.');
}

main();
