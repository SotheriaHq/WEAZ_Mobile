const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const authLinkRoutingPath = path.join(repoRoot, 'src', 'utils', 'authLinkRouting.ts');
const notificationRoutingPath = path.join(repoRoot, 'src', 'utils', 'notificationRouting.ts');
const resetPasswordRoutePath = path.join(repoRoot, 'app', '(auth)', 'reset-password.tsx');
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

  const authLayoutSource = fs.readFileSync(authLayoutPath, 'utf8');
  assert.match(
    authLayoutSource,
    /<Stack\.Screen\s+name="reset-password"\s*\/>/,
    'Auth stack must register reset-password.',
  );

  const resetRouteSource = fs.readFileSync(resetPasswordRoutePath, 'utf8');
  assert.match(resetRouteSource, /useLocalSearchParams/, 'Reset route must read query params.');
  assert.match(resetRouteSource, /confirmPasswordReset\(token,\s*newPassword\)/, 'Reset route must call the reset API with the route token.');
  assert.doesNotMatch(resetRouteSource, /console\.(log|warn|error).*token/, 'Reset route must not log raw tokens.');

  const notificationRoutingSource = fs.readFileSync(notificationRoutingPath, 'utf8');
  assert.match(notificationRoutingSource, /resolveMobileAuthRoute/, 'Deep-link handling must check auth links explicitly.');

  const forgotPasswordSource = fs.readFileSync(forgotPasswordPath, 'utf8');
  assert.match(forgotPasswordSource, /browser/i, 'Forgot-password success copy must mention browser fallback.');
  assert.match(forgotPasswordSource, /web page still works/i, 'Forgot-password success copy must preserve web fallback.');

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
  assert.equal(resolveMobileAuthRoute('threadlymobile://verify-email?token=abc123'), null);
  assert.equal(resolveMobileAuthRoute('threadlymobile://settings?tab=account-security&emailChangeToken=abc123'), null);

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
