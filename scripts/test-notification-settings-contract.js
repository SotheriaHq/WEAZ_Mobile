const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const settingsRoutePath = path.join(repoRoot, 'app', 'settings', 'notifications.tsx');
const settingsHomePath = path.join(repoRoot, 'app', 'settings.tsx');
const notificationsApiPath = path.join(repoRoot, 'src', 'api', 'NotificationsApi.ts');
const settingsTypesPath = path.join(repoRoot, 'src', 'notifications', 'notificationSettings.ts');

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

function loadNotificationSettingsModule() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
  };

  vm.runInNewContext(compile(settingsTypesPath), sandbox, { filename: settingsTypesPath });
  return module.exports;
}

function loadNotificationsApi() {
  const calls = {
    get: [],
    patch: [],
  };
  const mockSettings = {
    push: {
      enabled: true,
      sound: true,
      vibration: true,
      showPreview: true,
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    },
  };
  const apiClient = {
    get: async (url) => {
      calls.get.push(url);
      return { data: { data: mockSettings } };
    },
    patch: async (url, body) => {
      calls.patch.push({ url, body });
      return { data: { data: { ...mockSettings, ...body } } };
    },
    post: async () => ({ data: { data: { success: true } } }),
    delete: async () => ({ data: { data: { success: true } } }),
  };
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '@/src/api/httpClient') {
        return { apiClient };
      }
      return require(request);
    },
    URLSearchParams,
  };

  vm.runInNewContext(compile(notificationsApiPath), sandbox, { filename: notificationsApiPath });
  return { api: module.exports.NotificationsApi, calls };
}

async function main() {
  assert.equal(fs.existsSync(settingsRoutePath), true, 'app/settings/notifications.tsx must exist.');

  const settingsHomeSource = fs.readFileSync(settingsHomePath, 'utf8');
  const pushRowIndex = settingsHomeSource.indexOf("title: 'Push notifications'");
  assert.notEqual(pushRowIndex, -1, 'Settings home must keep a Push notifications row.');
  const pushRowBlock = settingsHomeSource.slice(pushRowIndex, pushRowIndex + 260);
  assert.match(pushRowBlock, /router\.push\('\/settings\/notifications'/);
  assert.doesNotMatch(pushRowBlock, /router\.push\('\/notifications'/);

  const typesSource = fs.readFileSync(settingsTypesPath, 'utf8');
  for (const section of [
    'security',
    'social',
    'comments',
    'tags',
    'collections',
    'brand',
    'orders',
    'reviews',
    'fit',
    'messaging',
    'push',
  ]) {
    assert.match(typesSource, new RegExp(`${section}:\\s*\\{`), `Missing ${section} settings section.`);
  }

  const settingsHelpers = loadNotificationSettingsModule();
  assert.equal(settingsHelpers.isValidQuietHour('00:00'), true);
  assert.equal(settingsHelpers.isValidQuietHour('22:30'), true);
  assert.equal(settingsHelpers.isValidQuietHour('23:59'), true);
  assert.equal(settingsHelpers.isValidQuietHour('24:00'), false);
  assert.equal(settingsHelpers.isValidQuietHour('7:00'), false);
  assert.equal(settingsHelpers.isValidQuietHour('12:60'), false);
  assert.equal(settingsHelpers.normalizeQuietHourInput(' 22:00 '), '22:00');
  assert.equal(settingsHelpers.normalizeQuietHourInput('   '), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(settingsHelpers.buildNotificationSettingsPatch('push', 'enabled', false))),
    { push: { enabled: false } },
  );

  const { api, calls } = loadNotificationsApi();
  assert.equal(typeof api.getSettings, 'function');
  assert.equal(typeof api.updateSettings, 'function');
  await api.getSettings();
  assert.equal(calls.get.at(-1), '/notifications/settings');
  await api.updateSettings({ push: { enabled: false } });
  assert.deepEqual(calls.patch.at(-1), {
    url: '/notifications/settings',
    body: { push: { enabled: false } },
  });

  const routeSource = fs.readFileSync(settingsRoutePath, 'utf8');
  assert.match(routeSource, /NotificationsApi\.getSettings\(\)/);
  assert.match(routeSource, /NotificationsApi\.updateSettings\(/);
  assert.match(routeSource, /buildNotificationSettingsPatch\(patch\.section,\s*patch\.key,\s*patch\.value\)/);
  assert.match(routeSource, /registerAuthenticatedPushToken\(/);
  assert.match(routeSource, /Notifications are enabled in Threadly, but disabled at device level\./);
  assert.match(routeSource, /isValidQuietHour/);

  console.log('Notification settings contract tests passed.');
}

main();
