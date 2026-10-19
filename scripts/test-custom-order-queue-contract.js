const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, stubs = {}, transform = (source) => source) {
  const source = transform(fs.readFileSync(file, 'utf8'));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((id) => {
    if (id in stubs) return stubs[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

const localFile = path.join(root, 'src/features/orders/customOrderQueuePresentation.ts');
const local = load(localFile);
const now = Date.parse('2026-10-18T12:00:00.000Z');
const hour = 3600000;
const deadline = (offset) => new Date(now + offset).toISOString();
const countdownCases = [
  [null, null], ['invalid', null], [deadline(0), 'Cancellation due - refreshing from WIEZ'],
  [deadline(-1), 'Cancellation due - refreshing from WIEZ'],
  [deadline(42 * 24 * hour), 'Cancels in 42d 0h'],
  [deadline(48 * hour), 'Cancels in 2d 0h'],
  [deadline(48 * hour - 1), 'Cancels in 48h 0m'],
  [deadline(12 * hour), 'Cancels in 12h 0m'],
  [deadline(1), 'Cancels in 0h 1m'],
];
const waiting = { lane: 'PENDING', canRetain: true, retainOpensAt: deadline(-hour), retainClosesAt: deadline(hour) };
const retainCases = [
  [waiting, now, true], [{ ...waiting, lane: 'UP_NEXT' }, now, true],
  [waiting, now - hour, true], [waiting, now + hour, true],
  [waiting, now - hour - 1, false], [waiting, now + hour + 1, false],
  [{ ...waiting, canRetain: false }, now, false],
  [{ ...waiting, lane: 'ACTIVE' }, now, false], [{ ...waiting, lane: null }, now, false],
  [{ ...waiting, retainOpensAt: 'bad' }, now, false], [waiting, NaN, false], [null, now, false],
];
function verifyPresentation(presentation) {
  assert.equal(presentation.nextQueueClockDelay(now, []), 60000, 'idle countdown updates once a minute');
  assert.equal(presentation.nextQueueClockDelay(now, [now - 1, now + 120000]), 60000, 'past boundaries cannot create a busy loop');
  assert.equal(presentation.nextQueueClockDelay(now, [now + 1234]), 1234, 'retain and expiry boundaries wake the single clock exactly');
  assert.equal(presentation.nextQueueClockDelay(now, [now + 1]), 1, 'inclusive retain close advances at the following millisecond');
  for (const [expiry, expected] of countdownCases) assert.equal(presentation.formatQueueCountdown(expiry, now), expected, `countdown ${expiry}`);
  for (const [queue, time, expected] of retainCases) assert.equal(presentation.canRetainQueue(queue, time), expected, `retain ${JSON.stringify(queue)} at ${time}`);
}
verifyPresentation(local);
const sibling = path.resolve(root, '../fthreadly/src/features/orders/customOrderQueuePresentation.ts');
if (fs.existsSync(sibling)) {
  verifyPresentation(load(sibling));
  // A regression in the sibling's inclusive close boundary must fail this guard.
  const drifted = load(sibling, {}, (source) => source.replace(/now\s*<=\s*closes/g, 'now < closes'));
  assert.throws(() => verifyPresentation(drifted), assert.AssertionError);
  console.log('Web/native queue decisions agree; inclusive-boundary drift is detected.');
} else console.log('SKIP sibling comparison: frontend checkout is not present.');

const snapshots = load(path.join(root, 'src/features/orders/queueSnapshotStore.ts'));
const confirmedQueue = { orderRevision: 4, serverNow: new Date(now + 1000).toISOString(), queueExpiresAt: deadline(42 * 24 * hour) };
snapshots.acceptQueueSnapshot('one', confirmedQueue);
assert.equal(snapshots.acceptQueueSnapshot('one', { ...confirmedQueue, orderRevision: 3 }), confirmedQueue, 'slow detail response cannot erase a confirmed retain');
assert.equal(snapshots.acceptQueueSnapshot('one', { ...confirmedQueue, serverNow: new Date(now).toISOString() }), confirmedQueue, 'older equal-revision presentation cannot erase current eligibility');
snapshots.clearQueueSnapshots();
assert.equal(snapshots.acceptQueueSnapshot('one', null), null, 'sign-out must release cached queue facts');
for (let index = 0; index <= 200; index++) snapshots.acceptQueueSnapshot(String(index), confirmedQueue);
assert.equal(snapshots.acceptQueueSnapshot('0', null), null, 'snapshot storage must stay bounded');
snapshots.clearQueueSnapshots();

const revisions = load(path.join(root, 'src/features/orders/orderRevision.ts'));
const newer = { id: 'one', queue: { orderRevision: 4, queueExpiresAt: deadline(42 * 24 * hour) } };
const stale = { id: 'one', queue: { orderRevision: 3, queueExpiresAt: deadline(hour) } };
assert.equal(revisions.applyOrderSummaryUpdate([newer], stale)[0], newer, 'old response must not erase retained deadline');
assert.equal(revisions.applyOrderSummaryUpdate([newer], { id: 'one' })[0], newer, 'legacy response must not erase queue data');
assert.equal(revisions.applyOrderSummaryUpdate([stale], newer)[0], newer, 'confirmed retain updates immediately');
let emissions = 0;
const unsubscribe = revisions.subscribeOrderChanges(() => emissions++);
revisions.markOrdersChanged(); unsubscribe(); revisions.markOrdersChanged();
assert.equal(emissions, 1, 'unmounted histories must release subscriptions');

(async () => {
  const calls = [];
  const api = load(path.join(root, 'src/api/CustomOrderQueueApi.ts'), {
    './httpClient': { apiClient: {
      get: async (url) => { calls.push({ method: 'GET', url }); return { data: { data: { orderRevision: 9 } } }; },
      post: async (url, body) => { calls.push({ method: 'POST', url, body }); return { data: { data: { queue: { orderRevision: 10 }, orders: {} } } }; },
    } },
  }).CustomOrderQueueApi;
  assert.equal((await api.quote('order')).orderRevision, 9);
  await api.cancel('order', 9, 'Changed plans');
  await api.retain('order', 10);
  await api.resubmit('order');
  await api.summaries(['one', 'two']);
  assert.deepEqual(calls[1].body, { expectedRevision: 9, reason: 'Changed plans' }, 'cancellation must carry quoted revision');
  assert.deepEqual(calls[2].body, { expectedRevision: 10 }, 'retention must carry current revision');
  assert.equal(calls[3].url, '/custom-orders/queue/orders/order/resubmit');
  assert.deepEqual(calls[4].body, { orderIds: ['one', 'two'] }, 'queue summaries must use a batch');
  console.log(`Custom-order queue contract passed: ${countdownCases.length + retainCases.length} presentation cases, revision races, and server action contracts.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
