/**
 * App survival contract: coming back after Android kills the app, and auth links
 * that cold-start it.
 *
 * Executes the real modules (transpiled, in a sandbox with in-memory storage):
 *   - launchLinkLedger: a launch URL is "replayed" only for a DIFFERENT runtime.
 *   - routeRestoration: what may be restored, and what is never written down.
 *   - app/+native-intent: Expo Router never routes auth links itself.
 *   - emailVerificationLink: one verify request per token; network failures retry.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

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

function createStorage() {
  const map = new Map();
  return {
    map,
    getItem: async (key) => (map.has(key) ? map.get(key) : null),
    setItem: async (key, value) => {
      map.set(key, String(value));
    },
    removeItem: async (key) => {
      map.delete(key);
    },
  };
}

/** Load a module fresh (its own module scope = its own "JS runtime"). */
function load(relativePath, mocks) {
  const filePath = path.join(repoRoot, relativePath);
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unmocked import "${specifier}" in ${relativePath}`);
  };
  vm.runInNewContext(compile(filePath), {
    module,
    exports: module.exports,
    require: localRequire,
    URL,
    URLSearchParams,
    console,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
  }, { filename: filePath });
  return module.exports;
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const verifyUrl = 'wiezmobile://verify-email?token=abc123';
const orderUrl = 'wiezmobile://orders/9f1c';

check('a launch URL is not a replay for the runtime that recorded it', async () => {
  const storage = createStorage();
  const runtimeA = load('src/navigation/launchLinkLedger.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } });
  assert.equal(await runtimeA.claimFreshLaunchUrl(verifyUrl), verifyUrl);
  assert.equal(await runtimeA.isReplayedLaunchUrl(verifyUrl), false);
  assert.equal(await runtimeA.claimFreshLaunchUrl(verifyUrl), verifyUrl, 'several consumers of one cold start must all get the URL');
});

check('the same launch URL in a later runtime is a replay', async () => {
  const storage = createStorage();
  const mocks = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } };
  const runtimeA = load('src/navigation/launchLinkLedger.ts', mocks);
  await runtimeA.markLaunchUrlHandled(verifyUrl);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const runtimeB = load('src/navigation/launchLinkLedger.ts', mocks);
  assert.equal(await runtimeB.isReplayedLaunchUrl(verifyUrl), true);
  assert.equal(await runtimeB.claimFreshLaunchUrl(verifyUrl), null);
  assert.equal(await runtimeB.isReplayedLaunchUrl(orderUrl), false, 'a different link is fresh');
});

check('the ledger never stores the URL (auth links carry tokens)', async () => {
  const storage = createStorage();
  const ledger = load('src/navigation/launchLinkLedger.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } });
  await ledger.markLaunchUrlHandled(verifyUrl);
  const stored = [...storage.map.values()].join('');
  assert.equal(stored.includes('abc123'), false);
});

check('root and dev-client URLs pass through without overwriting the real launch link', async () => {
  const storage = createStorage();
  const mocks = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } };
  const runtimeA = load('src/navigation/launchLinkLedger.ts', mocks);
  await runtimeA.markLaunchUrlHandled(verifyUrl);
  for (const url of ['wiezmobile:///', 'wiezmobile://', 'exp+wiez://expo-development-client/?url=http%3A%2F%2F10.0.0.2']) {
    assert.equal(runtimeA.isNonDestinationUrl(url), true, url);
    assert.equal(await runtimeA.claimFreshLaunchUrl(url), url);
  }
  assert.equal(runtimeA.isNonDestinationUrl(verifyUrl), false);
  const runtimeB = load('src/navigation/launchLinkLedger.ts', mocks);
  assert.equal(await runtimeB.isReplayedLaunchUrl(verifyUrl), true, 'the verify link must still be remembered');
});

check('restorable hrefs keep real query params and drop segment duplicates', () => {
  const restoration = load('src/navigation/routeRestoration.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: createStorage() } });
  assert.equal(
    restoration.buildRestorableHref('/orders/9f1c', { orderId: '9f1c', kind: 'CUSTOM' }),
    '/orders/9f1c?kind=CUSTOM',
  );
  assert.equal(restoration.buildRestorableHref('/catalog', {}), '/catalog');
});

check('routes that must never be restored are refused', () => {
  const restoration = load('src/navigation/routeRestoration.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: createStorage() } });
  for (const pathname of ['/', '/verify-email', '/reset-password', '/checkout', '/payment', '/oauthredirect']) {
    assert.equal(restoration.buildRestorableHref(pathname, {}), null, pathname);
  }
});

check('sensitive params are never written to storage', () => {
  const restoration = load('src/navigation/routeRestoration.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: createStorage() } });
  assert.equal(
    restoration.buildRestorableHref('/settings/payment', { token: 't', reference: 'r', tab: 'cards' }),
    '/settings/payment?tab=cards',
  );
});

check('a snapshot is consumed on read, so a crash on restore cannot loop', async () => {
  const storage = createStorage();
  const restoration = load('src/navigation/routeRestoration.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } });
  await restoration.saveRouteSnapshot({ href: '/catalog', userId: 'u1', savedAt: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(await restoration.takeRouteSnapshot())), { href: '/catalog', savedAt: 1, userId: 'u1' });
  assert.equal(await restoration.takeRouteSnapshot(), null);
});

function loadNativeIntent(storage) {
  const authLinkRouting = load('src/utils/authLinkRouting.ts', {});
  const ledger = load('src/navigation/launchLinkLedger.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } });
  return {
    ledger,
    intent: load('app/+native-intent.tsx', {
      '@/src/utils/authLinkRouting': authLinkRouting,
      '@/src/navigation/launchLinkLedger': ledger,
    }),
  };
}

check('Expo Router never routes auth links itself', async () => {
  const { intent } = loadNativeIntent(createStorage());
  assert.equal(await intent.redirectSystemPath({ path: verifyUrl, initial: true }), '/');
  assert.equal(await intent.redirectSystemPath({ path: verifyUrl, initial: false }), '');
  assert.equal(await intent.redirectSystemPath({ path: 'wiezmobile://reset-password?token=x', initial: false }), '');
});

check('other links pass through, and a replayed launch link opens the root', async () => {
  const storage = createStorage();
  const first = loadNativeIntent(storage);
  assert.equal(await first.intent.redirectSystemPath({ path: orderUrl, initial: true }), orderUrl);
  assert.equal(await first.intent.redirectSystemPath({ path: orderUrl, initial: false }), orderUrl);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const revived = loadNativeIntent(storage);
  assert.equal(await revived.intent.redirectSystemPath({ path: orderUrl, initial: true }), '/');
});

function loadVerification(verifyEmail) {
  return load('src/auth/emailVerificationLink.ts', {
    axios: { isAxiosError: (error) => Boolean(error && error.isAxiosError) },
    '@/src/api/AuthApi': { verifyEmail },
  });
}

check('one verify request per token, however many callers', async () => {
  let calls = 0;
  const verification = loadVerification(async () => {
    calls += 1;
    return { message: 'Email verified successfully' };
  });
  const [a, b] = await Promise.all([
    verification.verifyEmailTokenOnce('abc123'),
    verification.verifyEmailTokenOnce(' abc123 '),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.status, 'verified');
  assert.equal(b.status, 'verified');
});

check('a network failure is retried; a server answer is not re-asked', async () => {
  let calls = 0;
  const verification = loadVerification(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('Network Error'), { isAxiosError: true });
    throw Object.assign(new Error('bad'), {
      isAxiosError: true,
      response: { status: 400, data: { message: 'Invalid or expired verification link' } },
    });
  });
  const first = await verification.verifyEmailTokenOnce('t1');
  assert.equal(first.status, 'failed');
  assert.equal(first.retryable, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await verification.verifyEmailTokenOnce('t1');
  assert.equal(second.message, 'Invalid or expired verification link');
  assert.equal(second.retryable, false);
  await verification.verifyEmailTokenOnce('t1');
  assert.equal(calls, 2);
});

(async () => {
  const failures = [];
  for (const { name, fn } of checks) {
    try {
      await fn();
    } catch (error) {
      failures.push(`  - ${name}\n    ${String(error && error.message).split('\n')[0]}`);
    }
  }
  if (failures.length) {
    console.error(`app survival contract FAILED:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`app survival contract: ${checks.length} checks passed`);
})();
