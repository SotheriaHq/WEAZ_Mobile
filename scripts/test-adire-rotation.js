const assert = require('node:assert/strict');
const path = require('node:path');

const { createScriptRequire } = require('./helpers/mobile-script-require');

const repoRoot = path.resolve(__dirname, '..');

function loadAdire() {
  const scriptRequire = createScriptRequire({ repoRoot, mocks: {} });
  return scriptRequire('@/src/features/market/adire');
}

function main() {
  const {
    ADIRE_BASE_EXPOSURE_CAP,
    adireMatchReason,
    buildAdireBatch,
    createAdireBatchState,
    exposureCapFor,
    filterAdireItems,
    matchesAdire,
  } = loadAdire();

  // ── Matching is a claim about the item, not a mention of the word ────────
  assert.equal(adireMatchReason({ tags: ['adire', 'casual'] }), 'classification');
  assert.equal(adireMatchReason({ category: { name: 'Adire' } }), 'classification');
  assert.equal(adireMatchReason({ fabric: 'Adire cotton' }), 'classification');
  assert.equal(adireMatchReason({ title: 'Adire Casual Shirt' }), 'title');
  assert.equal(adireMatchReason({ product: { tags: ['Adire'] } }), 'classification');

  // A passing reference in prose must NOT qualify — this is the whole point of
  // the section being trustworthy.
  assert.equal(adireMatchReason({ description: 'Pairs beautifully with adire' }), null);
  assert.equal(adireMatchReason({ title: 'Plain tee', description: 'not adire' }), null);
  // Word boundary: no substring false positives.
  assert.equal(adireMatchReason({ tags: ['adiredress-lookalike-fabricadire'] }), null);
  assert.equal(matchesAdire({ tags: ['ankara'] }), false);

  assert.equal(filterAdireItems([{ tags: ['adire'] }, { tags: ['lace'] }]).length, 1);

  // ── Exposure caps ────────────────────────────────────────────────────────
  assert.equal(exposureCapFor({ purchaseCount: 0 }), ADIRE_BASE_EXPOSURE_CAP);
  // Any sales at all: base 2 + bonus 2 = 4 appearances.
  assert.equal(exposureCapFor({ purchaseCount: 1 }), 4);
  assert.equal(exposureCapFor({ purchaseCount: 4 }), 4);
  // Then one more per five purchases.
  assert.equal(exposureCapFor({ purchaseCount: 5 }), 5);
  assert.equal(exposureCapFor({ purchaseCount: 20 }), 8);

  // ── Rotation: nothing appears a third time while anything is unshown ─────
  const pool = Array.from({ length: 10 }, (_, index) => ({
    key: `item-${index}`,
    tags: ['adire'],
  }));
  const state = createAdireBatchState();
  const keyOf = (entry) => entry.key;

  const first = buildAdireBatch(pool, keyOf, state, 4);
  const second = buildAdireBatch(pool, keyOf, state, 4);
  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  // Ten items, eight slots: no overlap yet.
  const seen = new Set([...first, ...second].map(keyOf));
  assert.equal(seen.size, 8);

  // Drain until every item is at its cap of 2, then confirm the cap held.
  const drainState = createAdireBatchState();
  for (let i = 0; i < 5; i += 1) buildAdireBatch(pool, keyOf, drainState, 4);
  Object.values(drainState.shownCounts).forEach((count) => {
    assert.equal(count, 2, 'every item should sit exactly at the base cap');
  });

  // ── Top-up: a short batch is filled rather than shipped half-empty ───────
  const tinyPool = [
    { key: 'a', tags: ['adire'] },
    { key: 'b', tags: ['adire'] },
  ];
  const tinyState = createAdireBatchState();
  const batchA = buildAdireBatch(tinyPool, keyOf, tinyState, 4);
  // Only two items exist; both are under cap, so the batch is what there is.
  assert.equal(batchA.length, 2);
  const batchB = buildAdireBatch(tinyPool, keyOf, tinyState, 4);
  assert.equal(batchB.length, 2);
  // Both are now at cap. The next batch must still return content (top-up),
  // rather than an empty row.
  const batchC = buildAdireBatch(tinyPool, keyOf, tinyState, 4);
  assert.equal(batchC.length, 2, 'over-cap items should top up rather than leave a gap');

  console.log('Adire rotation tests passed.');
}

main();
