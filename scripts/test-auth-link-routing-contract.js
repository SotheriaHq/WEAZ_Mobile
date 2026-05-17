const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const authLinkRoutingPath = path.join(repoRoot, 'src', 'utils', 'authLinkRouting.ts');
const notificationRoutingPath = path.join(repoRoot, 'src', 'utils', 'notificationRouting.ts');
const authApiPath = path.join(repoRoot, 'src', 'api', 'AuthApi.ts');
const resetPasswordRoutePath = path.join(repoRoot, 'app', '(auth)', 'reset-password.tsx');
const verifyEmailRoutePath = path.join(repoRoot, 'app', '(auth)', 'verify-email.tsx');
const authLayoutPath = path.join(repoRoot, 'app', '(auth)', '_layout.tsx');
const forgotPasswordPath = path.join(repoRoot, 'app', '(auth)', 'forgot-password.tsx');
const appJsonPath = path.join(repoRoot, 'app.json');

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  }).outputText;
}

function loadAuthLinkRouting() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    URL,
    URLSearchParams,
  };

  vm.runInNewContext(compile(authLinkRoutingPath), sandbox, {
    filename: authLinkRoutingPath,
  });
  return module.exports;
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function main() {
  assert.equal(fs.existsSync(resetPasswordRoutePath), true, 'Mobile reset-password route must exist.');
  assert.equal(fs.existsSync(verifyEmailRoutePath), true, 'Mobile verify-email route must exist.');

  const authLayoutSource = fs.readFileSync(authLayoutPath, 'utf8');
  assert.match(
    authLayoutSource,
    /<Stack\.Screen\s+name="reset-password"\s*\/>/,
    'Auth stack must register reset-password.',
  );
  assert.match(
    authLayoutSource,
    /<Stack\.Screen\s+name="verify-email"\s*\/>/,
    'Auth stack must register verify-email.',
  );

  const resetRouteSource = fs.readFileSync(resetPasswordRoutePath, 'utf8');
  assert.match(resetRouteSource, /useLocalSearchParams/, 'Reset route must read query params.');
  assert.match(resetRouteSource, /const PASSWORD_MIN_LENGTH = 12;/, 'Reset route must enforce the 12-character password floor.');
  assert.match(resetRouteSource, /passwordIsLongEnough/, 'Reset route must keep short-password validation.');
  assert.match(resetRouteSource, /passwordsMatch/, 'Reset route must keep mismatch validation.');
  assert.match(resetRouteSource, /renderMissingToken/, 'Reset route must include a missing-token state.');
  assert.match(resetRouteSource, /renderSuccess/, 'Reset route must include a success state.');
  assert.match(resetRouteSource, /confirmPasswordReset\(token,\s*newPassword\)/, 'Reset route must call the reset API with the route token.');
  assert.match(resetRouteSource, /router\.replace\('\/login'/, 'Reset route must send the user back to login after success.');
  assert.doesNotMatch(resetRouteSource, /console\.(log|warn|error).*token/, 'Reset route must not log raw tokens.');
  assert.doesNotMatch(resetRouteSource, /\b(useAuth|signIn)\b/, 'Reset route must not automatically log the user in.');

  const verifyEmailRouteSource = fs.readFileSync(verifyEmailRoutePath, 'utf8');
  assert.match(verifyEmailRouteSource, /useLocalSearchParams/, 'Verify route must read query params.');
  assert.match(verifyEmailRouteSource, /firstParamValue\(params\.token\)\.trim\(\)/, 'Verify route must trim route tokens.');
  assert.match(verifyEmailRouteSource, /verifyEmail\(token\)/, 'Verify route must call the verify-email API with the route token.');
  assert.match(verifyEmailRouteSource, /renderMissingToken/, 'Verify route must include a missing-token state.');
  assert.match(verifyEmailRouteSource, /renderVerifying/, 'Verify route must include a verifying/loading state.');
  assert.match(verifyEmailRouteSource, /renderSuccess/, 'Verify route must include a success state.');
  assert.match(verifyEmailRouteSource, /renderError/, 'Verify route must include an invalid-or-expired error state.');
  assert.match(
    verifyEmailRouteSource,
    /router\.replace\(\(isAuthenticated \? '\/\(tabs\)\/me' : '\/login'\)/,
    'Verify route must send authenticated users to profile and guests to login.',
  );
  assert.doesNotMatch(verifyEmailRouteSource, /console\.(log|warn|error).*token/, 'Verify route must not log raw tokens.');
  assert.doesNotMatch(verifyEmailRouteSource, /\bsignIn\b/, 'Verify route must not automatically log the user in.');

  const authApiSource = fs.readFileSync(authApiPath, 'utf8');
  assert.match(authApiSource, /export async function verifyEmail/, 'Mobile AuthApi must expose verifyEmail.');
  assert.match(authApiSource, /apiClient\.get<VerifyEmailResponse>\('\/auth\/verify-email'/, 'Mobile verifyEmail must use the backend verify-email endpoint.');

  const notificationRoutingSource = fs.readFileSync(notificationRoutingPath, 'utf8');
  assert.match(notificationRoutingSource, /resolveMobileAuthRoute/, 'Deep-link handling must check auth links explicitly.');

  const forgotPasswordSource = fs.readFileSync(forgotPasswordPath, 'utf8');
  assert.match(forgotPasswordSource, /browser/i, 'Forgot-password success copy must mention browser fallback.');
  assert.match(forgotPasswordSource, /web page still works/i, 'Forgot-password success copy must preserve web fallback.');

  const mobileEnvExampleSource = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
  assert.match(mobileEnvExampleSource, /EXPO_PUBLIC_API_BASE_URL=/, 'Mobile env example must document API base URL.');
  assert.match(mobileEnvExampleSource, /EXPO_PUBLIC_WEB_APP_URL=/, 'Mobile env example must document web fallback URL.');
  assert.match(
    mobileEnvExampleSource,
    /EXPO_PUBLIC_TRUSTED_WEB_ORIGINS=/,
    'Mobile env example must document trusted web origins.',
  );
  assert.match(
    mobileEnvExampleSource,
    /EXPO_PUBLIC_API_WITH_CREDENTIALS=/,
    'Mobile env example must document API credential mode.',
  );

  const { resolveMobileAuthRoute } = loadAuthLinkRouting();
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('threadlymobile://reset-password?token=%20abc123%20')),
    {
      pathname: '/(auth)/reset-password',
      params: { token: 'abc123' },
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('threadlymobile:///reset-password?token=abc123')),
    {
      pathname: '/(auth)/reset-password',
      params: { token: 'abc123' },
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('https://threadly.example/reset-password?token=web-token')),
    {
      pathname: '/(auth)/reset-password',
      params: { token: 'web-token' },
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('threadlymobile://reset-password')),
    {
      pathname: '/(auth)/reset-password',
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('threadlymobile://verify-email?token=%20abc123%20')),
    {
      pathname: '/(auth)/verify-email',
      params: { token: 'abc123' },
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('threadlymobile:///verify-email?token=abc123')),
    {
      pathname: '/(auth)/verify-email',
      params: { token: 'abc123' },
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('https://threadly.example/verify-email?token=web-token')),
    {
      pathname: '/(auth)/verify-email',
      params: { token: 'web-token' },
    },
  );
  assert.deepEqual(
    toJson(resolveMobileAuthRoute('threadlymobile://verify-email')),
    {
      pathname: '/(auth)/verify-email',
    },
  );
  assert.equal(resolveMobileAuthRoute('threadlymobile://settings?tab=account-security&emailChangeToken=abc123'), null);
  assert.equal(resolveMobileAuthRoute('threadlymobile://change-email/confirm?token=abc123'), null);
  assert.equal(resolveMobileAuthRoute('threadlymobile://admin/reset-password?token=abc123'), null);
  assert.equal(resolveMobileAuthRoute('threadlymobile://brand/staff/invite?token=abc123'), null);

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  assert.equal(appJson.expo.scheme, 'threadlymobile', 'Expo scheme must remain configured.');
  assert.equal(
    appJson.expo.ios?.associatedDomains,
    undefined,
    'Universal Links must not be claimed without associated domains.',
  );
  assert.equal(
    appJson.expo.android?.intentFilters,
    undefined,
    'Android App Links must not be claimed without intent filters.',
  );
}

main();
