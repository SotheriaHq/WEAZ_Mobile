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
  // Destination pinned, helper not: `drillDownPush` replaced `router.push` to add
  // the navigation lock. The negative assertion still guards the wrong route.
  assert.match(pushRowBlock, /(?:router\.push|drillDownPush)\('\/settings\/notifications'/);
  assert.doesNotMatch(pushRowBlock, /(?:router\.push|drillDownPush)\('\/notifications'/);

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

  // Overview + one screen per section. The wiring moved out of the old single
  // screen into the shared hooks and parts; pin it where it lives now.
  const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const settingsHook = read('src/notifications/useNotificationSettings.ts');
  const deviceHook = read('src/notifications/useNotificationDevice.ts');
  const parts = read('components/settings/notifications/NotificationSettingsParts.tsx');
  const overview = fs.readFileSync(settingsRoutePath, 'utf8');
  const sectionScreenPath = path.join(repoRoot, 'app', 'settings', 'notifications', '[section].tsx');
  assert.equal(fs.existsSync(sectionScreenPath), true, 'each section has its own screen');
  const sectionScreen = fs.readFileSync(sectionScreenPath, 'utf8');

  assert.match(settingsHook, /NotificationsApi\.getSettings\(\)/);
  assert.match(settingsHook, /NotificationsApi\.updateSettings\(/);
  assert.match(settingsHook, /buildNotificationSettingsPatch\(patch\.section,\s*patch\.key,\s*patch\.value\)/);
  assert.match(settingsHook, /queryKeys\.notifications\.settings\(userId\)/, 'one shared copy for overview and sections');
  assert.match(deviceHook, /registerAuthenticatedPushToken\(/);
  assert.match(deviceHook, /AppState\.addEventListener\('change'/, 'device recovery: re-checks on return from phone settings');
  assert.match(parts, /Notifications are enabled in WIEZ, but disabled at device level\./);
  assert.match(overview, /useNotificationSettings\(\)/);
  assert.match(sectionScreen, /useNotificationSettings\(\)/);
  assert.match(overview, /router\.push\(notificationSectionHref\(section\.id\)/, 'rows open their section screen');
  assert.match(sectionScreen, /<Redirect href=\{NOTIFICATION_SECTION_ROUTE/, 'an unknown section goes back to the overview');
  for (const [name, source] of [['overview', overview], ['section', sectionScreen]]) {
    assert.match(
      source,
      /paddingBottom: insets\.bottom \+ tokens\.spacing\['2xl'\]/,
      `${name}: the last row clears the home indicator`,
    );
  }
  // Accessibility: rows announce what they are and where they stand.
  assert.match(parts, /accessibilityRole="switch"/);
  assert.match(parts, /accessibilityHint=\{item\.description\}/);
  assert.match(parts, /accessibilityLabel=\{`\$\{title\}, \$\{summary\}`\}/);
  assert.match(parts, /accessibilityLiveRegion="polite"/, 'a failed save is announced');

  await checkSections();
  await checkSaveQueue();

  console.log('Notification settings contract tests passed.');
}

/* ---- behaviour: sections and summaries ---------------------------------- */

function loadTs(relative, requireMap = {}) {
  const filePath = path.join(repoRoot, relative);
  const module = { exports: {} };
  vm.runInNewContext(compile(filePath), {
    module,
    exports: module.exports,
    require: (request) => (request in requireMap ? requireMap[request] : require(request)),
    setTimeout,
    Promise,
  }, { filename: filePath });
  return module.exports;
}

function baseSettings() {
  const on = (keys) => Object.fromEntries(keys.map((key) => [key, true]));
  return {
    security: on(['login', 'logout']),
    push: { enabled: true, sound: true, vibration: true, showPreview: true, quietHoursEnabled: false, quietHoursStart: null, quietHoursEnd: null },
    social: on(['threads', 'follows', 'patches']),
    comments: { ...on(['enabled', 'replies']), fromUnpatchedUsers: false },
    tags: { mentions: true, fromUnpatchedUsers: false },
    collections: on(['lifecycle', 'access']),
    brand: on(['patchRequests', 'contributions', 'verificationPrompts']),
    orders: on(['placed', 'statusChanges']),
    reviews: on(['reminders', 'replies', 'moderation']),
    fit: on(['reminders', 'shares', 'approvals']),
    messaging: on(['newMessages', 'reminders', 'moderation', 'desktop', 'sound', 'readReceipts', 'deliveryReceipts']),
  };
}

async function checkSections() {
  const sections = loadTs('src/notifications/notificationSections.ts');
  const settings = baseSettings();
  // Array.from builds the array in THIS realm; vm-made arrays carry another
  // realm's prototype and never deep-equal a literal.
  const ids = (list) => Array.from(list, (section) => section.id);

  assert.deepEqual(ids(sections.visibleNotificationSections(settings)), ['alerts', 'quiet-hours', 'device', 'activity', 'commerce', 'messaging']);
  assert.deepEqual(
    ids(sections.visibleNotificationSections({ push: { ...settings.push, enabled: false } })),
    ['activity', 'commerce', 'messaging'],
    'push off: only the topics remain — they still govern the inbox',
  );

  const activity = sections.getNotificationSection('activity');
  assert.equal(sections.summarizeNotificationSection(activity, settings), 'All on');
  const partly = { ...settings, social: { ...settings.social, threads: false } };
  assert.equal(sections.summarizeNotificationSection(activity, partly), '5 of 6 on');

  const quiet = sections.getNotificationSection('quiet-hours');
  assert.equal(sections.summarizeNotificationSection(quiet, settings), 'Off');
  const quietOn = { ...settings, push: { ...settings.push, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' } };
  assert.equal(sections.summarizeNotificationSection(quiet, quietOn), '22:00 – 07:00');

  const device = sections.getNotificationSection('device');
  assert.equal(sections.summarizeNotificationSection(device, settings, { permission: 'denied', phone: 'ready', server: 'saved' }), 'Off in phone settings');
  assert.equal(sections.summarizeNotificationSection(device, settings, { permission: 'granted', phone: 'ready', server: 'saved' }), 'Ready');
  assert.equal(sections.summarizeNotificationSection(device, settings, { permission: 'granted', phone: 'failed', server: 'waiting' }), 'Needs attention');

  assert.equal(sections.getNotificationSection('nope'), null);
  assert.equal(sections.getNotificationSection(undefined), null);
}

/* ---- behaviour: the save queue ------------------------------------------ */

async function checkSaveQueue() {
  const { QueryClient } = require('@tanstack/react-query');
  const settingsHelpers = loadTs('src/notifications/notificationSettings.ts');
  const queryKeysModule = loadTs('src/query/queryKeys.ts');

  // A server we answer by hand, in the order we choose.
  let serverState = baseSettings();
  const waiting = [];
  const api = {
    getSettings: async () => serverState,
    updateSettings: (body) => new Promise((resolve, reject) => waiting.push({ body, resolve, reject })),
  };
  const answerNext = (fail = false) => {
    const call = waiting.shift();
    if (fail) return call.reject(new Error('Network down'));
    for (const [section, values] of Object.entries(call.body)) {
      serverState = { ...serverState, [section]: { ...serverState[section], ...values } };
    }
    call.resolve(serverState);
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const hook = loadTs('src/notifications/useNotificationSettings.ts', {
    react: require('react'),
    '@tanstack/react-query': require('@tanstack/react-query'),
    '@/src/api/NotificationsApi': { NotificationsApi: api },
    '@/src/auth/AuthContext': { useAuth: () => ({ status: 'authenticated', user: { id: 'user_1' } }) },
    '@/src/notifications/notificationSettings': settingsHelpers,
    '@/src/query/queryKeys': queryKeysModule,
  });
  hook.resetNotificationSettingsSaves();
  hook.__testing.setActiveUser('user_1');

  const client = new QueryClient();
  const key = queryKeysModule.queryKeys.notifications.settings('user_1');
  client.setQueryData(key, serverState);
  const read = () => client.getQueryData(key);

  // Two quick taps: threads off, then replies off.
  const first = hook.__testing.savePatch(client, 'user_1', { section: 'social', key: 'threads', value: false });
  const second = hook.__testing.savePatch(client, 'user_1', { section: 'comments', key: 'replies', value: false });
  assert.equal(read().social.threads, false, 'the switch moves at once');
  assert.equal(read().comments.replies, false);

  await flush();
  assert.equal(waiting.length, 1, 'saves go one at a time');
  answerNext(); // threads saved; the server does not know about replies yet
  await first;
  assert.equal(read().comments.replies, false, 'an earlier answer never flips a later switch back');
  await flush();
  answerNext();
  await second;
  assert.equal(read().social.threads, false);
  assert.equal(read().comments.replies, false);

  // A failure undoes only its own switch.
  const failing = hook.__testing.savePatch(client, 'user_1', { section: 'tags', key: 'mentions', value: false });
  const after = hook.__testing.savePatch(client, 'user_1', { section: 'orders', key: 'placed', value: false });
  await flush();
  answerNext(true);
  assert.equal(await failing, false);
  assert.equal(read().tags.mentions, true, 'the failed switch returns to what the server holds');
  assert.equal(read().orders.placed, false, 'the waiting switch keeps its new value');
  await flush();
  answerNext();
  assert.equal(await after, true);
  assert.equal(read().orders.placed, false);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
