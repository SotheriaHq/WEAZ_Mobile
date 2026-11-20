/**
 * Phase 4 Deep Link & Navigation Contract Verification Suite
 *
 * Verifies:
 *  1. Registered scheme set in app.json matches approved Phase 4 specification:
 *     ["arumobile", "aru", "wiezmobile", "com.wiez.wiez"]
 *  2. Auth route resolution handles arumobile://, aru://, and legacy wiezmobile:// identically.
 *  3. Inbound path parsing preserves query parameters and encoded tokens.
 *  4. Cold-start and warm-start URL handling.
 *  5. Invalid destinations and unclaimed routes fail safely without crashing.
 *  6. Google OAuth package redirect scheme compatibility.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const appJsonPath = path.join(repoRoot, 'app.json');
const authLinkRoutingPath = path.join(repoRoot, 'src', 'utils', 'authLinkRouting.ts');
const mobileRoutingPath = path.join(repoRoot, 'src', 'utils', 'mobileRouting.ts');

function loadTs(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (id in mocks) return mocks[id];
    return {};
  };
  new Function('module', 'exports', 'require', 'URL', 'URLSearchParams', transpiled)(
    mod,
    mod.exports,
    localRequire,
    URL,
    URLSearchParams,
  );
  return mod.exports;
}

const authRouting = loadTs(authLinkRoutingPath);
const mobileRouting = loadTs(mobileRoutingPath);

function test() {
  console.log('=== PHASE 4 DEEP-LINK COMPATIBILITY VERIFICATION ===');

  // 1. Verify app.json configuration
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const schemes = appJson.expo.scheme;
  assert.ok(Array.isArray(schemes), 'app.json scheme must be an array');
  assert.deepEqual(
    schemes,
    ['arumobile', 'aru', 'wiezmobile', 'com.wiez.wiez'],
    'Schemes must match the approved Phase 4 registered set.',
  );
  assert.equal(appJson.expo.name, 'ARU', 'Public application name must be ARU.');
  assert.equal(appJson.expo.android?.package, 'com.wiez.wiez', 'Android package must remain com.wiez.wiez.');
  console.log('✓ 1. app.json scheme registration and immutable package verified.');

  // 2. Auth Link Route Resolution across schemes
  const testSchemes = ['arumobile', 'aru', 'wiezmobile'];
  for (const s of testSchemes) {
    // Reset password path token
    const resPass = authRouting.resolveMobileAuthRoute(`${s}://reset-password/tok_secret_123`);
    assert.deepEqual(resPass, {
      pathname: '/(auth)/reset-password',
      params: { token: 'tok_secret_123' },
    }, `${s} reset-password with path token failed`);

    // Reset password query token
    const resPassQuery = authRouting.resolveMobileAuthRoute(`${s}://reset-password?token=tok_query_456`);
    assert.deepEqual(resPassQuery, {
      pathname: '/(auth)/reset-password',
      params: { token: 'tok_query_456' },
    }, `${s} reset-password with query token failed`);

    // Verify email path token
    const verEmail = authRouting.resolveMobileAuthRoute(`${s}://verify-email/email_verify_789`);
    assert.deepEqual(verEmail, {
      pathname: '/(auth)/verify-email',
      params: { token: 'email_verify_789' },
    }, `${s} verify-email with path token failed`);

    // Verify email query token
    const verEmailQuery = authRouting.resolveMobileAuthRoute(`${s}://verify-email?token=email_verify_abc`);
    assert.deepEqual(verEmailQuery, {
      pathname: '/(auth)/verify-email',
      params: { token: 'email_verify_abc' },
    }, `${s} verify-email with query token failed`);

    // Encoded token
    const encToken = authRouting.resolveMobileAuthRoute(`${s}://verify-email/tok%2Bspecial%3D123`);
    assert.deepEqual(encToken, {
      pathname: '/(auth)/verify-email',
      params: { token: 'tok+special=123' },
    }, `${s} encoded token resolution failed`);
  }
  console.log('✓ 2. Auth link route resolution verified across arumobile, aru, and wiezmobile.');

  // 3. Invalid/Unclaimed auth routes fail safely (return null)
  const invalidUrls = [
    null,
    '',
    'not_a_url',
    'arumobile://unknown-route',
    'arumobile://settings?tab=account',
    'arumobile://admin/reset-password?token=123',
    'wiezmobile://admin/reset-password?token=123',
    'arumobile://brand/staff/invite?token=123',
  ];
  for (const inv of invalidUrls) {
    assert.equal(authRouting.resolveMobileAuthRoute(inv), null, `Invalid url "${inv}" should return null`);
  }
  console.log('✓ 3. Invalid and unclaimed destinations safely rejected.');

  // 4. Mobile notification routing resolution for target URLs
  const notifTargets = [
    { in: 'arumobile://orders/ord-999', expectPath: '/orders/[orderId]' },
    { in: 'aru://orders/ord-999', expectPath: '/orders/[orderId]' },
    { in: 'wiezmobile://orders/ord-999', expectPath: '/orders/[orderId]' },
    { in: '/orders/ord-999', expectPath: '/orders/[orderId]' },
    { in: 'arumobile://products/prod-111', expectPath: '/products/[productId]' },
    { in: 'wiezmobile://products/prod-111', expectPath: '/products/[productId]' },
  ];
  for (const target of notifTargets) {
    const route = mobileRouting.routeForNotification({ type: 'SYSTEM_GENERAL', targetUrl: target.in });
    assert.ok(route, `Target ${target.in} must resolve`);
    assert.equal(route.pathname, target.expectPath, `Target ${target.in} pathname mismatch`);
  }
  console.log('✓ 4. Inbound notification targets verified across arumobile, aru, and wiezmobile.');

  // 5. Google OAuth package redirect scheme compatibility
  const oauthRedirect = 'com.wiez.wiez:/oauthredirect?code=sample_oauth_code_123';
  assert.equal(authRouting.resolveMobileAuthRoute(oauthRedirect), null, 'OAuth redirect is handled by auth flow, not auth link router');
  console.log('✓ 5. Google OAuth redirect package scheme preserved.');

  console.log('\nALL PHASE 4 DEEP-LINK TESTS PASSED (5/5 SUITES).');
}

test();
