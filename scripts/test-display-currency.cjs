// Display currency on native: suggested from the edge country, overridden by the
// person's choice, Naira when rates are unavailable, and charges never change.
// Runs the real module and money formatter with in-memory storage and fakes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(relativePath, mocks) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireMock = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`${relativePath} imported ${id}, which this test does not provide`);
  };
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, requireMock);
  return mod.exports;
}

const money = load('src/utils/money.ts', {});

function setup({ stored = null, country = 'GB', fail = false, displayCurrency = 'GBP' } = {}) {
  const map = new Map(stored ? [['wiez.displayCurrency.v1', stored]] : []);
  const storage = {
    getItem: async (key) => (map.has(key) ? map.get(key) : null),
    setItem: async (key, value) => void map.set(key, value),
    removeItem: async (key) => void map.delete(key),
  };
  const calls = { api: [], fetch: [] };
  global.fetch = async (url) => {
    calls.fetch.push(url);
    return { ok: true, json: async () => ({ country }) };
  };
  const apiClient = {
    get: async (url, config) => {
      calls.api.push([url, config.params]);
      if (fail) throw new Error('503');
      const chosen = config.params.currency ?? displayCurrency;
      return {
        data: {
          data: {
            baseCurrency: 'NGN', chargeCurrency: 'NGN', displayCurrency: chosen, countryCode: country,
            needsCurrencyChoice: false, isStale: false,
            rates: { NGN: { rate: 1, asOf: '2026-10-27' }, GBP: { rate: 0.00055, asOf: '2026-10-27' }, USD: { rate: 0.000735, asOf: '2026-10-27' } },
          },
        },
      };
    },
  };
  const currency = load('src/currency/displayCurrency.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    react: { useEffect: () => undefined, useSyncExternalStore: () => null },
    '@/src/api/httpClient': { apiClient },
    '@/src/config/env': { env: { webAppUrl: 'https://weaz.test/' } },
    '@/src/utils/money': money,
  });
  return { currency, calls, map };
}

async function main() {
  {
    const { currency, calls } = setup();
    await currency.ensureDisplayCurrency();
    assert.deepEqual(calls.fetch, ['https://weaz.test/api/location']);
    assert.deepEqual(calls.api, [['/payment/fx/display', { country: 'GB' }]]);
    const state = currency.getDisplayCurrencyState();
    assert.equal(currency.foreignDisplayCurrency(state), 'GBP');
    assert.equal(currency.estimateInDisplayCurrency(state, 50000, 'NGN'), '£27.50');
    assert.equal(currency.estimateInDisplayCurrency(state, 500000, 'NGN'), '£275');
    assert.equal(currency.estimateInDisplayCurrency(state, 50, 'NGN'), '£0.03');
    assert.equal(currency.estimateInDisplayCurrency(state, 50000, 'USD'), null, 'only Naira prices are estimated');
    assert.equal(currency.estimateInDisplayCurrency(state, 0, 'NGN'), null);
    await currency.ensureDisplayCurrency();
    assert.equal(calls.api.length, 1, 'rates are reused for an hour');
  }

  {
    const { currency, calls, map } = setup({ stored: 'USD' });
    await currency.ensureDisplayCurrency();
    assert.deepEqual(calls.fetch, [], 'a chosen currency never asks for the country');
    assert.deepEqual(calls.api, [['/payment/fx/display', { currency: 'USD' }]]);
    await currency.setDisplayCurrencyPreference('GBP');
    assert.equal(map.get('wiez.displayCurrency.v1'), 'GBP');
    await currency.setDisplayCurrencyPreference('AUTO');
    assert.equal(map.has('wiez.displayCurrency.v1'), false);
  }

  {
    const { currency } = setup({ fail: true });
    await currency.ensureDisplayCurrency();
    const state = currency.getDisplayCurrencyState();
    assert.equal(currency.foreignDisplayCurrency(state), null);
    assert.equal(currency.estimateInDisplayCurrency(state, 50000, 'NGN'), null, 'Naira only without rates');
  }

  {
    const { currency } = setup({ country: 'NG', displayCurrency: 'NGN' });
    await currency.ensureDisplayCurrency();
    assert.equal(currency.foreignDisplayCurrency(currency.getDisplayCurrencyState()), null);
  }

  // Naira formatting is unchanged by the new symbols.
  assert.equal(money.formatMoney(40000), '₦40,000');
  assert.equal(money.formatMoney(12.5, 'GHS', { withDecimals: true }), 'GH₵12.50');

  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('components/bagging/MyBagSheet.tsx'), /<CurrencyChargeNote \/>/);
  assert.match(read('src/features/checkout/MobileCheckoutScreen.tsx'), /<CurrencyChargeNote \/>/);
  assert.match(read('app/settings.tsx'), /\/settings\/currency/);

  console.log('Display currency checks passed: country suggestion, choice, fallback, estimates and wiring.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
