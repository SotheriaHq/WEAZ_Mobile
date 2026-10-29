const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const modules = new Map();
const data = new Map();
const reactRuntime = {};
const appStateListeners = new Set();
const calls = { source: 0, public: 0, private: 0, removed: 0 };
let sourceResult = async () => null;
let publicResult = async () => 'https://cdn.example.com/fresh.jpg';
const brandApi = {
 getSignedMediaSourceUrl: async (...args) => { calls.source++; return sourceResult(...args); },
 getPublicFileUrl: async (...args) => { calls.public++; return publicResult(...args); },
 getPrivateSignedFileUrl: async () => { calls.private++; return 'https://cdn.example.com/private?token=owner'; },
};
const queryClient = {
 getQueryData: (key) => data.get(JSON.stringify(key)),
 removeQueries: ({ queryKey }) => { calls.removed++; data.delete(JSON.stringify(queryKey)); },
 fetchQuery: async ({ queryKey, queryFn, staleTime }) => {
  const key = JSON.stringify(queryKey);
  if (staleTime && data.has(key)) return data.get(key);
  const result = await queryFn(); data.set(key, result); return result;
 },
};
const keys = { media: { publicUrl: (id) => ['public', id], signedUrl: (id) => ['private', id] } };
function load(file) {
 const absolute = path.resolve(root, file);
 if (modules.has(absolute)) return modules.get(absolute);
 const module = { exports: {} }; modules.set(absolute, module.exports);
 const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 const requireActual = (specifier) => {
  if (specifier === '@/src/api/BrandApi') return { brandApi };
  if (specifier === '@/src/query/queryClient') return { queryClient, WIEZ_MEDIA_URL_GC_TIME_MS: 60_000 };
  if (specifier === '@/src/query/queryKeys') return { queryKeys: keys };
  if (specifier === '@/src/features/feed/utils/feedDiagnostics') return { mediaDevWarn: () => {} };
  if (specifier === 'expo-image') return { Image: {} };
  if (specifier === 'react') return reactRuntime;
  if (specifier === 'react-native') return { Platform: { OS: 'android' }, AppState: { addEventListener: (_event, callback) => { appStateListeners.add(callback); return { remove() { appStateListeners.delete(callback); } }; } } };
  if (specifier.startsWith('@/')) return load(`${specifier.slice(2)}.ts`);
  if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(absolute), `${specifier}.ts`)));
  throw new Error(`Unexpected import ${specifier}`);
 };
 vm.runInThisContext(`(function(module,exports,require){${output}\n})`, { filename: absolute })(module, module.exports, requireActual);
 modules.set(absolute, module.exports); return module.exports;
}
const policy = load('src/utils/mediaUrlPolicy.ts');
const resolver = load('src/hooks/useResolvedImageUri.ts');
const r2 = 'https://account.r2.cloudflarestorage.com/private/key.webp';
const oldGateway = 'https://media.example.com/media/key.webp?env=sit&method=GET&exp=1&sig=old';
const freshGateway = () => `https://media.example.com/media/key.webp?env=sit&method=GET&exp=${Math.floor(Date.now()/1000)+300}&sig=fresh`;
function reset() { resolver.clearResolvedImageUriCache(); data.clear(); Object.keys(calls).forEach((key) => { calls[key] = 0; }); sourceResult = async () => null; publicResult = async () => 'https://cdn.example.com/fresh.jpg'; }

