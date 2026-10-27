/**
 * Cross-Repository Design Tokens Contract Test
 *
 * Verifies semantic compatibility and token vocabulary parity across WIEZ Web and Native.
 * Ensures that primitives, semantic tokens, radius scale, motion durations, and typography
 * hierarchies stay synchronized between platforms without forcing identical internal implementations.
 *
 * Patterned after `test-product-identity-contract.js`.
 * Skips with a printed reason if a sibling repo is not checked out.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath) {
  const dir = path.dirname(filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const moduleObj = { exports: {} };
  const customRequire = (reqPath) => {
    if (reqPath.startsWith('.')) {
      let resolved = path.resolve(dir, reqPath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
        else if (fs.existsSync(path.join(resolved, 'index.js'))) resolved = path.join(resolved, 'index.js');
      } else if (!fs.existsSync(resolved)) {
        if (fs.existsSync(resolved + '.ts')) resolved += '.ts';
        else if (fs.existsSync(resolved + '.js')) resolved += '.js';
        else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
        else if (fs.existsSync(path.join(resolved, 'index.js'))) resolved = path.join(resolved, 'index.js');
      }
      return loadTsModule(resolved);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(
    moduleObj,
    moduleObj.exports,
    customRequire,
  );
  return moduleObj.exports;
}

const ROOT = path.join(__dirname, '..', '..');

// Support both primary workspace (fthreadly) and isolated design worktree (fthreadly-design)
const WEB_TOKEN_CANDIDATES = [
  path.join(ROOT, 'fthreadly-design', 'src', 'design-system'),
  path.join(ROOT, 'fthreadly', 'src', 'design-system'),
];

const webDir = WEB_TOKEN_CANDIDATES.find((dir) => fs.existsSync(dir));
const mobileDir = path.join(ROOT, 'threadly-mobile', 'src', 'styles', 'design-tokens');

if (!webDir || !fs.existsSync(mobileDir)) {
  console.log(
    `SKIP test-design-tokens-contract: sibling design-system directory not found (checked: ${WEB_TOKEN_CANDIDATES.join(', ')})`,
  );
  process.exit(0);
}

// ── 1. Load Primitives and Semantic Tokens ────────────────────────────────────
const webPrimitives = loadTsModule(path.join(webDir, 'primitives.ts'));
const webSemantic = loadTsModule(path.join(webDir, 'semantic.ts'));

const mobilePrimitives = loadTsModule(path.join(mobileDir, 'primitives.ts'));
const mobileSemantic = loadTsModule(path.join(mobileDir, 'semantic.ts'));

// ── 2. Assert Primitive Token Parity ──────────────────────────────────────────
// WIEZ Brand Violet Ramp Anchors
assert.strictEqual(
  webPrimitives.brandPrimitives.violet[800],
  '#6015e2',
  'Web canonical brand mark on light ground must be #6015e2',
);
assert.strictEqual(
  mobilePrimitives.brandPrimitives.violet[800],
  '#6015e2',
  'Mobile canonical brand mark on light ground must be #6015e2',
);
assert.strictEqual(
  webPrimitives.brandPrimitives.violet[500],
  '#af87f4',
  'Web canonical brand mark on dark ground must be #af87f4',
);
assert.strictEqual(
  mobilePrimitives.brandPrimitives.violet[500],
  '#af87f4',
  'Mobile canonical brand mark on dark ground must be #af87f4',
);
assert.strictEqual(
  webPrimitives.brandPrimitives.violet[600],
  '#9333ea',
  'Web component accent violet must be #9333ea',
);
assert.strictEqual(
  mobilePrimitives.brandPrimitives.violet[600],
  '#9333ea',
  'Mobile component accent violet must be #9333ea',
);

// Standardized Radius Scale
const REQUIRED_RADIUS_KEYS = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'modal', 'full'];
for (const key of REQUIRED_RADIUS_KEYS) {
  assert.ok(key in webPrimitives.radiusPrimitives, `Web missing radius.${key}`);
  assert.ok(key in mobilePrimitives.radiusPrimitives, `Mobile missing radius.${key}`);
  assert.strictEqual(
    webPrimitives.radiusPrimitives[key],
    mobilePrimitives.radiusPrimitives[key],
    `Radius mismatch for ${key}: ${webPrimitives.radiusPrimitives[key]} vs ${mobilePrimitives.radiusPrimitives[key]}`,
  );
}
assert.strictEqual(webPrimitives.radiusPrimitives.modal, 28, 'Standard modal radius must be 28px');
assert.strictEqual(mobilePrimitives.radiusPrimitives.modal, 28, 'Standard modal radius must be 28px');

// Motion Durations
const REQUIRED_MOTION_DURATIONS = ['instant', 'fast', 'normal', 'slow'];
for (const dur of REQUIRED_MOTION_DURATIONS) {
  assert.ok(dur in webPrimitives.motionPrimitives.duration, `Web missing motion.duration.${dur}`);
  assert.ok(dur in mobilePrimitives.motionPrimitives.duration, `Mobile missing motion.duration.${dur}`);
  assert.strictEqual(
    webPrimitives.motionPrimitives.duration[dur],
    mobilePrimitives.motionPrimitives.duration[dur],
    `Motion duration mismatch for ${dur}`,
  );
}

// Elevation Levels
const REQUIRED_ELEVATION_LEVELS = ['none', 'sm', 'md', 'lg', 'modal', 'recessed'];
for (const level of REQUIRED_ELEVATION_LEVELS) {
  assert.ok(
    webPrimitives.elevationPrimitives.levels.includes(level),
    `Web elevation levels must include ${level}`,
  );
  assert.ok(
    mobilePrimitives.elevationPrimitives.levels.includes(level),
    `Mobile elevation levels must include ${level}`,
  );
}

// ── 3. Assert Semantic Token Parity ───────────────────────────────────────────
const REQUIRED_SEMANTIC_DOMAINS = ['brand', 'action', 'focus', 'surface', 'text', 'border', 'status'];

function verifySemanticTheme(themeName, webTokens, mobileTokens) {
  for (const domain of REQUIRED_SEMANTIC_DOMAINS) {
    assert.ok(domain in webTokens, `Web ${themeName} missing semantic domain '${domain}'`);
    assert.ok(domain in mobileTokens, `Mobile ${themeName} missing semantic domain '${domain}'`);

    const webKeys = Object.keys(webTokens[domain]).sort();
    const mobileKeys = Object.keys(mobileTokens[domain]).sort();

    for (const key of webKeys) {
      assert.ok(
        key in mobileTokens[domain],
        `Mobile ${themeName}.${domain} missing semantic token '${key}' (present on Web)`,
      );
    }
    for (const key of mobileKeys) {
      assert.ok(
        key in webTokens[domain],
        `Web ${themeName}.${domain} missing semantic token '${key}' (present on Mobile)`,
      );
    }
  }

  // Runway stage matte exception verification (must remain deep black in both themes)
  assert.strictEqual(
    webTokens.surface.stage,
    '#080a0f',
    `Web ${themeName} surface.stage must be #080a0f`,
  );
  assert.strictEqual(
    mobileTokens.surface.stage,
    '#080a0f',
    `Mobile ${themeName} surface.stage must be #080a0f`,
  );
}

verifySemanticTheme('lightSemanticTokens', webSemantic.lightSemanticTokens, mobileSemantic.lightSemanticTokens);
verifySemanticTheme('darkSemanticTokens', webSemantic.darkSemanticTokens, mobileSemantic.darkSemanticTokens);

// Canonical Identity Mappings Agreement
assert.strictEqual(
  webSemantic.lightSemanticTokens.brand.mark,
  mobileSemantic.lightSemanticTokens.brand.mark,
  'Light brand.mark must match across Web and Mobile',
);
assert.strictEqual(
  webSemantic.darkSemanticTokens.brand.markOnDark,
  mobileSemantic.darkSemanticTokens.brand.markOnDark,
  'Dark brand.markOnDark must match across Web and Mobile',
);
assert.strictEqual(
  webSemantic.lightSemanticTokens.brand.accent,
  mobileSemantic.lightSemanticTokens.brand.accent,
  'brand.accent must match across Web and Mobile',
);

// ── 4. Verify Native tokens.ts Integration ────────────────────────────────────
const tokensModule = loadTsModule(path.join(ROOT, 'threadly-mobile', 'src', 'styles', 'tokens.ts'));
assert.ok(tokensModule.tokens, 'Mobile tokens.ts must export tokens object');
assert.strictEqual(tokensModule.tokens.radius.modal, 28, 'Mobile tokens.radius.modal must be 28');
assert.ok(tokensModule.tokens.motion, 'Mobile tokens must export motion object');
assert.strictEqual(tokensModule.tokens.motion.duration.fast, 150);
assert.strictEqual(tokensModule.tokens.themes.light.colors.surfacePage, '#ffffff');
assert.strictEqual(tokensModule.tokens.themes.dark.colors.surfacePage, '#0a0a0a');
assert.strictEqual(tokensModule.tokens.themes.light.colors.actionBrand, '#9333ea');
assert.strictEqual(tokensModule.tokens.themes.dark.colors.actionBrand, '#9333ea');

console.log('PASS test-design-tokens-contract: Web and Native design tokens are semantically synchronized.');
