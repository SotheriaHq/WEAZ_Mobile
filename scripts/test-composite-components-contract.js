/**
 * Native Composite UI Components Contract Test (Wave 3)
 *
 * Verifies that canonical mobile composite UI components conform to the design system contracts:
 * 1. AppConfirmDialog: consumes canonical Button with protected tactile neumorphic variants.
 * 2. CollapsibleSearch: composes canonical Input, AppText, and semantic tokens.
 * 3. VisibilityFilter: consumes semantic tokens and satisfies Rule 35 border width.
 * 4. SegmentedTabs: consumes semantic accent tokens for sliding indicator and satisfies Rule 35.
 * 5. ScreenState: composes Card, AppText, and canonical Button without overriding button tactile depth.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── 1. AppConfirmDialog Contract ───────────────────────────────────────────
const confirmDialogSource = fs.readFileSync(
  path.join(ROOT, 'components', 'ui', 'AppConfirmDialog.tsx'),
  'utf8'
);

assert.ok(
  confirmDialogSource.includes("import { Button } from '@/components/ui/Button'"),
  'AppConfirmDialog must import canonical Button primitive'
);
assert.ok(
  confirmDialogSource.includes('variant="secondary"'),
  'AppConfirmDialog must use variant="secondary" for cancel action'
);
assert.ok(
  confirmDialogSource.includes("variant={destructive ? 'danger' : 'primary'}"),
  'AppConfirmDialog must use variant="primary" / "danger" for confirm action'
);
assert.ok(
  confirmDialogSource.includes('AppBottomSheet'),
  'AppConfirmDialog must be built on AppBottomSheet'
);

// ── 2. CollapsibleSearch Contract ──────────────────────────────────────────
const collapsibleSearchSource = fs.readFileSync(
  path.join(ROOT, 'components', 'ui', 'CollapsibleSearch.tsx'),
  'utf8'
);

assert.ok(
  collapsibleSearchSource.includes("import { Input } from '@/components/ui/Input'"),
  'CollapsibleSearch must compose canonical Input primitive'
);
assert.ok(
  collapsibleSearchSource.includes("import { AppText } from '@/components/ui/AppText'"),
  'CollapsibleSearch must compose AppText primitive'
);
assert.ok(
  collapsibleSearchSource.includes('borderWidth: 2'),
  'CollapsibleSearch iconButton must declare border width of at least 2px'
);
assert.ok(
  collapsibleSearchSource.includes('width: 44') && collapsibleSearchSource.includes('height: 44'),
  'CollapsibleSearch iconButton must satisfy 44x44 minimum touch target'
);

// ── 3. VisibilityFilter Contract ───────────────────────────────────────────
const visibilityFilterSource = fs.readFileSync(
  path.join(ROOT, 'components', 'catalog', 'VisibilityFilter.tsx'),
  'utf8'
);

assert.ok(
  visibilityFilterSource.includes('borderWidth: 2'),
  'VisibilityFilter segment must declare border width of at least 2px'
);
assert.ok(
  visibilityFilterSource.includes('surfaceCard') || visibilityFilterSource.includes('surface'),
  'VisibilityFilter must consume semantic surface tokens'
);
assert.ok(
  visibilityFilterSource.includes('actionBrand') || visibilityFilterSource.includes('primary'),
  'VisibilityFilter must consume semantic action tokens'
);

// ── 4. SegmentedTabs Contract ──────────────────────────────────────────────
const segmentedTabsSource = fs.readFileSync(
  path.join(ROOT, 'components', 'ui', 'SegmentedTabs.tsx'),
  'utf8'
);

assert.ok(
  segmentedTabsSource.includes('borderBottomWidth: 2'),
  'SegmentedTabs must declare bottom border of at least 2px'
);
assert.ok(
  segmentedTabsSource.includes('height: 2'),
  'SegmentedTabs indicator must declare height of at least 2px'
);
assert.ok(
  segmentedTabsSource.includes('actionBrand') || segmentedTabsSource.includes('primary'),
  'SegmentedTabs indicator must consume semantic action brand token'
);

// ── 5. ScreenState Contract ────────────────────────────────────────────────
const screenStateSource = fs.readFileSync(
  path.join(ROOT, 'components', 'ui', 'ScreenState.tsx'),
  'utf8'
);

assert.ok(
  screenStateSource.includes("import { Button } from '@/components/ui/Button'"),
  'ScreenState must import canonical Button primitive'
);
assert.ok(
  screenStateSource.includes("import { Card } from '@/components/ui/Card'"),
  'ScreenState must import canonical Card primitive'
);
assert.ok(
  screenStateSource.includes('variant="primary"') && screenStateSource.includes('variant="secondary"'),
  'ScreenState must consume canonical primary and secondary Button variants'
);

console.log('PASS test-composite-components-contract: Native composite components satisfy all Wave 3 design-system contracts.');
