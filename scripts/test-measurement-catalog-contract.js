/**
 * Behavioural tests for the measurement catalog.
 *
 * The thing this module exists to prevent is invisible when it breaks: a
 * profile that quietly lists one body three times, or a measurement that stops
 * counting toward "6/8 sizing points" because an alias went missing and it got
 * filed as a garment-specific extra. Source-text assertions cannot see either,
 * so these run the real functions over the real shape the server sends.
 *
 * The last section checks the mobile alias table against the backend's, which
 * is the actual drift risk — they live in separate repos and there is nothing
 * but this test to notice when one gains a key the other does not.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectRoot = path.join(__dirname, '..');
const moduleCache = new Map();

function loadTsModule(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (moduleCache.has(resolvedPath)) return moduleCache.get(resolvedPath).exports;

  const source = fs.readFileSync(resolvedPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: resolvedPath,
  });
  const moduleShim = { exports: {} };
  moduleCache.set(resolvedPath, moduleShim);
  const localRequire = (request) => {
    if (request.startsWith('@/')) return loadTsModule(path.join(projectRoot, request.slice(2) + '.ts'));
    if (request.startsWith('.')) return loadTsModule(path.join(path.dirname(resolvedPath), request + '.ts'));
    return require(request);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled.outputText);
  evaluate(moduleShim.exports, localRequire, moduleShim, resolvedPath, path.dirname(resolvedPath));
  return moduleShim.exports;
}

const catalog = loadTsModule(
  path.join(projectRoot, 'src/features/sizing/measurementCatalog.ts'),
);

const {
  CORE_MEASUREMENT_SLOTS,
  CORE_MEASUREMENT_KEYS,
  collapseMeasurements,
  convertMeasurementValues,
  formatMeasurementLabel,
  resolveCoreMeasurementKey,
  readMeasurementScalar,
} = catalog;

// ── The eight are the eight ────────────────────────────────────────────────
assert.strictEqual(
  CORE_MEASUREMENT_SLOTS.length,
  8,
  'the core set is what SizeComputationService weighs — eight canonical points',
);
assert.deepStrictEqual(
  [...CORE_MEASUREMENT_KEYS],
  ['HEIGHT', 'CHEST_BUST', 'WAIST', 'HIP_SEAT', 'SHOULDER', 'SLEEVE_LENGTH', 'INSEAM', 'NECK_COLLAR'],
  'core keys must match the backend CANONICAL_KEYS, in order',
);
for (const slot of CORE_MEASUREMENT_SLOTS) {
  assert.ok(slot.label && slot.label.trim(), `${slot.key} needs a label`);
  assert.ok(
    slot.hint && slot.hint.trim(),
    `${slot.key} needs a hint — a bare tailoring label leaves a shopper to guess, and a wrong guess is worse than a blank`,
  );
  assert.doesNotMatch(
    slot.label,
    /^(MEN|WOMEN)[ _]/i,
    'labels must not carry gender prefixes; the brand already chose who the design is for',
  );
}

// ── The fan-out collapses to one row per measurement ───────────────────────
/*
  This is the exact shape reported from a real profile: eight measurements
  stored under nineteen keys, which the profile rendered as nineteen rows —
  "Height 182" twice, "Chest Bust 45" beside "Chest Full Bust 45", "Hip 26"
  beside "Hip Seat 26".
*/
const fannedOut = {
  HEIGHT: 182,
  MEN_HEIGHT: 182,
  CHEST_BUST: 45,
  CHEST_FULL_BUST: 45,
  MEN_CHEST: 45,
  WAIST: 56,
  MEN_WAIST: 56,
  HIP: 26,
  HIP_SEAT: 26,
  SHOULDER: 59,
  INSEAM: 85,
  MEN_INSEAM: 85,
  NECK: 46,
  NECK_COLLAR: 46,
  SLEEVE_LENGTH_LONG: 62,
  THIGH: 54,
  WRIST: 17,
};

const collapsed = collapseMeasurements(fannedOut);

assert.strictEqual(
  collapsed.coreSavedCount,
  8,
  'all eight core points are present in the fan-out and must all be counted once',
);
assert.deepStrictEqual(
  collapsed.missingCoreKeys,
  [],
  'nothing is missing from this profile',
);
assert.strictEqual(collapsed.core.HEIGHT, '182');
assert.strictEqual(collapsed.core.CHEST_BUST, '45');
assert.strictEqual(collapsed.core.HIP_SEAT, '26');
assert.strictEqual(
  collapsed.core.SLEEVE_LENGTH,
  '62',
  'SLEEVE_LENGTH_LONG is the key the sizing sheet actually writes and must resolve',
);
assert.strictEqual(collapsed.core.NECK_COLLAR, '46');

assert.deepStrictEqual(
  collapsed.extras.map((entry) => entry.label),
  ['Thigh', 'Wrist'],
  'only genuinely garment-specific points are extras — everything else is a duplicate of a core point',
);

const totalRows = collapsed.coreSavedCount + collapsed.extras.length;
assert.strictEqual(
  totalRows,
  10,
  `nineteen stored keys must render as ten rows, not ${totalRows}`,
);

// Labels must be distinguishable — two rows a shopper cannot tell apart is the bug.
const allLabels = [
  ...CORE_MEASUREMENT_KEYS.filter((key) => collapsed.core[key]).map((key) => formatMeasurementLabel(key)),
  ...collapsed.extras.map((entry) => entry.label),
];
assert.strictEqual(
  new Set(allLabels).size,
  allLabels.length,
  `duplicate labels rendered: ${allLabels.join(', ')}`,
);

