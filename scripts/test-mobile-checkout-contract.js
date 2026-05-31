const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(source, expected, label) {
  assert(
    source.includes(expected),
    `${label} must include ${JSON.stringify(expected)}`,
  );
}

function assertNotIncludes(source, forbidden, label) {
  assert(
    !source.includes(forbidden),
    `${label} must not include ${JSON.stringify(forbidden)}`,
  );
}

function assertMatches(source, expected, label) {
  assert(expected.test(source), `${label} must match ${expected}`);
}

const gate = read('src/features/checkout/mobileCheckoutGate.ts');
assertIncludes(gate, 'MOBILE_CHECKOUT_ENABLED = env.mobileCheckout.enabled', 'mobile checkout flag');
assertIncludes(gate, 'assertMobileCheckoutEnabled', 'mobile checkout guard');

const env = read('src/config/env.ts');
assertIncludes(env, "EXPO_PUBLIC_MOBILE_CHECKOUT_ENABLED", 'mobile checkout env flag');
assertIncludes(env, "getEnvVar('EXPO_PUBLIC_MOBILE_CHECKOUT_ENABLED', 'true')", 'mobile checkout default');

const paymentApi = read('src/api/PaymentApi.ts');
assertMatches(
  paymentApi,
  /apiClient\.post\(\s*['"]\/payment\/initialize-unified['"]/,
  'payment initialize endpoint',
);
assertIncludes(paymentApi, "{ headers: { 'Idempotency-Key': idempotencyKey } }", 'payment idempotency header');
assertIncludes(paymentApi, "apiClient.post('/payment/verify'", 'payment verify endpoint');
assertMatches(
  paymentApi,
  /apiClient\.get\(\s*`\/payment\/attempts\/\$\{encodeURIComponent\(reference\)\}`/,
  'payment attempt endpoint',
);
assertNotIncludes(paymentApi, '/store/checkout', 'payment api');

const checkoutRoute = read('app/checkout.tsx');
const paymentRoute = read('app/payment.tsx');
assertIncludes(checkoutRoute, 'MobileCheckoutScreen', 'checkout route');
assertIncludes(paymentRoute, 'MobilePaymentScreen', 'payment route');

const checkoutScreen = read('src/features/checkout/MobileCheckoutScreen.tsx');
assertIncludes(checkoutScreen, 'paymentApi.initializeUnified', 'checkout screen initialize');
assertIncludes(checkoutScreen, 'createMobileCheckoutIdempotencyKey', 'checkout screen idempotency');
assertIncludes(checkoutScreen, 'savePendingMobileCheckout', 'checkout screen pending persistence');
assertIncludes(checkoutScreen, "paymentMethod: 'PAYSTACK'", 'checkout screen payment method');
assertIncludes(checkoutScreen, "channel: 'CARD'", 'checkout screen hosted card channel');
assertIncludes(checkoutScreen, "queryClient.invalidateQueries({ queryKey: ['store'] })", 'checkout screen lifecycle refetch');

const paymentScreen = read('src/features/checkout/MobilePaymentScreen.tsx');
assertIncludes(paymentScreen, 'WebBrowser.openBrowserAsync', 'payment screen secure browser');
assertIncludes(paymentScreen, "AppState.addEventListener('change'", 'payment screen resume verification');
assertIncludes(paymentScreen, 'paymentApi.verifyWithStatus', 'payment screen backend verification');
assertIncludes(paymentScreen, 'paymentApi.getAttempt', 'payment screen backend attempt refresh');
assertIncludes(paymentScreen, 'clearPendingMobileCheckout', 'payment screen pending cleanup');
assertIncludes(paymentScreen, "finalStatus === 'PAID'", 'payment screen success branch');
assertNotIncludes(paymentScreen, 'markPaid', 'payment screen must not mark paid locally');

const myBagSheet = read('components/bagging/MyBagSheet.tsx');
assertIncludes(myBagSheet, "router.push('/checkout'", 'my bag checkout route');
assertIncludes(myBagSheet, 'mobile-checkout-cta', 'my bag checkout cta');
assertNotIncludes(myBagSheet, 'mobile-checkout-disabled-cta', 'my bag sheet');

const sessionCleanup = read('src/auth/sessionCleanup.ts');
assertIncludes(sessionCleanup, 'MOBILE_PENDING_CHECKOUT_STORAGE_KEY', 'logout clears pending checkout');

console.log('mobile checkout safety contract passed');
