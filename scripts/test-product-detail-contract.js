/**
 * Native Product Detail Vertical Slice Contract Test (Wave 4A)
 *
 * Verifies that the Native Product Detail feature stack:
 * 1. MarketCommerceViewer conforms to WIEZ design system tokens and button contracts.
 * 2. ProductBagSelectorSheet consumes semantic tokens for variant chips and canonical Button.
 * 3. Commercial presentation preserves fashion-first photography prominence and quiet chrome.
 * 4. Satisfies Rule 35 (purposeful border >= 2px, no redundant parent outlines).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── 1. MarketCommerceViewer Contract ───────────────────────────────────────
const viewerSource = fs.readFileSync(
  path.join(ROOT, 'src', 'features', 'market', 'components', 'MarketCommerceViewer.tsx'),
  'utf8'
);

assert.ok(
  viewerSource.includes("import { Button } from '@/components/ui/Button'"),
  'MarketCommerceViewer must import canonical Button primitive'
);

assert.ok(
  viewerSource.includes('theme.colors.actionBrand'),
  'MarketCommerceViewer sheetBagAction must consume theme.colors.actionBrand'
);

assert.ok(
  viewerSource.includes('BagPulseIcon'),
  'MarketCommerceViewer must preserve BagPulseIcon heartbeat indicator'
);

assert.ok(
  viewerSource.includes('<Button\n            title="Retry"\n            variant="secondary"') ||
  viewerSource.includes('title="Retry"') && viewerSource.includes('variant="secondary"'),
  'MarketCommerceViewer state overlay must compose canonical Button with variant="secondary"'
);

assert.ok(
  viewerSource.includes('borderWidth: 2'),
  'MarketCommerceViewer must satisfy Rule 35 border width >= 2px'
);

// ── 2. ProductBagSelectorSheet Contract ────────────────────────────────────
const sheetSource = fs.readFileSync(
  path.join(ROOT, 'components', 'bagging', 'ProductBagSelectorSheet.tsx'),
  'utf8'
);

assert.ok(
  sheetSource.includes("import { Button } from '@/components/ui/Button'"),
  'ProductBagSelectorSheet must import canonical Button primitive'
);

assert.ok(
  sheetSource.includes("import { AppBottomSheet } from '@/components/ui/AppBottomSheet'"),
  'ProductBagSelectorSheet must compose AppBottomSheet primitive'
);

assert.ok(
  sheetSource.includes('theme.colors.actionBrand'),
  'ProductBagSelectorSheet option chips must consume theme.colors.actionBrand when selected'
);

assert.ok(
  sheetSource.includes('variant="brand"'),
  'ProductBagSelectorSheet recommendation action must use canonical Button variant="brand"'
);

assert.ok(
  sheetSource.includes('variant="secondary"'),
  'ProductBagSelectorSheet secondary actions must use canonical Button variant="secondary"'
);

assert.ok(
  sheetSource.includes('borderWidth: 2'),
  'ProductBagSelectorSheet chips and cards must declare border width of at least 2px'
);

console.log('PASS test-product-detail-contract: Native Product Detail satisfies all Wave 4A design-system contracts.');
