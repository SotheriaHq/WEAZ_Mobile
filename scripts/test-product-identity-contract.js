/**
 * Drift check for the product's own identity across all three repos.
 *
 * The name, tagline, category and brand palette are declared three times — once
 * per repo — because the repos are independent and share no package. They
 * agreed by hand until now, and by hand is how they stopped agreeing: web
 * exported the name as both `APP_NAME` and `COMPANY_NAME`, mobile as
 * `PRODUCT_NAME` and `MOBILE_APP_NAME`, and all three carried a navy-and-gold
 * `BRAND_PALETTE` that nothing painted while the UI painted purple from three
 * separate hardcoded copies.
 *
 * This runs the real modules from all three and asserts they are identical. It
 * cannot be a build-time guarantee, so it is a test-time one.
 *
 * Skips with a printed reason when a sibling repo is not checked out.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/**
 * Load a TS module with its imports stubbed.
 *
 * Every identity module is leaf-level by design — the web one reads
 * `import.meta.env`, which is why that one is read as source rather than
 * executed. Nothing else has runtime imports.
 */
function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(
    module,
    module.exports,
    () => ({}),
  );
  return module.exports;
}

/**
 * The web module reaches for `import.meta.env`, which CommonJS cannot express,
 * so its constants are read out of the source text instead. Only the values
 * this contract covers are extracted; none of them are env-driven.
 */
function readLiterals(filePath, names) {
  const source = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const name of names) {
    const m = source.match(new RegExp(`export const ${name} = '([^']*)'`));
    if (!m) throw new Error(`${path.basename(filePath)}: no literal export "${name}"`);
    out[name] = m[1];
  }
  const palette = source.match(/export const BRAND_COLORS = \{([\s\S]*?)\} as const;/);
  if (!palette) throw new Error(`${path.basename(filePath)}: no BRAND_COLORS block`);
  out.BRAND_COLORS = {};
  for (const line of palette[1].split('\n')) {
    const kv = line.match(/^\s*(\w+):\s*'([^']*)',/);
    if (kv) out.BRAND_COLORS[kv[1]] = kv[2];
  }
  return out;
}

const ROOT = path.join(__dirname, '..', '..');
const SOURCES = {
  mobile: path.join(ROOT, 'threadly-mobile', 'src', 'brand', 'identity.ts'),
  web: path.join(ROOT, 'fthreadly', 'src', 'brand', 'identity.ts'),
  backend: path.join(
    ROOT,
    'bthreadly',
    'src',
    'common',
    'branding',
    'product-identity.constants.ts',
  ),
};

const missing = Object.entries(SOURCES).filter(([, p]) => !fs.existsSync(p));
if (missing.length) {
  console.log(
    `SKIP test-product-identity-contract: not checked out — ${missing
      .map(([name]) => name)
      .join(', ')}`,
  );
  process.exit(0);
}

const SHARED_STRINGS = ['PRODUCT_NAME', 'PRODUCT_TAGLINE', 'PRODUCT_CATEGORY'];

const mobile = loadTsModule(SOURCES.mobile);
const backend = loadTsModule(SOURCES.backend);
const web = readLiterals(SOURCES.web, SHARED_STRINGS);

for (const key of SHARED_STRINGS) {
  assert.strictEqual(
    typeof mobile[key],
    'string',
    `mobile identity must export ${key}`,
  );
  assert.strictEqual(
    web[key],
    mobile[key],
    `${key} drifted: web "${web[key]}" vs mobile "${mobile[key]}"`,
  );
  assert.strictEqual(
    backend[key],
    mobile[key],
    `${key} drifted: backend "${backend[key]}" vs mobile "${mobile[key]}"`,
  );
}

// The palette has to match key for key, not just overlap.
const paletteKeys = Object.keys(mobile.BRAND_COLORS).sort();
assert.deepStrictEqual(
  Object.keys(backend.BRAND_COLORS).sort(),
  paletteKeys,
  'BRAND_COLORS keys differ between mobile and backend',
);
assert.deepStrictEqual(
  Object.keys(web.BRAND_COLORS).sort(),
  paletteKeys,
  'BRAND_COLORS keys differ between mobile and web',
);
for (const key of paletteKeys) {
  assert.strictEqual(
    web.BRAND_COLORS[key],
    mobile.BRAND_COLORS[key],
    `BRAND_COLORS.${key} drifted: web ${web.BRAND_COLORS[key]} vs mobile ${mobile.BRAND_COLORS[key]}`,
  );
  assert.strictEqual(
    backend.BRAND_COLORS[key],
    mobile.BRAND_COLORS[key],
    `BRAND_COLORS.${key} drifted: backend ${backend.BRAND_COLORS[key]} vs mobile ${mobile.BRAND_COLORS[key]}`,
  );
}

/*
 * The two grounds must stay two different colours.
 *
 * This is the actual bug the palette exists to prevent: one violet used on both
 * grounds is how the logo came to sit at 1.9:1 against the night theme. If
 * someone "simplifies" these to a single value, everything above still passes.
 */
assert.notStrictEqual(
  mobile.BRAND_COLORS.primary,
  mobile.BRAND_COLORS.onDark,
  'primary and onDark must stay distinct — one violet cannot clear both grounds',
);

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const onWhite = contrast(mobile.BRAND_COLORS.primary, '#ffffff');
const onInk = contrast(mobile.BRAND_COLORS.onDark, mobile.BRAND_COLORS.ink);
assert.ok(
  onWhite >= 4.0,
  `primary must clear white at 4:1 or better, got ${onWhite.toFixed(2)}:1`,
);
assert.ok(
  onInk >= 4.0,
  `onDark must clear ink at 4:1 or better, got ${onInk.toFixed(2)}:1`,
);

console.log('product identity contract OK');
console.log(`  name      ${mobile.PRODUCT_NAME} (web, mobile, backend agree)`);
console.log(`  palette   ${paletteKeys.length} keys agree`);
console.log(`  contrast  primary on white ${onWhite.toFixed(2)}:1 · onDark on ink ${onInk.toFixed(2)}:1`);
