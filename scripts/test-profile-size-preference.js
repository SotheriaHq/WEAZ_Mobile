/**
 * The profile shows exactly one size, and never an empty slot.
 *
 * The card used to render a pill per computed category. Reducing it to one
 * introduces a failure the many-pill version could not have: a stored
 * preference that no longer resolves — measurements removed, a chart
 * withdrawn, a category renamed — would leave the profile showing nothing at
 * all. resolveDisplayCategory is what prevents that, so it gets a test.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'features', 'sizing', 'profileSizePreference.ts'),
  'utf8',
);
const out = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({
  useCallback: () => {},
  useEffect: () => {},
  useState: () => [],
}));
const { resolveDisplayCategory } = mod.exports;

const available = [
  { category: 'TOPS' },
  { category: 'BOTTOMS' },
  { category: 'DRESSES' },
];

assert.strictEqual(resolveDisplayCategory('BOTTOMS', available), 'BOTTOMS', 'honours the choice');
assert.strictEqual(
  resolveDisplayCategory(null, available),
  'TOPS',
  'never chosen yet falls back to the first, not to nothing',
);
assert.strictEqual(
  resolveDisplayCategory('SHOES', available),
  'TOPS',
  'a stale preference must not blank the profile',
);
assert.strictEqual(
  resolveDisplayCategory('TOPS', []),
  null,
  'nothing computable means nothing to show',
);
assert.strictEqual(resolveDisplayCategory(null, []), null);

console.log(
  'profile size preference contract passed (choice honoured; stale and unset both fall back; empty stays empty)',
);
