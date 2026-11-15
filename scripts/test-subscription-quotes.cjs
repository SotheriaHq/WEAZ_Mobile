const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const wire = { quoteId: '11111111-1111-4111-8111-111111111111', serverNow: '2026-11-02T12:00:00.000Z',
  expiresAt: '2026-11-02T12:05:00.000Z', kind: 'INITIAL', amountNgn: 10000, effectiveAt: '2026-11-02T12:00:00.000Z', periodEnd: '2026-12-02T12:00:00.000Z' };
function fixture(payload = wire) {
  const clock = { now: 1000 }, requests = [], cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/api', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    }).outputText;
    const requireStub = (id) => {
      if (id === './subscriptionQuote') return load('subscriptionQuote.ts');
      if (id === '@/src/legal/legalDocuments') return { LEGAL_PAGE_VERSION: 'fixture-legal-version' };
      if (id === './httpClient') return { apiClient: { post: async (url, body) => {
        requests.push({ url, body }); clock.now += 300;
        return { data: { data: url.endsWith('/preview') ? payload : { action: 'PAYMENT_REQUIRED', reference: 'fixture-reference' } } };
      } } };
      throw new Error(`Unexpected dependency: ${id}`);
    };
    class WrongWallClock extends Date { static now() { return Date.parse('2040-01-01T00:00:00Z'); } }
    vm.runInNewContext(source, { exports: module.exports, module, require: requireStub,
      performance: { now: () => clock.now }, Date: WrongWallClock, Error, Number, Math });
    cache.set(file, module.exports); return module.exports;
  }
  return { api: load('SubscriptionApi.ts').SubscriptionApi, timing: load('subscriptionQuote.ts'), clock, requests };
}
test('preview validity uses server timing and includes request latency despite a wrong device clock', async () => {
  const f = fixture(), quote = await f.api.preview('brand-a', 'THREAD');
  assert.equal(f.timing.subscriptionQuoteRemainingMs(quote), 299700);
  assert.equal(quote.brandId, 'brand-a');
});
test('checkout sends the exact quote identifier, amount and recurring consent', async () => {
  const f = fixture(), quote = await f.api.preview('brand-a', 'THREAD');
  await f.api.checkout('brand-a', 'THREAD', quote, 'https://example.invalid/billing');
  assert.equal(f.requests[1].body.quoteId, wire.quoteId);
  assert.equal(f.requests[1].body.expectedAmountNgn, wire.amountNgn);
  assert.equal(f.requests[1].body.recurringConsent, true);
  assert.equal(f.requests[1].body.legalVersion, 'fixture-legal-version');
});
test('checkout and card change send the policy version the owner agreed to', async () => {
  const f = fixture(), quote = await f.api.preview('brand-a', 'THREAD');
  await f.api.checkout('brand-a', 'THREAD', quote, 'https://example.invalid/billing', undefined, 'server-legal-version');
  await f.api.changeCard('brand-a', 'card-a', 'server-legal-version');
  assert.equal(f.requests[1].body.legalVersion, 'server-legal-version');
  assert.equal(f.requests[2].body.legalVersion, 'server-legal-version');
  assert.equal(f.requests[2].body.recurringConsent, true);
});
test('an expired quote never sends a checkout HTTP request', async () => {
  const f = fixture(), quote = await f.api.preview('brand-a', 'THREAD');
  f.clock.now = quote.validUntilMonotonicMs;
  await assert.rejects(() => f.api.checkout('brand-a', 'THREAD', quote, 'https://example.invalid'), /fresh price/);
  assert.equal(f.requests.length, 1);
});
test('another brand cannot reuse the locally held quote', async () => {
  const f = fixture(), quote = await f.api.preview('brand-a', 'THREAD');
  await assert.rejects(() => f.api.checkout('brand-b', 'THREAD', quote, 'https://example.invalid'), /fresh price/);
  assert.equal(f.requests.length, 1);
});
test('missing and malformed server quotes have no silent checkout fallback', async () => {
  for (const payload of [null, { ...wire, quoteId: undefined }, { ...wire, expiresAt: 'invalid' }, { ...wire, expiresAt: wire.serverNow }]) {
    const f = fixture(payload);
    await assert.rejects(() => f.api.preview('brand-a', 'THREAD'), /fresh price/);
    assert.equal(f.requests.length, 1);
  }
});
