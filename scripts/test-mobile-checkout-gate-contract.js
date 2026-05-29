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

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0, `${label} is missing ${JSON.stringify(first)}`);
  assert(secondIndex >= 0, `${label} is missing ${JSON.stringify(second)}`);
  assert(
    firstIndex < secondIndex,
    `${label} must check ${JSON.stringify(first)} before ${JSON.stringify(second)}`,
  );
}

function assertGuardBeforePostInFunction(source, functionName, postNeedle, label) {
  const functionIndex = source.indexOf(functionName);
  const postIndex = source.indexOf(postNeedle, functionIndex);
  const guardIndex = source.indexOf('assertMobileCheckoutEnabled();', functionIndex);
  assert(functionIndex >= 0, `${label} is missing ${functionName}`);
  assert(postIndex >= 0, `${label} is missing ${postNeedle}`);
  assert(guardIndex >= 0, `${label} is missing checkout guard`);
  assert(
    guardIndex < postIndex,
    `${label} must call assertMobileCheckoutEnabled before the API request`,
  );
}

const gate = read('src/features/checkout/mobileCheckoutGate.ts');
assertIncludes(gate, 'MOBILE_CHECKOUT_ENABLED = false', 'mobile checkout gate');
assertIncludes(
  gate,
  'Checkout is temporarily unavailable on mobile during MVP testing. Please use the web app to complete payment.',
  'mobile checkout gate',
);
assertIncludes(gate, 'assertMobileCheckoutEnabled', 'mobile checkout gate');

const checkoutRoute = read('app/checkout.tsx');
const paymentRoute = read('app/payment.tsx');
assertIncludes(checkoutRoute, 'MobileCheckoutUnavailableScreen', 'checkout route');
assertIncludes(paymentRoute, 'MobileCheckoutUnavailableScreen', 'payment route');

const unavailableScreen = read('src/features/checkout/MobileCheckoutUnavailableScreen.tsx');
assertIncludes(unavailableScreen, 'getMobileCheckoutUnavailableMessage', 'unavailable screen');
assertIncludes(unavailableScreen, 'Continue browsing', 'unavailable screen');
assertIncludes(unavailableScreen, 'View orders', 'unavailable screen');

const myBagSheet = read('components/bagging/MyBagSheet.tsx');
assertIncludes(myBagSheet, 'getMobileCheckoutUnavailableMessage', 'My Bag sheet');
assertIncludes(myBagSheet, 'mobile-checkout-disabled-cta', 'My Bag sheet');
assertIncludes(myBagSheet, 'Checkout unavailable', 'My Bag sheet');
assertIncludes(myBagSheet, 'refreshGlobalBagCount', 'My Bag sheet still supports bag browsing');

const customBagSheet = read('components/bagging/CustomBagSheet.tsx');
assertIncludes(customBagSheet, 'isMobileCheckoutEnabled', 'custom bag sheet');
assertIncludes(customBagSheet, 'getMobileCheckoutUnavailableMessage', 'custom bag sheet');
assertBefore(
  customBagSheet,
  'if (!checkoutEnabled)',
  'MobileStoreApi.previewCustomPrice',
  'custom checkout intent flow',
);
assertBefore(
  customBagSheet,
  'if (!checkoutEnabled)',
  'addCustomOrder(product.id',
  'custom order add flow',
);

const storeApi = read('src/api/StoreApi.ts');
assertIncludes(storeApi, 'assertMobileCheckoutEnabled', 'Store API checkout guard');
assertGuardBeforePostInFunction(
  storeApi,
  'async previewCustomPrice',
  "apiClient.post('/custom-orders/price-preview'",
  'custom price preview API',
);
assertGuardBeforePostInFunction(
  storeApi,
  'async addCustomOrderToBag',
  "apiClient.post(\n      '/custom-orders'",
  'custom order checkout API',
);

const apiDir = path.join(repoRoot, 'src', 'api');
const apiSources = fs
  .readdirSync(apiDir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => [name, read(path.join('src', 'api', name))]);

for (const [name, source] of apiSources) {
  assert(
    !source.includes('/payment/initialize-unified'),
    `${name} must not initialize unified payment while mobile checkout is gated`,
  );
  assert(
    !source.includes('Paystack'),
    `${name} must not wire Paystack while mobile checkout is gated`,
  );
}

const buyerOrdersApi = read('src/api/BuyerOrdersApi.ts');
assertIncludes(buyerOrdersApi, 'async list()', 'buyer order list remains available');
assertIncludes(buyerOrdersApi, 'async getById(orderId: string)', 'buyer order detail remains available');

console.log('mobile checkout gate contract passed');
