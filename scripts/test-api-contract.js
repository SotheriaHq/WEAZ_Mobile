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
    `${label} must not include stale endpoint ${JSON.stringify(forbidden)}`,
  );
}

const apiDir = path.join(repoRoot, 'src', 'api');
const apiSources = fs
  .readdirSync(apiDir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => [name, read(path.join('src', 'api', name))]);

for (const [name, source] of apiSources) {
  assertNotIncludes(source, '/auth/update-profile/', name);
  assertNotIncludes(source, '/order/my-orders', name);
}

const profileApi = read('src/api/ProfileApi.ts');
assertIncludes(profileApi, "apiClient.get('/users/me/profile')", 'own profile load');
assertIncludes(profileApi, "apiClient.patch('/users/me/profile'", 'own profile update');
assertIncludes(profileApi, "apiClient.get('/store/orders'", 'profile order summary');

const buyerOrdersApi = read('src/api/BuyerOrdersApi.ts');
assertIncludes(buyerOrdersApi, "apiClient.get('/store/orders'", 'buyer standard order list');
assertIncludes(buyerOrdersApi, 'apiClient.get(`/store/orders/${orderId}`)', 'buyer standard order detail');
assertIncludes(buyerOrdersApi, "apiClient.get('/custom-orders'", 'buyer custom order list');

const publicLinks = read('src/api/PublicLinkApi.ts');
assertIncludes(publicLinks, '/users/lookup/username/', 'public profile username lookup');
assertIncludes(publicLinks, '/public/storefronts/', 'public storefront lookup');

const storeApi = read('src/api/StoreApi.ts');
assertIncludes(storeApi, "apiClient.get('/store-collections'", 'store collections list');
assertIncludes(storeApi, "apiClient.get('/products/market'", 'market products list');
assertIncludes(storeApi, "apiClient.get('/custom-orders/checkout-bag'", 'custom checkout bag');

const marketApi = read('src/api/MarketApi.ts');
assertIncludes(marketApi, "'/market/signals/batch'", 'market signal batch');

const messagingApi = read('src/api/MessagingApi.ts');
assertIncludes(messagingApi, "'/messaging/inbox'", 'messaging inbox');
assertIncludes(messagingApi, '/messaging/threads/', 'messaging thread routes');

const notificationsApi = read('src/api/NotificationsApi.ts');
assertIncludes(notificationsApi, "'/notifications/unread-count'", 'notification unread count');
assertIncludes(notificationsApi, "'/notifications/push-tokens'", 'push token registration');

const mobileMe = read('app/(tabs)/me.tsx');
assertIncludes(mobileMe, "endpoint: '/store/orders'", 'profile order diagnostic endpoint');

const checkoutGate = read('src/features/checkout/mobileCheckoutGate.ts');
assertIncludes(checkoutGate, 'MOBILE_CHECKOUT_ENABLED = env.mobileCheckout.enabled', 'mobile checkout flag');

const paymentApi = read('src/api/PaymentApi.ts');
assertIncludes(paymentApi, "'/payment/initialize-unified'", 'mobile payment initialize');
assertIncludes(paymentApi, "'/payment/verify'", 'mobile payment verification');
assertIncludes(paymentApi, '`/payment/attempts/${encodeURIComponent(reference)}`', 'mobile payment attempt status');
assertIncludes(paymentApi, "'Idempotency-Key': idempotencyKey", 'mobile payment idempotency');

console.log('Mobile API contract parity checks passed.');