// ── Priority: canonical wins, exactly as the server resolves it ────────────
assert.strictEqual(
  collapseMeasurements({ CHEST: 40, MEN_CHEST: 42, CHEST_BUST: 45 }).core.CHEST_BUST,
  '45',
  'canonical beats registry beats alias, mirroring the server entryPriority — a stale alias must not win',
);
assert.strictEqual(
  collapseMeasurements({ CHEST: 40, MEN_CHEST: 42 }).core.CHEST_BUST,
  '42',
  'with no canonical key present, the registry key wins over the loose alias',
);

// ── Values ────────────────────────────────────────────────────────────────
assert.strictEqual(readMeasurementScalar({ value: 91.4, unit: 'CM' }), '91.4', 'object-shaped values must read');
assert.strictEqual(readMeasurementScalar('56'), '56');
assert.strictEqual(readMeasurementScalar(0), null, 'zero is not a measurement');
assert.strictEqual(readMeasurementScalar(''), null);
assert.strictEqual(readMeasurementScalar(null), null);
assert.strictEqual(readMeasurementScalar(true), null, 'a boolean is not a measurement');
assert.strictEqual(
  collapseMeasurements({ HEIGHT: 0, WAIST: '' }).coreSavedCount,
  0,
  'blank and zero values must not count toward the saved total',
);
assert.strictEqual(
  collapseMeasurements({ _gender: 'MEN', HEIGHT: 182 }).extras.length,
  0,
  'underscore-prefixed metadata is not a measurement',
);
assert.strictEqual(
  collapseMeasurements(null).coreSavedCount,
  0,
  'a profile with no measurements must not throw',
);

// ── Unit toggle converts, it does not reinterpret ──────────────────────────
/*
  Scalars carry no unit marker; `preferredLengthUnit` is the only thing that
  says what "182" means. Flipping the toggle without converting redefines a
  182cm shopper as 182 INCHES, which the server then multiplies by 2.54 into a
  four-and-a-half-metre body.
*/
const inches = convertMeasurementValues({ HEIGHT: '182', WAIST: '' }, 'CM', 'IN');
assert.strictEqual(inches.HEIGHT, '71.7', '182cm is 71.7in');
assert.strictEqual(inches.WAIST, '', 'blank fields stay blank');
assert.strictEqual(
  convertMeasurementValues({ HEIGHT: '71.7' }, 'IN', 'CM').HEIGHT,
  '182.1',
  'the conversion round-trips within rounding',
);
assert.strictEqual(
  convertMeasurementValues({ HEIGHT: '182' }, 'CM', 'CM').HEIGHT,
  '182',
  'a no-op toggle must not touch the values',
);

// ── Drift check against the backend's own table ────────────────────────────
/*
  The alias table is a deliberate duplicate of
  `bthreadly/src/sizing/measurement-normalization.service.ts` — separate repos,
  so it cannot be imported. An alias added there and not here means a
  measurement the server understands renders as a stray extra row on the
  profile and stops counting toward the core total.

  Skipped when the backend is not checked out beside this repo (mobile CI clones
  only its own repo), because a test that fails on a missing sibling is a test
  people learn to ignore.
*/
const backendNormalizer = path.join(
  projectRoot,
  '..',
  'bthreadly',
  'src',
  'sizing',
  'measurement-normalization.service.ts',
);

if (!fs.existsSync(backendNormalizer)) {
  console.log('measurement catalog contract passed (backend drift check skipped — bthreadly not checked out)');
} else {
  const backendSource = fs.readFileSync(backendNormalizer, 'utf8');

  const canonicalBlock = backendSource.match(
    /const CANONICAL_KEYS: CanonicalMeasurementKey\[\] = \[([\s\S]*?)\];/,
  );
  assert.ok(canonicalBlock, 'could not read CANONICAL_KEYS from the backend normalizer');
  const backendCanonical = [...canonicalBlock[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
  assert.deepStrictEqual(
    [...CORE_MEASUREMENT_KEYS],
    backendCanonical,
    'the mobile core set has drifted from the backend CANONICAL_KEYS',
  );

  const aliasBlock = backendSource.match(
    /const ALIASES: Record<string, CanonicalMeasurementKey> = \{([\s\S]*?)\n\};/,
  );
  assert.ok(aliasBlock, 'could not read ALIASES from the backend normalizer');
  const backendAliases = [...aliasBlock[1].matchAll(/^\s*([A-Z0-9]+):\s*'([A-Z_]+)',/gm)];
  assert.ok(backendAliases.length > 40, 'backend alias table parsed suspiciously small');

  const drifted = [];
  for (const [, aliasKey, canonicalKey] of backendAliases) {
    const resolved = resolveCoreMeasurementKey(aliasKey);
    if (resolved !== canonicalKey) {
      drifted.push(`${aliasKey} -> expected ${canonicalKey}, mobile resolves ${resolved}`);
    }
  }
  assert.deepStrictEqual(
    drifted,
    [],
    `mobile alias table has drifted from the backend:\n  ${drifted.join('\n  ')}`,
  );

  console.log(
    `measurement catalog contract passed (${backendAliases.length} backend aliases verified)`,
  );
}
