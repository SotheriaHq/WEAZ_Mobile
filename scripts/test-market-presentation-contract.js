/**
 * Market presentation contract: one product card, one bag mark, one section
 * system — on the web and in the app.
 *
 * Studio's store grid renders inside the app's WebView from the web repo,
 * while the Shop tab and Market render natively here. The owner's rule is that
 * a product card looks the same in all three places, that Bag It always shows
 * the same mark, and that a Market section is drawn the same way on both
 * surfaces. The repos cannot import each other, so this loads the REAL
 * modules from both and asserts they agree, and pins the decisions that were
 * actually made:
 *
 *   1. the photo frame is 100:148 on both surfaces;
 *   2. the bag mark is the shopping-bags emoji (U+1F6CD + VS16) on both;
 *   3. section formats resolve identically from (layout, contents);
 *   4. section markers are identical, and never the bag mark;
 *   5. sections are grouped by spacing — between-section space at least
 *      three times the title-to-cards space;
 *   6. the Bag It heartbeat is a bounded shared clock, not a loop per card.
 *
 * The cross-repo half skips with a printed reason when fthreadly is not
 * checked out beside this repo, so a standalone clone still passes.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const mobileRoot = path.join(__dirname, '..');
// WIEZ_WEB_ROOT points at a web checkout other than the sibling `fthreadly`
// (a separate worktree, for instance).
const webRoot = process.env.WIEZ_WEB_ROOT
  ? path.resolve(process.env.WIEZ_WEB_ROOT)
  : path.join(mobileRoot, '..', 'fthreadly');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n  ${error.message}`);
  }
}

const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Transpile and run a TS module, resolving `@/` and relative imports inside `root`. */
function createLoader(root) {
  const cache = new Map();
  const resolveFile = (base) => {
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  };
  const load = (filePath) => {
    if (cache.has(filePath)) return cache.get(filePath).exports;
    const module = { exports: {} };
    cache.set(filePath, module);
    const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (specifier) => {
      let base = null;
      if (specifier.startsWith('@/')) base = path.join(root, specifier.slice(2));
      else if (specifier.startsWith('.')) base = path.join(path.dirname(filePath), specifier);
      if (!base) return require(specifier);
      const resolved = resolveFile(base);
      if (!resolved) throw new Error(`cannot resolve ${specifier} from ${filePath}`);
      return load(resolved);
    };
    new Function('module', 'exports', 'require', output)(module, module.exports, localRequire);
    return module.exports;
  };
  return (relative) => load(path.join(root, relative));
}

const loadMobile = createLoader(mobileRoot);
const mobileSections = loadMobile('src/constants/marketSections.ts');
const mobileBagging = loadMobile('src/constants/bagging.ts');

const SHOPPING_BAGS = String.fromCodePoint(0x1f6cd, 0xfe0f);

/* Each case is a product question that was asked and answered. */
const FORMAT_CASES = [
  { label: 'a plain product rail', layout: 'HORIZONTAL_RAIL', types: ['PRODUCT', 'PRODUCT'], expected: 'product-rail' },
  { label: 'low-stock grid stays a grid', layout: 'PRODUCT_GRID', types: ['PRODUCT', 'PRODUCT'], expected: 'product-grid' },
  { label: 'collections are always collection covers', layout: 'HORIZONTAL_RAIL', types: ['COLLECTION', 'COLLECTION'], expected: 'collection-rail' },
  { label: 'a collection rail holding products draws products', layout: 'COLLECTION_RAIL', types: ['PRODUCT'], expected: 'product-rail' },
  { label: 'brand marks for an all-brand section', layout: 'HORIZONTAL_RAIL', types: ['BRAND', 'BRAND'], expected: 'brand-rail' },
  { label: 'style tiles for an all-category section', layout: 'CATEGORY_GRID', types: ['CATEGORY'], expected: 'category-grid' },
  { label: 'a mixed "choose a lane" section keeps product cards', layout: 'CATEGORY_GRID', types: ['CATEGORY', 'PRODUCT'], expected: 'product-rail' },
  { label: 'designs ride in product rails', layout: 'HORIZONTAL_RAIL', types: ['DESIGN', 'PRODUCT'], expected: 'product-rail' },
  { label: 'an empty brand rail keeps its layout', layout: 'BRAND_RAIL', types: [], expected: 'brand-rail' },
  { label: 'an unknown layout falls back to a product rail', layout: 'SOMETHING_NEW', types: [], expected: 'product-rail' },
];