const webPolicyPath = path.join(process.env.WIEZ_WEB_ROOT || path.resolve(root, '../fthreadly'), 'src/utils/mediaUrlPolicy.ts');
if (process.env.WIEZ_WEB_ROOT) assert(fs.existsSync(webPolicyPath), 'Explicit web worktree must contain its media policy');
test('web and native policy implementations stay identical', { skip: !fs.existsSync(webPolicyPath) }, () => {
 assert.equal(fs.readFileSync(path.join(root, 'src/utils/mediaUrlPolicy.ts'), 'utf8'), fs.readFileSync(webPolicyPath, 'utf8'));
});
test('retired AWS storage cannot render or trigger renewal', () => {
 for (const url of ['https://bucket.s3.eu-north-1.amazonaws.com/key', 'https://old.cloudfront.net/key?X-Amz-Signature=old']) {
  assert.equal(policy.isUsableMediaUrl(url), false); assert.equal(policy.isRenewableMediaUrl(url), false);
 }
});
test('R2 SDK expiry, gateway expiry, and unsigned private origins', () => {
 const sdk = `${r2}?X-Amz-Date=20261022T120000Z&X-Amz-Expires=300&X-Amz-Signature=abc`;
 assert.equal(policy.getMediaUrlExpiryMs(sdk), Date.UTC(2026,9,22,12,5));
 assert.equal(policy.isUsableMediaUrl(oldGateway), false);
 assert.equal(policy.isUsableMediaUrl(r2), false);
 assert.equal(policy.isUsableMediaUrl('file:///photo.jpg'), true);
 assert.equal(policy.isUsableMediaUrl('https://cdn.example.com/photo.jpg'), true);
});
test('identity strips credentials while retaining environment, permission and transforms', () => {
 assert.equal(policy.getMediaUrlIdentity(`${oldGateway}&width=400`), 'https://media.example.com/media/key.webp?env=sit&method=GET&width=400');
 assert.equal(policy.isStorageProviderUrl('https://r2.cloudflarestorage.com.attacker.example/key'), false);
});
test('unsigned R2 source is authorized before rendering', async () => {
 reset(); const result = await resolver.resolveImageUri({ src: r2, fileId: 'file-1' });
 assert.equal(result, 'https://cdn.example.com/fresh.jpg'); assert.equal(calls.public, 1); assert.notEqual(result, r2);
});
test('expired URL-only gateway variant renews through its source metadata', async () => {
 reset(); const fresh = freshGateway(); sourceResult = async (source) => { assert.equal(source, oldGateway); return fresh; };
 assert.equal(await resolver.resolveImageUri({ src: oldGateway }), fresh); assert.equal(calls.source, 1); assert.equal(calls.public, 0);
});
test('force refresh does not return a still-valid payload capability', async () => {
 reset(); const old = freshGateway(); sourceResult = async () => old.replace('sig=fresh', 'sig=new');
 assert.match(await resolver.resolveImageUri({ src: old, forceRefresh: true }), /sig=new/); assert.equal(calls.source, 1);
});
test('public-only callers never fall through to owner authorization', async () => {
 reset(); publicResult = async () => null;
 assert.equal(await resolver.resolveImageUri({ src: oldGateway, fileId: 'file-2', allowSignedFallback: false }), null);
 assert.equal(calls.private, 0);
});
test('expired persisted query URL forces a new authorized request', async () => {
 reset(); data.set(JSON.stringify(keys.media.publicUrl('file-3')), oldGateway);
 assert.equal(await resolver.resolveImageUri({ fileId: 'file-3' }), 'https://cdn.example.com/fresh.jpg'); assert.equal(calls.removed, 2);
});
test('simultaneous exact-source renewals are coalesced', async () => {
 reset(); let release; sourceResult = () => new Promise((resolve) => { release = resolve; });
 const a = resolver.resolveImageUri({ src: oldGateway }); const b = resolver.resolveImageUri({ src: oldGateway });
 release(freshGateway()); assert.equal(await a, await b); assert.equal(calls.source, 1);
});
test('delayed old-account result cannot populate the next session', async () => {
 reset(); let release; sourceResult = () => new Promise((resolve) => { release = resolve; });
 const pending = resolver.resolveImageUri({ src: oldGateway }); resolver.clearResolvedImageUriCache(); release(freshGateway());
 assert.equal(await pending, null);
 sourceResult = async () => null; assert.equal(await resolver.resolveImageUri({ src: oldGateway }), null);
});
test('different variants on one file retain distinct source identity', async () => {
 reset(); sourceResult = async (source) => source.replace('exp=1', `exp=${Math.floor(Date.now()/1000)+300}`);
 const a = await resolver.resolveImageUri({ src: oldGateway, fileId: 'same' });
 const b = await resolver.resolveImageUri({ src: oldGateway.replace('key.webp', 'thumb.webp'), fileId: 'same' });
 assert.notEqual(a, b); assert.equal(calls.source, 2);
});
test('failed renewal never falls back to an expired or unsigned provider URL', async () => {
 reset(); assert.equal(await resolver.resolveImageUri({ src: oldGateway }), null);
 assert.equal(await resolver.resolveImageUri({ src: r2 }), null);
});

