/**
 * Patch store contract (src/features/patches/patchStore.ts).
 *
 * Executes the real module, transpiled, in a sandbox with fake timers, an
 * in-memory AsyncStorage and a recording brand API:
 *   - a burst of taps sends ONE request, for the final state;
 *   - taps that cancel out send nothing and announce nothing;
 *   - a refusal puts the pill back on the server's state and says so once;
 *   - the server list wins over a feed seed, and a tap wins over both;
 *   - the list is persisted per account and restored before the network;
 *   - reset (sign-out) forgets everything.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const file = path.join(repoRoot, 'src/features/patches/patchStore.ts');
const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  fileName: file,
}).outputText;

async function flushMicrotasks() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function createClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flushMicrotasks();
      }
      now = target;
      await flushMicrotasks();
    },
  };
}

function loadStore({ serverList = [], failNext = false, offline = false } = {}) {
  const clock = createClock();
  const storage = new Map();
  const calls = [];
  const api = { failNext };
  const refuse = () => {
    if (!api.failNext) return;
    api.failNext = false;
    throw new Error('refused');
  };
  const brandApi = {
    patchBrand: async (id) => {
      calls.push(['patch', id]);
      refuse();
      return true;
    },
    unpatchBrand: async (id) => {
      calls.push(['unpatch', id]);
      refuse();
      return false;
    },
  };
  const ProfileApi = {
    // offline: the request never answers, so only storage can paint.
    getPatches: () => (offline ? new Promise(() => {}) : Promise.resolve(serverList.map((id) => ({ id })))),
  };
  const AsyncStorage = {
    getItem: async (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: async (key, value) => void storage.set(key, value),
  };
  const module = { exports: {} };
  const mocks = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    react: { useSyncExternalStore: () => undefined },
    '@/src/api/BrandApi': { brandApi },
    '@/src/api/ProfileApi': { ProfileApi },
  };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier in mocks) return mocks[specifier];
      throw new Error(`Unmocked import ${specifier}`);
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    Date: { now: clock.now },
    JSON,
    Promise,
    Set,
    Map,
    Array,
    Error,
  });
  return { store: module.exports, clock, calls, storage };
}

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('a burst of taps sends one request, for the final state', async () => {
  const { store, clock, calls } = loadStore();
  store.resetPatchStore('shopper');
  const outcomes = [store.toggleBrandPatch('b1'), store.toggleBrandPatch('b1'), store.toggleBrandPatch('b1')];
  assert.equal(store.isBrandPatched('b1'), true, 'pill flips on the tap');
  await clock.advance(store.PATCH_SETTLE_MS);
  assert.deepEqual(calls, [['patch', 'b1']]);
  const settled = await Promise.all(outcomes);
  assert.deepEqual(settled.map((o) => o.status), ['superseded', 'superseded', 'settled']);
  assert.equal(settled[2].changed, true);
});

check('taps that cancel out send nothing and announce nothing', async () => {
  const { store, clock, calls } = loadStore();
  store.resetPatchStore('shopper');
  store.toggleBrandPatch('b1');
  const last = store.toggleBrandPatch('b1');
  await clock.advance(store.PATCH_SETTLE_MS);
  assert.deepEqual(calls, []);
  const outcome = await last;
  assert.equal(outcome.status, 'settled');
  assert.equal(outcome.changed, false);
  assert.equal(store.isBrandPatched('b1'), false);
});

check('a refusal reverts the pill to the server state and reports once', async () => {
  const { store, clock, calls } = loadStore({ failNext: true });
  store.resetPatchStore('shopper');
  const outcome = store.toggleBrandPatch('b1');
  await clock.advance(store.PATCH_SETTLE_MS);
  const result = await outcome;
  assert.equal(result.status, 'failed');
  assert.equal(result.patched, false);
  assert.equal(store.isBrandPatched('b1'), false);
  assert.equal(calls.length, 1);
});

check('a later tap is sent after the first request lands, never in parallel', async () => {
  const { store, clock, calls } = loadStore();
  store.resetPatchStore('shopper');
  store.toggleBrandPatch('b1');
  await clock.advance(store.PATCH_SETTLE_MS);
  const back = store.toggleBrandPatch('b1');
  await clock.advance(store.PATCH_SETTLE_MS);
  assert.deepEqual(calls, [['patch', 'b1'], ['unpatch', 'b1']]);
  assert.equal((await back).status, 'settled');
  assert.equal(store.isBrandPatched('b1'), false);
});

check('the server list wins over a feed seed; an unsent tap wins over both', async () => {
  const { store, clock } = loadStore({ serverList: ['b1', 'b2'] });
  store.resetPatchStore('shopper');
  store.seedBrandPatchStatus('b3', true);
  assert.equal(store.isBrandPatched('b3'), true, 'a seed paints before the list');
  store.seedBrandPatchStatus('b2', true);
  store.toggleBrandPatch('b2'); // unpatched before the list lands
  await store.hydratePatchStore('shopper');
  assert.equal(store.isBrandPatched('b1'), true);
  assert.equal(store.isBrandPatched('b2'), false, 'the unsent tap survives the list');
  assert.equal(store.isBrandPatched('b3'), false, 'the list replaces the seed');
  store.seedBrandPatchStatus('b4', true);
  assert.equal(store.isBrandPatched('b4'), false, 'seeds are ignored once the list loaded');
  await clock.advance(store.PATCH_SETTLE_MS);
});

check('the list is persisted per account and restored before the network', async () => {
  const first = loadStore({ serverList: ['b1'] });
  first.store.resetPatchStore('shopper');
  await first.store.hydratePatchStore('shopper');
  await first.clock.advance(1000);
  const saved = first.storage.get(`${first.store.PATCH_STORE_STORAGE_PREFIX}shopper`);
  assert.deepEqual(JSON.parse(saved), ['b1']);

  const second = loadStore({ offline: true });
  second.storage.set(`${second.store.PATCH_STORE_STORAGE_PREFIX}shopper`, saved);
  void second.store.hydratePatchStore('shopper');
  await flushMicrotasks();
  assert.equal(second.store.isBrandPatched('b1'), true, 'painted from storage with the network down');
});

check('reset forgets everything and settles pending taps silently', async () => {
  const { store, clock, calls } = loadStore();
  store.resetPatchStore('shopper');
  const pending = store.toggleBrandPatch('b1');
  store.resetPatchStore(null);
  assert.equal((await pending).status, 'superseded');
  assert.equal(store.isBrandPatched('b1'), false);
  await clock.advance(store.PATCH_SETTLE_MS);
  assert.deepEqual(calls, []);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  FAIL ${name}\n       ${error && error.message}`);
    }
  }
  console.log(`${checks.length - failed}/${checks.length} patch store checks passed`);
  if (failed) process.exit(1);
})();
