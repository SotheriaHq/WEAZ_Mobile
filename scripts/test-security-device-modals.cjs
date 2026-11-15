const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const own = path.resolve(__dirname, '..');
const native = process.env.WIEZ_NATIVE_SECURITY_ROOT || (fs.existsSync(path.join(own, 'src/storage/secureStorage.ts')) ? own : path.resolve(own, '../threadly-mobile'));
const web = process.env.WIEZ_WEB_SECURITY_ROOT || (fs.existsSync(path.join(own, 'src/context/AuthContext.tsx')) ? own : path.resolve(own, '../fthreadly'));
const identity = 'actor:session:1:User';
function apiFixture(root) {
  let current = identity, response = { items: [], nextCursor: null };
  const calls = [];
  const client = Object.fromEntries(['get', 'post', 'patch'].map(verb => [verb, async (url, body, config) => {
    calls.push({ verb, url, config: verb === 'get' ? body : config }); return { data: response };
  }]));
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, 'src/api/SecuritySessionsApi.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => {
      assert(name.endsWith('/api/httpClient')); return { apiClient: client, getApiSecurityIdentity: () => current };
    } });
  return { ...module.exports, calls, setIdentity: value => { current = value; }, payload: value => { response = value; } };
}
for (const [name, root] of [['web', web], ['native', native]]) {
  if (!fs.existsSync(path.join(root, 'src/api/SecuritySessionsApi.ts'))) {
    test(name + ' counterpart source', context => context.skip('Sibling source is not checked out')); continue;
  }
  test(name + ': stale UI actor cannot capture the next account authority', () => {
    const f = apiFixture(root); assert.equal(f.captureSessionAuthority('another-actor'), null);
    assert.equal(f.captureSessionAuthority('actor').identity, identity);
  });
  for (const next of [null, 'next:session:1:User', 'actor:new-session:1:User', 'actor:session:2:User', 'actor:session:1:Admin'])
    test(name + ': retained page cannot dispatch after identity changes to ' + String(next), async () => {
      const f = apiFixture(root), scope = f.captureSessionAuthority('actor'); f.setIdentity(next);
      for (const invoke of [() => f.SecuritySessionsApi.devices(scope, null), () => f.SecuritySessionsApi.sessions(scope, 'a'.repeat(64), null),
        () => f.SecuritySessionsApi.revokeSession(scope, 'id'), () => f.SecuritySessionsApi.revokeDevice(scope, 'a'.repeat(64)), () => f.SecuritySessionsApi.revokeOthers(scope)])
        await assert.rejects(invoke(), /sign-in changed/);
      assert.equal(f.calls.length, 0);
    });
  test(name + ': all reads and mutations carry the captured identity into the real transport contract', async () => {
    const f = apiFixture(root), scope = f.captureSessionAuthority('actor'); const signal = new AbortController().signal;
    await f.SecuritySessionsApi.devices(scope, 'cursor', signal);
    await f.SecuritySessionsApi.sessions(scope, 'a'.repeat(64), null, signal);
    await f.SecuritySessionsApi.revokeSession(scope, 'id'); await f.SecuritySessionsApi.revokeDevice(scope, 'a'.repeat(64));
    await f.SecuritySessionsApi.revokeOthers(scope);
    assert.equal(f.calls.length, 5); assert(f.calls.every(call => call.config._securityIdentity === identity));
    assert.equal(f.calls[0].config.signal, signal); assert.equal(f.calls[1].config.signal, signal);
  });
  test(name + ': null/malformed lists are recoverable errors rather than render crashes', async () => {
    const f = apiFixture(root), scope = f.captureSessionAuthority('actor');
    for (const payload of [null, {}, { items: null, nextCursor: null }, { items: [], nextCursor: {} },
      { items: [{}], nextCursor: null }, { items: [], nextCursor: 'x'.repeat(513) }]) {
      f.payload(payload);
      await assert.rejects(f.SecuritySessionsApi.devices(scope, null), /incomplete device sessions/);
      await assert.rejects(f.SecuritySessionsApi.sessions(scope, 'a'.repeat(64), null), /incomplete device sessions/);
    }
  });
}
if (fs.existsSync(path.join(native, 'components/settings/SecurityDevicesPanel.tsx'))) {
  const source = fs.readFileSync(path.join(native, 'components/settings/SecurityDevicesPanel.tsx'), 'utf8');
  const ast = ts.createSourceFile('devices.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let cardConfirm, allConfirm;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'confirm') cardConfirm = node.initializer.getText(ast);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const title = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'title');
      const press = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'onPress');
      if (title?.initializer?.getText(ast) === '"Sign out all other sessions"') allConfirm = press.initializer.expression.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(cardConfirm && allConfirm, 'Use both actual native confirmation callbacks.');
  for (const [label, body] of [['selected device/session', cardConfirm], ['all other sessions', allConfirm]]) {
    for (const state of ['current', 'account-switched', 'session-rotated', 'unmounted'])
      test('actual native ' + label + ' confirmation: ' + state, () => {
        let current = identity, press; const mutations = [], mounted = { current: true }, module = { exports: {} };
        vm.runInNewContext(ts.transpileModule('module.exports = (' + body + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
          module, exports: module.exports, authority: { actorId: 'actor', identity }, mounted,
          getApiSecurityIdentity: () => current, device: { isCurrentDevice: false },
          Alert: { alert(_title, _description, actions) { press = actions.find(a => a.style === 'destructive').onPress; } },
          revoke: { mutate: variables => mutations.push(variables) },
        });
        module.exports('session-id'); assert(press);
        if (state === 'account-switched') current = 'next:session:1:User';
        if (state === 'session-rotated') current = 'actor:new-session:1:User';
        if (state === 'unmounted') mounted.current = false;
        press(); assert.equal(mutations.length, state === 'current' ? 1 : 0);
      });
  }
}
