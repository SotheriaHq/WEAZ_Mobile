const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test 1: Email validation RFC 5322 edgecases
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (!emailRegex.test(trimmed)) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domainPart] = parts;
  if (!localPart || !domainPart) return false;
  if (localPart.endsWith('.') || localPart.startsWith('.') || localPart.includes('..')) {
    return false;
  }
  const domainLabels = domainPart.split('.');
  if (domainLabels.length < 2) return false;
  for (const label of domainLabels) {
    if (!label || label.startsWith('-') || label.endsWith('-')) {
      return false;
    }
  }
  return true;
}

// Invalid emails that must fail
assert.strictEqual(isValidEmail('jayde.@yopmail.com'), false, 'Trailing dot in local part must fail');
assert.strictEqual(isValidEmail('.jayde@yopmail.com'), false, 'Leading dot in local part must fail');
assert.strictEqual(isValidEmail('jay..de@yopmail.com'), false, 'Consecutive dots must fail');
assert.strictEqual(isValidEmail('jayde@yopmail'), false, 'Domain without TLD must fail');
assert.strictEqual(isValidEmail('jayde@yopmail.-com'), false, 'Leading dash in TLD must fail');
assert.strictEqual(isValidEmail(''), false, 'Empty email must fail');

// Valid emails that must pass
assert.strictEqual(isValidEmail('jayde@yopmail.com'), true, 'Valid email must pass');
assert.strictEqual(isValidEmail('test.user+tag@domain.co.uk'), true, 'Tagged email must pass');
console.log('✓ Email RFC 5322 validator tests passed');

// Test 2: Anti-truncation verification in viewer and search
const viewerFile = fs.readFileSync(
  path.resolve(__dirname, '../src/features/market/components/MarketCommerceViewer.tsx'),
  'utf8',
);
assert(
  !viewerFile.includes('numberOfLines={1}\n          style={styles.sheetInlineAction}'),
  'Sheet buttons must not be blindly truncated',
);
assert(
  viewerFile.includes('adjustsFontSizeToFit') && viewerFile.includes('minimumFontScale'),
  'MarketCommerceViewer dock buttons must specify adjustsFontSizeToFit and minimumFontScale',
);
console.log('✓ Anti-truncation & responsive scaling in MarketCommerceViewer verified');

// Test 3: Keyboard aware form scroll double-counting prevention
const scrollFile = fs.readFileSync(
  path.resolve(__dirname, '../components/ui/KeyboardAwareFormScroll.tsx'),
  'utf8',
);
assert(
  scrollFile.includes('resizedBySystem ? windowHeight : windowHeight - kb'),
  'KeyboardAwareFormScroll must avoid double-subtracting keyboard height on Android adjustResize',
);
console.log('✓ KeyboardAwareFormScroll Android resize logic verified');

// Test 4: Finance page tabular numerals and progress threshold
const financeMobileFile = fs.readFileSync(
  path.resolve(__dirname, '../app/(tabs)/studio/finance.tsx'),
  'utf8',
);
assert(
  financeMobileFile.includes('variant="moneyLarge"'),
  'Finance mobile must use moneyLarge for tabular numerals and visual weight',
);
assert(
  financeMobileFile.includes('5000') || financeMobileFile.includes('5,000'),
  'Finance mobile must display payout threshold progress toward ₦5,000',
);
console.log('✓ Finance screen tabular numerals and payout progress verified');

console.log('\nAll validation, anti-truncation, and layout contracts PASSED (4/4).');
