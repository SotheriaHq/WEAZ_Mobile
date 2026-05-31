const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(source, expected, label) {
  assert(source.includes(expected), `${label} must include ${JSON.stringify(expected)}`);
}

function assertNotIncludes(source, forbidden, label) {
  assert(!source.includes(forbidden), `${label} must not include ${JSON.stringify(forbidden)}`);
}

function assertMatches(source, pattern, label) {
  assert(pattern.test(source), `${label} must match ${pattern}`);
}

const queryKeys = read('src/query/queryKeys.ts');
assertIncludes(queryKeys, "cart: (userId?: string | null)", 'cart query key');
assertIncludes(queryKeys, "['store', 'cart', normalizeId(userId)]", 'cart query key');
assertIncludes(queryKeys, 'wishlistRoot: (userId?: string | null)', 'wishlist query root');
assertIncludes(queryKeys, "['store', 'wishlist', normalizeId(userId)]", 'wishlist query root');
assertIncludes(queryKeys, "['store', 'bagCount', normalizeId(userId)]", 'bag count query key');
assertIncludes(queryKeys, "root: (userId?: string | null) => ['saved', normalizeId(userId)]", 'saved root query key');
assertIncludes(queryKeys, "['saved', resolved.userId, 'batch', resolved.targetType", 'saved batch query key');

const queryPersistor = read('src/query/queryKeys.ts');
assertNotIncludes(queryPersistor, "scope === 'cart'", 'persisted query allowlist');
assertNotIncludes(queryPersistor, "scope === 'wishlist'", 'persisted query allowlist');
assertNotIncludes(queryPersistor, "scope === 'bagCount'", 'persisted query allowlist');

const storeApi = read('src/api/StoreApi.ts');
assertIncludes(storeApi, "apiClient.get('/bag/count')", 'bag count endpoint');
assertIncludes(storeApi, "apiClient.get('/store/cart')", 'cart read endpoint');
assertIncludes(storeApi, "apiClient.post('/store/cart'", 'cart add endpoint');
assertIncludes(storeApi, 'apiClient.delete(`/store/cart/${cartItemId}`', 'cart remove endpoint');
assertIncludes(storeApi, "apiClient.get('/store/wishlist'", 'wishlist read endpoint');
assertIncludes(storeApi, "apiClient.post('/store/wishlist'", 'wishlist save endpoint');
assertIncludes(storeApi, 'apiClient.delete(`/store/wishlist/${productId}`', 'wishlist remove endpoint');
assertIncludes(storeApi, "apiClient.get('/custom-orders/checkout-bag'", 'custom bag read endpoint');
assertNotIncludes(storeApi, 'AsyncStorage', 'StoreApi lifecycle source of truth');

const savedItemsApi = read('src/api/SavedItemsApi.ts');
assertIncludes(savedItemsApi, 'const getLifecycleUserId', 'saved item user scope');
assertIncludes(savedItemsApi, 'queryKeys.saved.root(getLifecycleUserId())', 'saved invalidation user scope');
assertIncludes(savedItemsApi, 'queryKeys.saved.batch(getLifecycleUserId(), targetType, targetIds)', 'saved batch user scope');
assertIncludes(savedItemsApi, "apiClient.post('/saved'", 'saved item endpoint');
assertIncludes(savedItemsApi, "apiClient.delete('/saved'", 'unsaved item endpoint');

const buyerOrdersApi = read('src/api/BuyerOrdersApi.ts');
assertIncludes(buyerOrdersApi, "apiClient.get('/store/orders'", 'standard order list endpoint');
assertIncludes(buyerOrdersApi, 'apiClient.get(`/store/orders/${orderId}`)', 'standard order detail endpoint');
assertIncludes(buyerOrdersApi, "apiClient.get('/custom-orders'", 'custom order list endpoint');
assertNotIncludes(buyerOrdersApi, '/order/my-orders', 'buyer orders API');

const bagCountContext = read('src/features/bagging/BagCountContext.tsx');
assertIncludes(bagCountContext, 'queryKeys.store.bagCount(user?.id)', 'bag count user-scoped query');
assertIncludes(bagCountContext, "AppState.addEventListener('change'", 'bag count foreground refetch');
assertIncludes(bagCountContext, "nextState === 'active'", 'bag count foreground refetch');

const useMobileBagging = read('src/features/bagging/useMobileBagging.ts');
assertIncludes(useMobileBagging, "const { status: authStatus, user } = useAuth()", 'bagging user identity');
assertIncludes(useMobileBagging, 'const authIdentityRef', 'bagging cache identity guard');
assertIncludes(useMobileBagging, 'clearCachedBagStatus();', 'bagging cache clears on identity/app changes');
assertIncludes(useMobileBagging, 'setStandardCart(null);', 'bagging local cart state clears on user switch');

const sessionCleanup = read('src/auth/sessionCleanup.ts');
assertIncludes(sessionCleanup, "'store'", 'private store query cleanup');
assertIncludes(sessionCleanup, "'saved'", 'private saved query cleanup');
assertIncludes(sessionCleanup, 'threadly.pendingBagAction.v1', 'pending bag action cleanup');
assertIncludes(sessionCleanup, 'MOBILE_PENDING_CHECKOUT_STORAGE_KEY', 'pending checkout cleanup');
assertIncludes(sessionCleanup, 'clearMobileMarketSignalQueue()', 'market lifecycle cleanup');
assertIncludes(sessionCleanup, 'purgeMobilePersistedQueryCache()', 'persisted query cleanup');

const authContext = read('src/auth/AuthContext.tsx');
assertMatches(
  authContext,
  /await clearMobilePrivateSessionState\(\{\s*client:\s*queryClient,\s*deactivatePushToken:\s*false,\s*\}\);[\s\S]*apiClient\.post\(\s*'\/auth\/login'/,
  'sign-in must clear prior user lifecycle cache before login',
);

const checkoutGate = read('src/features/checkout/mobileCheckoutGate.ts');
assertIncludes(checkoutGate, 'MOBILE_CHECKOUT_ENABLED = env.mobileCheckout.enabled', 'mobile checkout flag');

const paymentApi = read('src/api/PaymentApi.ts');
assertMatches(
  paymentApi,
  /apiClient\.post\(\s*['"]\/payment\/initialize-unified['"]/,
  'checkout remains backend-owned',
);
assertIncludes(paymentApi, "apiClient.post('/payment/verify'", 'checkout payment status remains backend-owned');

console.log('Mobile lifecycle sync contract checks passed.');
