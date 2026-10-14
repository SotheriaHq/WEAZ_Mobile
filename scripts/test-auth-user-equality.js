/*
  Behavioural test of the real `authUserEquality` module.

  Transpiled with the TypeScript compiler API and executed, so what runs is the
  shipped source rather than a hand-copied or regex-stripped imitation of it.

  This test is the reason the fix does not need a device capture to be believed.
  The loop it closes was traced over four captures:

    causes=P:Auth:user+value+sessionValue×24
    userSet=updateUser:patched×24
    requests=0 responses=0 paths=none

  `updateUser` compared the incoming patch against the current user BY
  REFERENCE, and normalisation mints identities — `normalizeAuthFile` returns a
  fresh `{ id, s3Url, url }`, `normalizeBrandMemberships` a fresh array — so the
  guard could never fire. The case named "the real case" below is exactly that
  pair, and it is the one that has to return true.

  The asymmetry is what this file mostly exists to protect: saying "different"
  when two users are equal costs one render; saying "same" when they differ
  strands the UI on stale identity. Every case is marked with which direction a
  failure would be.
*/
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/auth/authUserEquality.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const moduleScope = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('exports', 'module', outputText)(moduleScope.exports, moduleScope);
const { isEquivalentAuthUser, AUTH_USER_COMPARE_MAX_DEPTH } = moduleScope.exports;

assert.equal(typeof isEquivalentAuthUser, 'function', 'module exports the comparator');
assert.equal(AUTH_USER_COMPARE_MAX_DEPTH, 4, 'depth limit is the documented one');

const shared = { id: 'f1' };
const cases = [
  // name, a, b, expected, which direction a failure goes
  ['identical reference', shared, shared, true, 'redundant render'],
  ['equal primitives', { a: 1, b: 'x' }, { a: 1, b: 'x' }, true, 'redundant render'],
  ['a primitive changed', { a: 1 }, { a: 2 }, false, 'STALE UI'],

  // The defect this module was written for.
  ['the real case: rebuilt image file, equal contents',
    { profileImageFile: { id: 'f1', s3Url: 'u', url: 'u' } },
    { profileImageFile: { id: 'f1', s3Url: 'u', url: 'u' } }, true, 'THE LOOP RETURNS'],
  ['rebuilt image file, url changed',
    { profileImageFile: { id: 'f1', s3Url: 'u', url: 'u' } },
    { profileImageFile: { id: 'f1', s3Url: 'u', url: 'v' } }, false, 'STALE UI'],
  ['rebuilt memberships array, equal contents',
    { brandMemberships: [{ brandId: 'b', role: 'OWNER', status: 'ACTIVE' }] },
    { brandMemberships: [{ brandId: 'b', role: 'OWNER', status: 'ACTIVE' }] }, true, 'THE LOOP RETURNS'],
  ['membership status ACTIVE -> REMOVED',
    { brandMemberships: [{ brandId: 'b', role: 'OWNER', status: 'ACTIVE' }] },
    { brandMemberships: [{ brandId: 'b', role: 'OWNER', status: 'REMOVED' }] }, false, 'STALE UI'],
  ['membership added', { brandMemberships: [] }, { brandMemberships: [{ brandId: 'b' }] }, false, 'STALE UI'],
  ['membership removed', { brandMemberships: [{ brandId: 'b' }] }, { brandMemberships: [] }, false, 'STALE UI'],

  ['both null', null, null, true, 'redundant render'],
  ['null vs object', null, { a: 1 }, false, 'STALE UI'],
  ['object vs null', { a: 1 }, null, false, 'STALE UI'],
  ['extra key on the right', { a: 1 }, { a: 1, b: 2 }, false, 'STALE UI'],
  ['extra key on the left', { a: 1, b: 2 }, { a: 1 }, false, 'STALE UI'],
  ['value becomes null', { a: 'x' }, { a: null }, false, 'STALE UI'],
  ['value becomes undefined', { a: 'x' }, { a: undefined }, false, 'STALE UI'],
  ['array vs object', { a: [] }, { a: {} }, false, 'STALE UI'],
  ['array order changed', { a: [1, 2] }, { a: [2, 1] }, false, 'STALE UI'],
  ['nested within the depth limit', { a: { b: { c: 1 } } }, { a: { b: { c: 1 } } }, true, 'redundant render'],

  // Deliberate refusals: it does not claim to understand these, so it must say
  // "different" and let the update through.
  ['a Date is not understood', { a: new Date(0) }, { a: new Date(0) }, false, 'redundant render'],
  ['a Map is not understood', { a: new Map() }, { a: new Map() }, false, 'redundant render'],
  ['a class instance is not understood',
    { a: new (class { constructor() { this.v = 1; } })() },
    { a: new (class { constructor() { this.v = 1; } })() }, false, 'redundant render'],
  ['past the depth limit it refuses',
    { a: { b: { c: { d: { e: 1 } } } } }, { a: { b: { c: { d: { e: 1 } } } } }, false, 'redundant render'],

  ['NaN equals NaN, per Object.is', { a: NaN }, { a: NaN }, true, 'redundant render'],
  ['0 and -0 differ, per Object.is', { a: 0 }, { a: -0 }, false, 'redundant render'],
];

let failures = 0;
let unsafe = 0;
for (const [name, a, b, expected, direction] of cases) {
  const got = isEquivalentAuthUser(a, b);
  if (got === expected) continue;
  failures += 1;
  if (got === true && expected === false) unsafe += 1;
  console.error(`  FAIL  ${name}: expected ${expected}, got ${got}  [failure means: ${direction}]`);
}

/*
  The loop, reproduced.

  `updateUser` is called repeatedly with a patch whose values are stable, and
  each pass rebuilds the nested objects the way normalisation does. Before the
  fix this never converged; it must now settle on the FIRST pass and hold the
  same object identity forever after.
*/
const rebuild = (u) => ({
  ...u,
  profileImageFile: { id: 'f1', s3Url: 'u', url: 'u' },
  brandMemberships: [{ brandId: 'b', role: 'OWNER', status: 'ACTIVE' }],
});
let settled = { id: 'u1', firstName: 'A', profileImageFile: { id: 'f1', s3Url: 'u', url: 'u' }, brandMemberships: [{ brandId: 'b', role: 'OWNER', status: 'ACTIVE' }] };
const identities = new Set();
for (let pass = 0; pass < 25; pass += 1) {
  const produced = rebuild(settled);
  if (!isEquivalentAuthUser(settled, produced)) settled = produced;
  identities.add(settled);
}
if (identities.size !== 1) {
  failures += 1;
  console.error(`  FAIL  25 no-op updates produced ${identities.size} distinct users (must be 1)`);
}

// And a real change must still land, or the fix would be a freeze.
const changed = { ...settled, firstName: 'B' };
if (isEquivalentAuthUser(settled, changed)) {
  failures += 1;
  unsafe += 1;
  console.error('  FAIL  a real change was suppressed');
}

if (failures > 0) {
  console.error(`Auth user equality: ${failures} of ${cases.length + 2} checks failed`);
  if (unsafe > 0) console.error(`*** ${unsafe} UNSAFE (claimed equal when different) ***`);
  process.exit(1);
}
console.log(`Auth user equality: ${cases.length + 2} checks passed (25 no-op updates converged to 1 identity)`);
