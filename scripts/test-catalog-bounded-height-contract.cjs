/**
 * The Catalogue never grows without end (owner, Nov 2026).
 *
 *  1. "Two cards on my Shop tab, but the screen keeps scrolling to blanks."
 *     The Bag It pill (a Button whose inner pressable has flexGrow: 1) grew to
 *     the pager's height; the page then measured taller and the pager grew —
 *     4,499,230px on device. The compact card buttons now have a FIXED height.
 *  2. "A brand with 50 cards must not get a very long screen." Content and
 *     Shop keep the two-column grid up to four cards; from the fifth, the grid
 *     stays two across but gets a fixed height and scrolls inline, vertically
 *     (InlineCardGrid). Never three across, never sideways (owner: "the height
 *     is the most important issue").
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// 1. No growable card buttons.
const bagIt = read('components/commerce/BagItButton.tsx');
assert.match(bagIt, /pill: \{[\s\S]*?height: tokens\.button\.xs\.height,/, 'Bag It has a fixed height');
const card = read('components/commerce/UnifiedProductCard.tsx');
assert.match(card, /compactAction: \{[\s\S]*?height: tokens\.button\.xs\.height,/, 'the compact action has a fixed height');

// 2. The strip rules.
const output = ts.transpileModule(read('components/catalog/InlineCardGrid.tsx'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const sandboxModule = { exports: {} };
vm.runInNewContext(output, {
  module: sandboxModule,
  exports: sandboxModule.exports,
  require: (request) => {
    if (request === 'react') return { useCallback: (fn) => fn, useMemo: (fn) => fn(), Fragment: 'Fragment', createElement: () => null };
    if (request === 'react-native') return { FlatList: 'FlatList', StyleSheet: { create: (s) => s }, View: 'View' };
    return require(request);
  },
});
const grid = sandboxModule.exports;
assert.equal(grid.shouldCapGridHeight(4), false, 'four cards stay a plain grid');
assert.equal(grid.shouldCapGridHeight(5), true, 'the fifth card caps the height');
assert.equal(grid.shouldCapGridHeight(50), true);
// The capped height does not depend on the count: 6 cards and 50 are as tall.
const h = grid.cappedGridHeight({ cardHeight: 300, rowGap: 12, visibleRows: 2.5, paddingVertical: 16 });
assert.equal(h, Math.round(300 * 2.5 + 12 * 2 + 16), 'two and a half rows, so the next row peeks');

const source = read('components/catalog/InlineCardGrid.tsx');
assert.match(source, /numColumns=\{2\}/, 'two cards per row, always (owner: no three across)');
assert.doesNotMatch(source, /\bhorizontal\b(?!\s*\w*:)/, 'never a sideways strip');
assert.match(source, /<View style=\{\{ height \}\}>/, 'a fixed height');
assert.match(source, /showsVerticalScrollIndicator=\{false\}/, 'no scrollbar');
assert.match(source, /overScrollMode="never"/, 'no overscroll glow');
assert.match(source, /nestedScrollEnabled/, 'hands scrolling back to the page at the ends');
assert.match(source, /<FlatList/, 'virtualized');

// Both tabs use it.
assert.match(read('components/catalog/CollectionsGrid.tsx'), /<InlineCardGrid/, 'the Content tab is bounded');
assert.match(read('components/catalog/BrandShopTab.tsx'), /<InlineCardGrid/, 'the Shop tab is bounded');

console.log('catalog bounded height contract: all checks passed');
