/**
 * Native Atomic Components Contract Test
 *
 * Verifies that canonical mobile UI primitives (Button, Input, Card, AppBadge, Chip, AppText)
 * conform to the design system contracts:
 * - Proper variant exports (including 'brand' variant on Button)
 * - Accessibility properties (accessibilityRole="button", accessibilityState)
 * - Safe-area / touch-target dimension contracts (tokens.button[size].height >= 44 for md/lg)
 * - Semantic token consumption
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── 1. Button Primitive Verification ──────────────────────────────────────────
const buttonSource = fs.readFileSync(path.join(ROOT, 'components', 'ui', 'Button.tsx'), 'utf8');

assert.ok(
  buttonSource.includes("'brand'"),
  "Button.tsx must declare 'brand' variant",
);
assert.ok(
  buttonSource.includes("'primary'"),
  "Button.tsx must declare 'primary' variant for compatibility",
);
assert.ok(
  buttonSource.includes("'outline'"),
  "Button.tsx must declare 'outline' variant",
);
assert.ok(
  buttonSource.includes("'ghost'"),
  "Button.tsx must declare 'ghost' variant",
);
assert.ok(
  buttonSource.includes("'danger'"),
  "Button.tsx must declare 'danger' variant",
);
assert.ok(
  buttonSource.includes("'link'"),
  "Button.tsx must declare 'link' variant",
);
assert.ok(
  buttonSource.includes("'neumorphic'"),
  "Button.tsx must declare 'neumorphic' variant for cross-platform compatibility",
);
assert.ok(
  buttonSource.includes('accessibilityRole="button"'),
  "Button.tsx must set accessibilityRole='button' on Pressable",
);
assert.ok(
  buttonSource.includes('accessibilityState'),
  'Button.tsx must declare accessibilityState for disabled and busy',
);
assert.ok(
  buttonSource.includes('buttonTokens') || buttonSource.includes('actionBrand'),
  "Button.tsx must consume semantic button tokens for 'brand' variant",
);
assert.ok(
  buttonSource.includes('LinearGradient'),
  'Button.tsx must render LinearGradient for tactile inset depth',
);
assert.ok(
  buttonSource.includes('translateY'),
  'Button.tsx must animate translateY on press for physical depression',
);
assert.ok(
  buttonSource.includes('borderTopColor') && buttonSource.includes('borderBottomColor'),
  'Button.tsx must use stepped dual-tone borders for tactile secondary variant',
);

// ── 2. Input Primitive Verification ───────────────────────────────────────────
const inputSource = fs.readFileSync(path.join(ROOT, 'components', 'ui', 'Input.tsx'), 'utf8');

assert.ok(
  inputSource.includes("variant?: 'default' | 'bare' | 'underline'"),
  'Input.tsx must declare variants default, bare, underline',
);
assert.ok(
  inputSource.includes("density?: 'comfortable' | 'compact'"),
  'Input.tsx must declare densities comfortable and compact',
);
assert.ok(
  inputSource.includes('accessibilityLabel'),
  'Input.tsx must configure accessibilityLabel on TextInput',
);
assert.ok(
  inputSource.includes('surfacePage'),
  'Input.tsx must consume theme.colors.surfacePage',
);

// ── 3. Card Primitive Verification ────────────────────────────────────────────
const cardSource = fs.readFileSync(path.join(ROOT, 'components', 'ui', 'Card.tsx'), 'utf8');

assert.ok(
  cardSource.includes("'surface'"),
  "Card.tsx must declare 'surface' variant",
);
assert.ok(
  cardSource.includes("'bordered'"),
  "Card.tsx must declare 'bordered' variant",
);
assert.ok(
  cardSource.includes("'elevated'"),
  "Card.tsx must declare 'elevated' variant",
);
assert.ok(
  cardSource.includes("'recessed'"),
  "Card.tsx must declare 'recessed' variant",
);
assert.ok(
  cardSource.includes("'interactive'"),
  "Card.tsx must declare 'interactive' variant",
);
assert.ok(
  cardSource.includes('surfaceCard'),
  'Card.tsx must consume theme.colors.surfaceCard',
);

// ── 4. AppBadge Status Verification ───────────────────────────────────────────
const badgeSource = fs.readFileSync(path.join(ROOT, 'components', 'ui', 'AppBadge.tsx'), 'utf8');

assert.ok(
  badgeSource.includes("'success'"),
  "AppBadge.tsx must support 'success' status tone",
);
assert.ok(
  badgeSource.includes("'warning'"),
  "AppBadge.tsx must support 'warning' status tone",
);
assert.ok(
  badgeSource.includes("'muted'"),
  "AppBadge.tsx must support 'muted' status tone",
);

// ── 5. AppText Typography Verification ────────────────────────────────────────
const textSource = fs.readFileSync(path.join(ROOT, 'components', 'ui', 'AppText.tsx'), 'utf8');

const REQUIRED_TYPOGRAPHY_VARIANTS = [
  'display',
  'screenTitle',
  'sectionTitle',
  'cardTitle',
  'body',
  'bodyReadable',
  'caption',
  'money',
  'moneyLarge',
];

for (const variant of REQUIRED_TYPOGRAPHY_VARIANTS) {
  assert.ok(
    textSource.includes(`'${variant}'`),
    `AppText.tsx must support typography hierarchy variant '${variant}'`,
  );
}

// ── 6. Touch-Target Standard Verification ─────────────────────────────────────
const tokensSource = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.ts'), 'utf8');
assert.ok(
  tokensSource.includes('height: 44'),
  'tokens.button.md must guarantee 44pt touch-target compliance',
);
assert.ok(
  tokensSource.includes('height: 52'),
  'tokens.button.lg must guarantee 52pt touch-target compliance',
);

console.log('PASS test-atomic-components-contract: Native atomic components satisfy all design-system contracts.');