const webModules = path.join(root, '../fthreadly/node_modules');
const hasDomRuntime = fs.existsSync(path.join(webModules, 'react-dom/client.js')) && fs.existsSync(path.join(webModules, 'jsdom'));
async function mountedProbe(run) {
 const { JSDOM } = require(path.join(webModules, 'jsdom'));
 const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://web.example.com' });
 const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
 global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
 const React = require(path.join(webModules, 'react')); Object.assign(reactRuntime, React);
 const { createRoot } = require(path.join(webModules, 'react-dom/client'));
 const container = document.createElement('div'); document.body.appendChild(container);
 const view = createRoot(container); const history = []; let latest;
 function Probe(props) { latest = resolver.useResolvedImageUri(props); history.push({ input: props.src, uri: latest }); return React.createElement('span', null, latest); }
 const render = async (props) => React.act(async () => { view.render(React.createElement(Probe, props)); });
 try { await run({ React, render, history, get latest() { return latest; } }); }
 finally { await React.act(async () => { view.unmount(); }); dom.window.close(); global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act; }
}
test('mounted native hook cannot resurrect old-account media while renewal is pending or denied', { skip: !hasDomRuntime }, async () => {
 reset(); const initial = freshGateway();
 await mountedProbe(async (probe) => {
  await probe.render({ src: initial }); assert.equal(probe.latest, initial);
  let release; sourceResult = () => new Promise((resolve) => { release = resolve; });
  await probe.React.act(async () => { resolver.clearResolvedImageUriCache(); });
  assert.equal(probe.latest, null, 'old private capability must disappear before authorization completes');
  await probe.render({ src: initial }); assert.equal(probe.latest, null, 'an unrelated rerender must not bypass pending authorization');
  await probe.React.act(async () => { release(null); }); assert.equal(probe.latest, null, 'denied renewal must not reuse the original capability');
  const fresh = freshGateway().replace('sig=fresh', 'sig=new-account'); sourceResult = async () => fresh;
  await probe.React.act(async () => { appStateListeners.forEach((listener) => listener('active')); });
  assert.equal(probe.latest, fresh);
  await probe.render({ src: initial }); assert.equal(probe.latest, fresh, 'completed renewal must not be overwritten by stale payload props');
 });
});
test('mounted native hook does not paint the previous object during source changes', { skip: !hasDomRuntime }, async () => {
 reset(); const first = freshGateway(); const second = first.replace('key.webp', 'other.webp');
 await mountedProbe(async (probe) => {
  await probe.render({ src: first }); await probe.render({ src: second });
  assert.equal(probe.latest, second);
  assert.ok(probe.history.filter((row) => row.input === second).every((row) => row.uri !== first));
 });
});

test('mounted URL-only native hook refreshes after suspended background timers', { skip: !hasDomRuntime }, async () => {
 reset(); const realNow = Date.now; const start = realNow(); const initial = freshGateway();
 try {
  await mountedProbe(async (probe) => {
   await probe.render({ src: initial }); assert.equal(probe.latest, initial);
   Date.now = () => start + 400_000;
   const fresh = freshGateway().replace('sig=fresh', 'sig=resumed'); sourceResult = async () => fresh;
   await probe.React.act(async () => { appStateListeners.forEach((listener) => listener('active')); });
   assert.equal(probe.latest, fresh); assert.equal(calls.source, 1);
  });
 } finally { Date.now = realNow; }
});

test('a recycled mounted hook authorizes later payloads after an account change', { skip: !hasDomRuntime }, async () => {
 reset(); const initial = freshGateway();
 await mountedProbe(async (probe) => {
  await probe.render({ src: initial });
  const fresh = initial.replace('sig=fresh', 'sig=authorized'); sourceResult = async () => fresh;
  await probe.React.act(async () => { resolver.clearResolvedImageUriCache(); }); assert.equal(probe.latest, fresh);
  const staleOther = initial.replace('key.webp', 'old-account-private.webp'); sourceResult = async () => null;
  await probe.render({ src: staleOther });
  assert.equal(probe.latest, null);
  assert.ok(probe.history.filter((row) => row.input === staleOther).every((row) => row.uri !== staleOther));
 });
});
