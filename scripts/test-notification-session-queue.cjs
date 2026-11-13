const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { QueryClient } = require('@tanstack/react-query');
const native = path.resolve(__dirname, '..');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function load(root, relative, mocks = {}) {
  const file = path.join(root, relative), module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), setTimeout, Promise }, { filename: file });
  return module.exports;
}
async function check(root, prefix) {
  const helpers = load(root, 'src/notifications/notificationSettings.ts');
  const keys = load(root, 'src/query/queryKeys.ts', prefix === '@/' ? { '@/utils/uuid': load(root, 'src/utils/uuid.ts') } : {}).queryKeys;
  let actor = 'actor-a', scope = 1, identity = 'actor-a:session:1:User';
  const calls = [], waiting = [];
  let reads = 0; const readWaiting = [];
  const api = { getSettings: () => { reads++; return new Promise(resolve => readWaiting.push(resolve)); }, updateSettings: (body, config) => new Promise((resolve, reject) => { calls.push({ actor, body, config }); waiting.push({ resolve, reject, body }); }) };
  const stores = load(root, 'src/notifications/notificationSettingsStore.ts', {
    [prefix + 'api/NotificationsApi']: { NotificationsApi: api },
    [prefix + 'api/httpClient']: { getApiSecurityIdentity: () => identity, getApiSessionScope: () => scope },
    [prefix + 'notifications/notificationSettings']: helpers,
    [prefix + 'query/queryKeys']: { queryKeys: keys },
  });
  const client = new QueryClient();
  try {
    const key = keys.notifications.settings(actor);
    let confirmed = { social: { threads: true }, comments: { replies: true }, tags: { mentions: true } };
    client.setQueryData(key, confirmed);
    const store = stores.getNotificationSettingsStore(client, actor);
    const view = () => stores.layUnansweredSaves(client.getQueryData(key), store.snapshot().pending);
    const answer = () => { const next = waiting.shift(); for (const [section, values] of Object.entries(next.body)) confirmed = { ...confirmed, [section]: { ...confirmed[section], ...values } }; next.resolve(confirmed); };
    const first = store.save({ section: 'social', key: 'threads', value: false });
    const second = store.save({ section: 'comments', key: 'replies', value: false });
    assert.equal(view().comments.replies, false);
    await flush(); assert.equal(calls.length, 1, 'saves are serialized');
    answer(); await first; assert.equal(view().comments.replies, false, 'earlier response cannot undo queued edit');
    await flush(); answer(); assert.equal(await second, true);
    const failing = store.save({ section: 'tags', key: 'mentions', value: false });
    const later = store.save({ section: 'social', key: 'threads', value: true });
    await flush(); waiting.shift().reject(new Error('Offline')); assert.equal(await failing, false);
    assert.equal(view().tags.mentions, true); assert.equal(view().social.threads, true);
    await flush(); answer(); await later;
    store.retry(); await flush(); assert.equal(waiting.length, 1); answer(); await flush();
    assert.equal(store.snapshot().failed, null);
    // A same-session refresh changes neither identity nor generation.
    assert.equal(stores.getNotificationSettingsStore(client, actor), store);
    const pending = store.save({ section: 'social', key: 'threads', value: false });
    const queued = store.save({ section: 'comments', key: 'replies', value: true });
    await flush(); const count = calls.length;
    actor = 'actor-b'; identity = 'actor-b:session:1:User'; scope++;
    const other = stores.getNotificationSettingsStore(client, actor);
    assert.equal(other.snapshot().pending.length, 0); assert.equal(other.snapshot().failed, null);
    answer(); assert.equal(await pending, false); assert.equal(await queued, false);
    assert.equal(calls.length, count, 'queued A edit must never be sent using B');
    store.retry(); assert.equal(await store.save({ section: 'social', key: 'threads', value: false }), false);
    actor = 'actor-a'; identity = 'actor-a:session:1:User'; scope++;
    const again = stores.getNotificationSettingsStore(client, actor);
    assert.notEqual(again, store); assert.equal(again.snapshot().pending.length, 0);
    assert.equal(await store.save({ section: 'social', key: 'threads', value: false }), false, 'A→B→A cannot revive an old action');
    const read = again.load(); await flush();
    const mismatchRead = stores.getNotificationSettingsStore(client, 'wrong-account');
    await assert.rejects(mismatchRead.load(), /sign-in session changed/); assert.equal(reads, 1, 'manual refresh cannot bypass the account guard');
    scope++; readWaiting.shift()(confirmed); await assert.rejects(read, /sign-in session changed/);
    const finalStore = stores.getNotificationSettingsStore(client, actor);
    const current = finalStore.save({ section: 'social', key: 'threads', value: false });
    await flush(); const currentCall = calls.at(-1);
    assert.equal(currentCall.config._authScope, scope); assert.equal(currentCall.config._securityIdentity, identity);
    assert.equal('_accountToken' in currentCall.config, false, 'normal refresh and security enforcement stay active');
    identity = null; scope++; actor = null; answer(); assert.equal(await current, false);
    assert.equal(await again.save({ section: 'tags', key: 'mentions', value: true }), false);
    const mismatch = stores.getNotificationSettingsStore(client, 'wrong-account');
    assert.equal(await mismatch.save({ section: 'tags', key: 'mentions', value: true }), false);
    console.log(path.basename(root) + ': serial saves, rollback, retry, session retirement and request binding PASS');
  } finally { client.clear(); }
}
async function run() {
  await check(native, '@/src/');
  const web = process.env.WIEZ_WEB_SECURITY_ROOT;
  if (web) {
    for (const file of ['notificationSettings.ts', 'notificationSections.ts', 'notificationSettingsStore.ts']) {
      const normalize = value => value.replaceAll('@/src/', '@/').replace(/\r\n/g, '\n');
      assert.equal(normalize(fs.readFileSync(path.join(native, 'src/notifications', file), 'utf8')), normalize(fs.readFileSync(path.join(web, 'src/notifications', file), 'utf8')), file + ': platform behavior must stay aligned');
    }
    await check(web, '@/');
  }
}
module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