check('native: section formats follow the agreed rules', () => {
  for (const testCase of FORMAT_CASES) {
    assert.strictEqual(
      mobileSections.resolveMarketSectionFormat(testCase.layout, testCase.types),
      testCase.expected,
      testCase.label,
    );
  }
});

check('native: no section marker is the Bag It mark', () => {
  for (const [key, emoji] of Object.entries(mobileSections.MARKET_SECTION_EMOJI)) {
    assert.notStrictEqual(emoji, SHOPPING_BAGS, `${key} uses the bag mark`);
  }
});

check('native: sections are grouped by spacing (>= 3:1)', () => {
  const { headerToContent, betweenSections } = mobileSections.MARKET_RHYTHM;
  assert.ok(betweenSections >= headerToContent * 3, `${betweenSections} vs ${headerToContent}`);
});

check('native: the bag mark is the shopping-bags emoji', () => {
  assert.strictEqual(mobileBagging.BAG_IT_EMOJI, SHOPPING_BAGS);
});

check('native: Bag It always goes through the shared button and mark', () => {
  const button = read(mobileRoot, 'components/commerce/BagItButton.tsx');
  assert.match(button, /<BagPulseIcon/, 'the button shows the shared mark');
  assert.match(button, /animated=\{false\}/, 'the mark is still; the button carries the beat');
  assert.match(button, /<Button\b/, 'the shared Button supplies the single-fire guard');
  const card = read(mobileRoot, 'components/commerce/UnifiedProductCard.tsx');
  assert.match(card, /<BagItButton/, 'the product card uses the shared button');
  assert.doesNotMatch(card, /<BlurView/, 'no blurred copy panel over the photograph');
});

