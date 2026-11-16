// Rush fee cap parity with the backend guardrail (RUSH_FEE_CAP_EXCEEDED in
// bthreadly custom-order-configurations.service): fee <= 70% of
// base production charge + largest rule yardage x fabric cost per yard.
// Regression (16 Nov 2026): a creator could enter a rush fee above the cap,
// pass Review, and only learn about it when the upload failed into Needs
// Attention. The composer must block it inline and before Preview.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScriptRequire } = require('./helpers/mobile-script-require');

const repoRoot = path.resolve(__dirname, '..');
const scriptRequire = createScriptRequire({ repoRoot, mocks: {} });
const rules = scriptRequire('@/src/features/design-editor/designCreationRules');

// 5,000 base + 4 yd x 2,500/yd = 15,000 estimate -> cap 10,500.
assert.equal(rules.RUSH_FEE_CAP_RATIO, 0.7);
assert.equal(
  rules.getRushFeeCap({ baseProductionCharge: '5000', fabricCostPerYard: '2500', outputYards: ['4'] }),
  10500,
);
// The largest rule yardage wins (the server uses the max across rules).
assert.equal(
  rules.getRushFeeCap({ baseProductionCharge: '5000', fabricCostPerYard: '2500', outputYards: ['4', 6, '2.5'] }),
  14000,
);
// Floors to whole naira so the shown maximum is always accepted.
assert.equal(
  rules.getRushFeeCap({ baseProductionCharge: '1001', fabricCostPerYard: '0', outputYards: ['4'] }),
  700,
);
// No estimate yet (blank terms, or a zero estimate the server skips): no cap.
assert.equal(rules.getRushFeeCap({ baseProductionCharge: '', fabricCostPerYard: '2500', outputYards: ['4'] }), null);
assert.equal(rules.getRushFeeCap({ baseProductionCharge: '0', fabricCostPerYard: '0', outputYards: ['4'] }), null);

assert.equal(rules.formatNaira(10500), '₦10,500');
assert.equal(rules.formatNaira(1234567), '₦1,234,567');

// Stored zero prices hydrate as empty fields (placeholder), never a literal "0".
assert.equal(rules.blankZeroAmount(0), '');
assert.equal(rules.blankZeroAmount('0'), '');
assert.equal(rules.blankZeroAmount('0.00'), '');
assert.equal(rules.blankZeroAmount(null), '');
assert.equal(rules.blankZeroAmount('2500'), '2500');

const composer = fs.readFileSync(path.join(repoRoot, 'app', '(tabs)', 'catalog', 'create-design', 'composer.tsx'), 'utf8');
const provider = fs.readFileSync(path.join(repoRoot, 'src', 'features', 'design-editor', 'DesignEditorProvider.tsx'), 'utf8');

// Inline, short (one line in a half-width field), and it blocks Preview.
assert.match(composer, /rushFee = `Max \$\{formatNaira\(rushFeeCap\)\}`/, 'Composer shows the cap inline on the rush fee field');
assert.match(composer, /if \(customOrderFieldErrors\.rushFee \|\| customOrderFieldErrors\.rushTime\)/, 'Rush errors block Preview');
assert.doesNotMatch(composer, /delivery\?\.includes\('min'\)/, 'Delivery errors are structured, not matched on message text');
// The submit path enforces the same cap (never a submit-time 400).
assert.match(provider, /getCustomOrderRushValidationMessage\(form, rushFeeCap\)/, 'Provider checks the cap before saving');
assert.match(provider, /rushFee > rushFeeCap/, 'Provider rejects a rush fee above the cap');
// Reopening a draft restores rush terms and blanks zero amounts.
assert.match(provider, /rushEnabled: Boolean\(activeCustomConfiguration\.rushEnabled\)/, 'Rush terms are restored on edit');
assert.match(provider, /baseProductionCharge: blankZeroAmount\(/, 'Zero base charge shows the placeholder');

console.log('Rush fee cap: client mirrors the server 70% guardrail, inline and before Preview.');
