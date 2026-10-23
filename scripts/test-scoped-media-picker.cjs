const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const key = 'wiez.media-picker.pending.v1';
const scope = { actorId: 'actor-a', flowId: 'design-editor', subjectId: 'draft-a' };
const request = { source: 'library', options: { mediaTypes: ['images'], quality: 1 } };
const selected = { canceled: false, assets: [{ uri: 'file:///selected.jpg', type: 'image' }] };
function harness(platform = 'android') {
  const storage = new Map(); const calls = { library: 0, camera: 0, permissionRead: 0, permissionRequest: 0 };
  const sdk = {
    MediaTypeOptions: { All: 'All', Videos: 'Videos' }, VideoExportPreset: { Passthrough: 0 },
    getPendingResultAsync: async () => null,
    getCameraPermissionsAsync: async () => { calls.permissionRead++; return { granted: true }; },
    getMediaLibraryPermissionsAsync: async () => { calls.permissionRead++; return { granted: true }; },
    requestCameraPermissionsAsync: async () => { calls.permissionRequest++; return { granted: true }; },
    requestMediaLibraryPermissionsAsync: async () => { calls.permissionRequest++; return { granted: true }; },
    launchImageLibraryAsync: async () => { calls.library++; return selected; },
    launchCameraAsync: async () => { calls.camera++; return selected; },
  };
  const asyncStorage = { getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v), removeItem: async (k) => storage.delete(k) };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/scopedMediaPicker.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(module,exports,require){${output}\n})`)(module, module.exports, (name) => {
    if (name === 'expo-image-picker') return sdk;
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === '@react-native-async-storage/async-storage') return asyncStorage;
    throw new Error(name);
  });
  return { ...module.exports, sdk, calls, storage, asyncStorage };
}
test('modern photo picker bypasses full-library permission on Android and iOS', async () => {
  for (const os of ['android', 'ios']) {
    const h = harness(os); const result = await h.pickScopedMedia(scope, request, () => true);
    assert.equal(result.status, 'success'); assert.equal(h.calls.library, 1);
    assert.equal(h.calls.permissionRead, 0); assert.equal(h.calls.permissionRequest, 0);
  }
});
test('iOS original-video permission accepts limited selection without another prompt', async () => {
  const h = harness('ios'); h.sdk.getMediaLibraryPermissionsAsync = async () => ({ granted: false, accessPrivileges: 'limited' });
  assert.equal((await h.pickScopedMedia(scope, { ...request, options: { mediaTypes: ['images', 'videos'] } }, () => true)).status, 'success');
  assert.equal(h.calls.permissionRequest, 0);
});
test('camera denial is retryable only after another explicit action', async () => {
  const h = harness(); h.sdk.getCameraPermissionsAsync = async () => ({ granted: false, canAskAgain: true });
  h.sdk.requestCameraPermissionsAsync = async () => { h.calls.permissionRequest++; return { granted: false, canAskAgain: true }; };
  const camera = { ...request, source: 'camera' };
  assert.equal((await h.pickScopedMedia(scope, camera, () => true)).status, 'permission');
  assert.equal(h.calls.camera, 0); assert.equal(h.calls.permissionRequest, 1);
  h.sdk.getCameraPermissionsAsync = async () => ({ granted: true });
  assert.equal((await h.pickScopedMedia(scope, camera, () => true)).status, 'success');
  assert.equal(h.calls.permissionRequest, 1);
});
test('permanently blocked permission never repeats system prompt', async () => {
  const h = harness(); h.sdk.getCameraPermissionsAsync = async () => ({ granted: false, canAskAgain: false });
  assert.equal((await h.pickScopedMedia(scope, { ...request, source: 'camera' }, () => true)).status, 'permission');
  assert.equal(h.calls.permissionRequest, 0);
});
test('cancel returns no replacement assets and next explicit choice works', async () => {
  const h = harness(); h.sdk.launchImageLibraryAsync = async () => ({ canceled: true, assets: null });
  assert.equal((await h.pickScopedMedia(scope, request, () => true)).status, 'cancelled');
  assert.equal(h.storage.size, 0); h.sdk.launchImageLibraryAsync = async () => selected;
  assert.equal((await h.pickScopedMedia(scope, request, () => true)).status, 'success');
});
test('account or mount ownership loss discards delayed selection', async () => {
  const h = harness(); let current = true;
  h.sdk.launchImageLibraryAsync = async () => { current = false; return selected; };
  assert.equal((await h.pickScopedMedia(scope, request, () => current)).status, 'cancelled');
  assert.equal(h.storage.size, 0);
});
test('ownership loss during permission check prevents launch', async () => {
  const h = harness(); let current = true;
  h.sdk.getCameraPermissionsAsync = async () => { current = false; return { granted: true }; };
  assert.equal((await h.pickScopedMedia(scope, { ...request, source: 'camera' }, () => current)).status, 'cancelled');
  assert.equal(h.calls.camera, 0);
});
test('only one native picker can launch at once', async () => {
  const h = harness(); let release; let opened;
  const opening = new Promise((resolve) => { opened = resolve; });
  h.sdk.launchImageLibraryAsync = () => { opened(); return new Promise((resolve) => { release = resolve; }); };
  const first = h.pickScopedMedia(scope, request, () => true); await opening;
  assert.equal((await h.pickScopedMedia(scope, request, () => true)).status, 'cancelled');
  release(selected); assert.equal((await first).status, 'success');
});
test('Android pending result replays only the same durable actor/flow/subject/source', async () => {
  const h = harness(); h.storage.set(key, JSON.stringify({ ...scope, source: 'library', createdAt: Date.now() }));
  h.sdk.getPendingResultAsync = async () => selected;
  assert.equal((await h.pickScopedMedia(scope, request, () => true)).status, 'success');
  assert.equal(h.calls.library, 0); assert.equal(h.storage.size, 0);
});
test('wrong account, flow, draft, expired context or unsaved draft never replays', async () => {
  for (const old of [ { actorId: 'other' }, { flowId: 'other' }, { subjectId: 'other' }, { createdAt: 1 }, { source: 'camera' } ]) {
    const h = harness(); h.storage.set(key, JSON.stringify({ ...scope, source: 'library', createdAt: Date.now(), ...old }));
    h.sdk.getPendingResultAsync = async () => selected;
    await h.pickScopedMedia(scope, request, () => true); assert.equal(h.calls.library, 1);
  }
  const h = harness(); h.storage.set(key, JSON.stringify({ ...scope, subjectId: null, source: 'library', createdAt: Date.now() }));
  h.sdk.getPendingResultAsync = async () => selected;
  await h.pickScopedMedia({ ...scope, subjectId: null }, request, () => true); assert.equal(h.calls.library, 1);
});
test('SDK failure releases picker guard for the next explicit retry', async () => {
  const h = harness(); h.sdk.launchImageLibraryAsync = async () => { throw new Error('cancelled by platform'); };
  assert.equal((await h.pickScopedMedia(scope, request, () => true)).status, 'error');
  h.sdk.launchImageLibraryAsync = async () => selected;
  assert.equal((await h.pickScopedMedia(scope, request, () => true)).status, 'success');
});
test('web SDK launch occurs synchronously inside explicit user action', async () => {
  const h = harness('web'); const promise = h.pickScopedMedia(scope, request, () => true);
  assert.equal(h.calls.library, 1); assert.equal((await promise).status, 'success');
});

const webModules = path.resolve(root, '../fthreadly/node_modules');
const hasDomRuntime = fs.existsSync(path.join(webModules, 'react-dom/client.js')) && fs.existsSync(path.join(webModules, 'jsdom'));
async function withMountedPicker(run) {
  const { JSDOM } = require(path.join(webModules, 'jsdom'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://example.test' });
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require(path.join(webModules, 'react'));
  const { createRoot } = require(path.join(webModules, 'react-dom/client'));
  const h = harness(); const listeners = new Set(); const issue = [];
  let epoch = 0; let latest; let focusCleanup; let unmounted = false;
  const output = ts.transpileModule(fs.readFileSync(path.join(root, 'src/hooks/useScopedMediaPicker.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(module,exports,require){${output}\n})`)(module, module.exports, (name) => {
    if (name === 'react') return React;
    if (name === 'expo-router') return { useFocusEffect: (callback) => React.useEffect(() => { focusCleanup = callback(); return focusCleanup; }, [callback]) };
    if (name === 'react-native') return { Platform: { OS: 'android' }, Alert: { alert() {} }, Linking: { openSettings: async () => {} },
      AppState: { addEventListener: (_name, listener) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } } };
    if (name.endsWith('/scopedMediaPicker')) return h;
    if (name.endsWith('/mediaUrlSession')) return { getMediaSessionEpoch: () => epoch };
    throw new Error(name);
  });
  const view = createRoot(dom.window.document.getElementById('root'));
  function Probe(props) { latest = module.exports.useScopedMediaPicker(props, (value) => issue.push(value)); return null; }
  const render = (props) => React.act(async () => { view.render(React.createElement(Probe, props)); });
  const unmount = async () => { if (!unmounted) { unmounted = true; await React.act(async () => view.unmount()); } };
  try {
    await render(scope);
    await run({ h, React, render, unmount, get latest() { return latest; }, issue, listeners,
      blur: () => focusCleanup(), changeEpoch: () => { epoch++; } });
  } finally {
    await unmount(); dom.window.close(); global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
}
test('mounted picker discards account, draft, blur, epoch and unmount completions', { skip: !hasDomRuntime }, async () => {
  for (const change of ['actor', 'draft', 'blur', 'epoch', 'unmount']) await withMountedPicker(async (probe) => {
    let release; let opened; const opening = new Promise((resolve) => { opened = resolve; });
    probe.h.sdk.launchImageLibraryAsync = () => { opened(); return new Promise((resolve) => { release = resolve; }); };
    const pending = probe.latest.pick(request); await opening;
    if (change === 'actor') await probe.render({ ...scope, actorId: 'actor-b' });
    if (change === 'draft') await probe.render({ ...scope, subjectId: 'draft-b' });
    if (change === 'blur') probe.blur();
    if (change === 'epoch') probe.changeEpoch();
    if (change === 'unmount') await probe.unmount();
    release(selected); assert.equal((await pending).status, 'cancelled', change);
  });
});
test('new explicit choice invalidates earlier selection guard before upload completion', { skip: !hasDomRuntime }, async () => {
  await withMountedPicker(async (probe) => {
    const first = await probe.latest.pick(request); assert.equal(first.isCurrent(), true);
    const second = await probe.latest.pick(request); assert.equal(first.isCurrent(), false); assert.equal(second.isCurrent(), true);
  });
});
test('Settings resume only rechecks permission and never opens another picker or prompt', { skip: !hasDomRuntime }, async () => {
  await withMountedPicker(async (probe) => {
    probe.h.sdk.getCameraPermissionsAsync = async () => ({ granted: false, canAskAgain: false });
    await probe.latest.pick({ ...request, source: 'camera' });
    assert.equal(probe.issue.at(-1).canAskAgain, false);
    probe.h.sdk.getCameraPermissionsAsync = async () => ({ granted: true });
    await probe.React.act(async () => { probe.listeners.forEach((listener) => listener('active')); });
    assert.equal(probe.issue.at(-1).title, 'Media access ready'); assert.equal(probe.issue.at(-1).source, 'camera');
    assert.equal(probe.h.calls.camera, 0); assert.equal(probe.h.calls.permissionRequest, 0);
  });
});
