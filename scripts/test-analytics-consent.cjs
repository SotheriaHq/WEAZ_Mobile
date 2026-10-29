// Analytics consent on native: nothing optional runs until the person allows
// it, withdrawing deletes what analytics stored, and error reports carry no
// tokens or ids from addresses. Runs the real modules with in-memory storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(relativePath, mocks) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const requireMock = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`${relativePath} imported ${id}, which this test does not provide`);
  };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, requireMock);
  return mod.exports;
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    map,
    getItem: async (key) => (map.has(key) ? map.get(key) : null),
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
    multiSet: async (pairs) => {
      for (const [key, value] of pairs) map.set(key, value);
    },
    multiRemove: async (keys) => {
      for (const key of keys) map.delete(key);
    },
  };
  return { __esModule: true, default: storage, storage };
}

const react = { useSyncExternalStore: () => null };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const loadConsent = (storageModule) =>
  load('src/privacy/consent.ts', {
    '@react-native-async-storage/async-storage': storageModule,
    react,
  });

async function main() {
  // Addresses in error reports.
  const { telemetryUrl, telemetryPath } = load('src/privacy/telemetryUrl.ts', {});
  assert.equal(
    telemetryUrl('https://api.weaz.me/payments/verify?reference=PAY-123&trxref=x#done'),
    'https://api.weaz.me/payments/verify',
  );
  assert.equal(telemetryUrl('https://user:secret@api.weaz.me/me'), 'https://api.weaz.me/me');
  assert.equal(telemetryPath('/orders/123e4567-e89b-12d3-a456-426614174000'), '/orders/:id');
  assert.equal(telemetryPath('/auth/reset/AbCdEf0123456789AbCdEf0123'), '/auth/reset/:token');
  assert.equal(telemetryPath('/u/ada%40example.com'), '/u/:token');
  assert.equal(telemetryPath('/market/ankara-midi-dress'), '/market/ankara-midi-dress');
  assert.equal(telemetryUrl('/settings/privacy?tab=1'), '/settings/privacy');
  assert.equal(telemetryUrl(''), '');
  assert.equal(telemetryUrl(undefined), '');

  // First launch: nothing allowed while reading, nothing decided after.
  {
    const storage = memoryStorage();
    const consent = loadConsent(storage);
    assert.equal(consent.analyticsPermitted(), false);
    assert.equal(consent.getConsentState().ready, false);
    await consent.loadConsent();
    assert.deepEqual(
      { ready: consent.getConsentState().ready, decided: consent.getConsentState().decided },
      { ready: true, decided: false },
    );
    assert.equal(consent.analyticsPermitted(), false);

    // Allow, then the next launch remembers it.
    consent.saveAnalyticsConsent(true);
    assert.equal(consent.analyticsPermitted(), true);
    await flush();
    const relaunched = loadConsent(memoryStorage(Object.fromEntries(storage.storage.map)));
    assert.equal(relaunched.analyticsPermitted(), false, 'nothing runs before the choice is read');
    await relaunched.loadConsent();
    assert.equal(relaunched.analyticsPermitted(), true);

    // Withdraw.
    relaunched.saveAnalyticsConsent(false);
    assert.equal(relaunched.analyticsPermitted(), false);
    assert.equal(relaunched.getConsentState().decided, true);
  }

  // Expired, outdated and malformed choices ask again.
  {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const { parseConsentRecord } = loadConsent(memoryStorage());
    const record = (overrides) => JSON.stringify({ version: 1, decidedAt: '2026-10-01T00:00:00Z', analytics: true, ...overrides });
    assert.equal(parseConsentRecord(record({}), now).analytics, true);
    assert.equal(parseConsentRecord(record({ decidedAt: '2025-09-01T00:00:00Z' }), now), null);
    assert.equal(parseConsentRecord(record({ version: 0 }), now), null);
    assert.equal(parseConsentRecord(record({ decidedAt: 'not a date' }), now), null);
    assert.equal(parseConsentRecord('{broken', now), null);
    assert.equal(parseConsentRecord(record({ analytics: 'yes' }), now).analytics, false);
  }

  // A choice made while storage is still being read is not overwritten.
  {
    const storage = memoryStorage({
      'wiez.consent': JSON.stringify({ version: 1, decidedAt: new Date().toISOString(), analytics: true }),
    });
    let release;
    const slowStorage = {
      ...storage,
      default: {
        ...storage.storage,
        getItem: (key) => new Promise((resolve) => {
          release = () => resolve(storage.storage.map.get(key) ?? null);
        }),
      },
    };
    const consent = loadConsent(slowStorage);
    const reading = consent.loadConsent();
    consent.saveAnalyticsConsent(false);
    release();
    await reading;
    assert.equal(consent.analyticsPermitted(), false);
  }

  // The analytics id exists only while analytics are allowed.
  {
    let allowed = false;
    const storage = memoryStorage();
    const deviceId = load('src/utils/deviceId.ts', {
      '@react-native-async-storage/async-storage': storage,
      '@/src/privacy/consent': { analyticsPermitted: () => allowed },
    });
    assert.equal(await deviceId.getDeviceId(), null);
    assert.equal(storage.storage.map.has('wiez.device.id.v1'), false);

    allowed = true;
    const id = await deviceId.getDeviceId();
    assert.match(id, /^anon_/);
    assert.equal(deviceId.getCachedDeviceId(), id);
    assert.equal(await deviceId.getDeviceId(), id, 'one id per install');

    await deviceId.clearDeviceId();
    assert.equal(storage.storage.map.has('wiez.device.id.v1'), false);
    allowed = false;
    assert.equal(deviceId.getCachedDeviceId(), null);

    // A read in flight when analytics are withdrawn cannot bring the id back.
    allowed = true;
    const inFlight = deviceId.getDeviceId();
    await deviceId.clearDeviceId();
    assert.equal(await inFlight, null);
    assert.equal(storage.storage.map.has('wiez.device.id.v1'), false);
  }

  // Discovery signals: not recorded or sent until allowed.
  {
    let allowed = false;
    const sent = [];
    const signals = load('src/services/marketSignals.ts', {
      '@react-native-async-storage/async-storage': memoryStorage(),
      'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
      '@/src/privacy/consent': { analyticsPermitted: () => allowed },
      '@/src/utils/deviceId': { getCachedDeviceId: () => 'anon_test', getDeviceId: async () => 'anon_test' },
      '@/src/api/MarketApi': { sendMarketSignalBatch: async (batch) => sent.push(batch) },
    });
    const event = { targetType: 'PRODUCT', targetId: 'p1', signalType: 'OPEN', surface: 'MARKET' };
    signals.trackMarketSignal(event);
    await signals.flushMarketSignals();
    assert.equal(signals.__marketSignalQueueTestUtils.getQueueLength(), 0);
    assert.equal(sent.length, 0);

    allowed = true;
    signals.trackMarketSignal(event);
    await signals.flushMarketSignals();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].anonymousSessionId, 'anon_test');
    assert.equal(sent[0].events.length, 1);
  }

  // Launch without a choice clears data from older versions; withdrawal clears again.
  {
    const cleared = { queue: 0, id: 0 };
    const consent = loadConsent(memoryStorage());
    const effects = load('src/privacy/consentEffects.ts', {
      '@/src/services/marketSignals': { clearMobileMarketSignalQueue: async () => { cleared.queue += 1; } },
      '@/src/utils/deviceId': { clearDeviceId: async () => { cleared.id += 1; } },
      './consent': consent,
    });
    effects.startConsentEffects();
    effects.startConsentEffects();
    await flush();
    assert.deepEqual(cleared, { queue: 1, id: 1 }, 'cleared once, even when started twice');
    consent.saveAnalyticsConsent(true);
    assert.deepEqual(cleared, { queue: 1, id: 1 });
    consent.saveAnalyticsConsent(false);
    assert.deepEqual(cleared, { queue: 2, id: 2 });
  }

  // Wiring: tracing samples only with consent, the prompt is mounted, and push
  // permission stays independent of the analytics choice.
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const sentry = read('src/observability/sentry.ts');
  assert.match(sentry, /tracesSampler: \(\) => \(analyticsPermitted\(\) \? tracesSampleRate : 0\)/);
  assert.doesNotMatch(sentry, /tracesSampleRate:\s/);
  assert.match(sentry, /sendDefaultPii: false/);
  assert.match(sentry, /beforeBreadcrumb/);
  const layout = read('app/_layout.tsx');
  assert.match(layout, /startConsentEffects\(\);/);
  assert.match(layout, /<AnalyticsConsentSheet \/>/);
  for (const file of fs.readdirSync(path.join(root, 'src', 'notifications'))) {
    assert.doesNotMatch(read(path.join('src', 'notifications', file)), /privacy\/consent/, `${file} must not depend on analytics consent`);
  }

  console.log('Analytics consent checks passed: launch, allow, reject, withdraw, expiry, races and wiring.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