check('native: the heartbeat is one bounded clock, not a loop per card', () => {
  const clock = read(mobileRoot, 'src/features/bagging/bagHeartbeat.ts');
  assert.match(clock, /const pulse = new Animated\.Value\(0\)/, 'one shared value at module scope');
  assert.doesNotMatch(clock, /Animated\.loop\(/, 'no endless native loop');
  assert.match(clock, /setInterval\(beat, BAG_HEARTBEAT_PERIOD_MS\)/, 'bursts on a clock');
  assert.match(clock, /useIsFocused\(\)/, 'only focused screens beat');
  assert.match(clock, /AppState\.addEventListener/, 'stops in the background');
  assert.match(clock, /isReduceMotionEnabled/, 'respects reduce motion');
  assert.match(clock, /if \(subscribers > 0\) return;\s*stopClock\(\)/, 'stops when nothing is subscribed');
  const period = Number(/BAG_HEARTBEAT_PERIOD_MS = (\d+)/.exec(clock)?.[1]);
  const burst = [...clock.matchAll(/timing\([\d.]+, (\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  assert.ok(period > 0 && burst > 0, 'period and burst are readable');
  assert.ok(burst / period <= 0.25, `the UI thread animates ${Math.round((burst / period) * 100)}% of the time (max 25%)`);
});

check('native: market strips scroll inline with nothing drawn for the scroll', () => {
  const market = read(mobileRoot, 'src/features/market/components/MarketScreen.tsx');
  assert.match(market, /showsHorizontalScrollIndicator: false/);
  assert.match(market, /overScrollMode: 'never'/);
  assert.match(market, /snapToInterval: interval/);
  assert.match(market, /resolveMarketSectionFormat\(/, 'API sections pick their format from the shared rules');
});

if (!fs.existsSync(path.join(webRoot, 'src', 'constants', 'marketSections.ts'))) {
  console.log(`SKIP cross-repo checks: ${webRoot} is not checked out beside this repo.`);
} else {
  const loadWeb = createLoader(webRoot);
  const webSections = loadWeb('src/constants/marketSections.ts');
  const webBagging = loadWeb('src/constants/bagging.ts');

  check('web and native resolve every section format the same way', () => {
    for (const testCase of FORMAT_CASES) {
      assert.strictEqual(
        webSections.resolveMarketSectionFormat(testCase.layout, testCase.types),
        mobileSections.resolveMarketSectionFormat(testCase.layout, testCase.types),
        testCase.label,
      );
    }
  });

  check('web and native use the same section markers', () => {
    assert.deepStrictEqual(webSections.MARKET_SECTION_EMOJI, mobileSections.MARKET_SECTION_EMOJI);
    for (const format of ['product-rail', 'product-grid', 'collection-rail', 'brand-rail', 'category-grid']) {
      assert.strictEqual(
        webSections.getMarketSectionEmoji('unknown-key', format),
        mobileSections.getMarketSectionEmoji('unknown-key', format),
        `fallback marker for ${format}`,
      );
    }
  });

  check('web groups sections by spacing too (>= 3:1)', () => {
    const { headerToContent, betweenSections } = webSections.MARKET_RHYTHM;
    assert.ok(betweenSections >= headerToContent * 3, `${betweenSections} vs ${headerToContent}`);
  });

  check('web and native show the same bag mark', () => {
    assert.strictEqual(webBagging.BAG_IT_EMOJI, mobileBagging.BAG_IT_EMOJI);
  });

  check('web and native frame product photos at the same ratio', () => {
    const tile = read(webRoot, 'src/components/commerce/ProductTile.tsx');
    const card = read(mobileRoot, 'components/commerce/UnifiedProductCard.tsx');
    const webRatio = Number(/PRODUCT_TILE_MEDIA_RATIO = ([\d.]+)/.exec(tile)?.[1]);
    const nativeRatio = Number(/PRODUCT_TILE_MEDIA_RATIO = ([\d.]+)/.exec(card)?.[1]);
    assert.ok(webRatio > 0, 'web ratio readable');
    assert.strictEqual(webRatio, nativeRatio);
    const [w, h] = (/PRODUCT_TILE_MEDIA_ASPECT = 'aspect-\[(\d+)\/(\d+)\]'/.exec(tile) ?? []).slice(1).map(Number);
    assert.ok(w > 0 && Math.abs(h / w - webRatio) < 1e-9, 'the Tailwind aspect class matches the ratio');
  });

  check('web: Studio, Shop tab and Market all render the shared tile and Bag It button', () => {
    const studio = read(webRoot, 'src/components/studio/store/StoreProductsPanel.tsx');
    const shop = read(webRoot, 'src/components/designs/StoreProductCard.tsx');
    const rail = read(webRoot, 'src/components/market/MarketSectionRail.tsx');
    assert.match(studio, /<ProductTile\.Root/, 'Studio uses the shared tile');
    assert.match(studio, /<BagItButton/, 'Studio uses the shared Bag It button');
    assert.match(shop, /<ProductTile\.Root/, 'Shop tab card uses the shared tile');
    assert.match(shop, /<BagItButton/, 'Shop tab card uses the shared Bag It button');
    assert.match(rail, /<StoreProductCard/, 'Market products use the Shop tab card');
    assert.doesNotMatch(studio, /aria-hidden="true">\s*🛍️\s*<\/span>/, 'no inline bag glyph in Studio');
  });
}

if (failures > 0) {
  console.error(`\n${failures} market presentation check(s) failed.`);
  process.exit(1);
}
console.log('\nMarket presentation contract holds.');
