/**
 * Flags are derived from the ISO code, never stored.
 *
 * The picker showed no flags because FALLBACK_COUNTRIES carried `flag: ''` for
 * every entry and the only other source was an SVG URL that React Native
 * cannot render through `Image`. Deriving removes both failure modes, so this
 * pins the derivation and checks the fallback data still resolves.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTs(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
  return mod.exports;
}

const { flagEmojiFromIso2, countryFlag } = loadTs(
  path.join(__dirname, '..', 'src', 'utils', 'countryFlag.ts'),
);

assert.strictEqual(flagEmojiFromIso2('NG'), '\u{1F1F3}\u{1F1EC}', 'Nigeria');
assert.strictEqual(flagEmojiFromIso2('gh'), '\u{1F1EC}\u{1F1ED}', 'lowercase Ghana');
assert.strictEqual(flagEmojiFromIso2(' ke '), '\u{1F1F0}\u{1F1EA}', 'padded Kenya');
assert.strictEqual(flagEmojiFromIso2('ZA'), '\u{1F1FF}\u{1F1E6}', 'South Africa');

for (const bad of ['', 'N', 'NGA', 'N1', '12', null, undefined, '  ']) {
  assert.strictEqual(flagEmojiFromIso2(bad), '', `rejects ${JSON.stringify(bad)}`);
}

// Derives when the stored value is the empty string the data actually holds.
assert.strictEqual(
  countryFlag({ flag: '', iso2: 'NG', code: 'NG' }),
  '\u{1F1F3}\u{1F1EC}',
  'empty stored flag must fall through to derivation',
);
// A stored override still wins.
assert.strictEqual(countryFlag({ flag: '\u{1F3F4}', iso2: 'NG' }), '\u{1F3F4}');
// `code` is accepted as the deprecated alias of iso2.
assert.strictEqual(countryFlag({ code: 'GH' }), '\u{1F1EC}\u{1F1ED}');
assert.strictEqual(countryFlag(null), '');

// Every fallback country must resolve, since those are what render offline.
const locationSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'locationService.ts'),
  'utf8',
);
const iso2Codes = [...locationSource.matchAll(/iso2:\s*'([A-Z]{2})'/g)].map((m) => m[1]);
assert.ok(iso2Codes.length >= 4, `expected fallback countries, found ${iso2Codes.length}`);
for (const code of iso2Codes) {
  assert.notStrictEqual(
    flagEmojiFromIso2(code),
    '',
    `fallback country ${code} produced no flag`,
  );
}

console.log(
  `country flag contract passed (${iso2Codes.length} fallback countries resolve; derivation handles case, padding and junk)`,
);
