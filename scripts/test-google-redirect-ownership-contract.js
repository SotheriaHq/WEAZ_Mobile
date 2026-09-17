/**
 * A Google OAuth callback arrives as an ordinary Android VIEW intent, so EVERY
 * `Linking` listener in the app sees it. Exactly one of them may act on it.
 *
 * When that was not true, the notification deep-link router also handled the
 * callback. It has no route for `/oauthredirect`, so `routeForNotification`
 * fell through every branch to its default and issued
 * `router.replace('/notifications')` while sign-in was still in flight —
 * dropping people into a signed-out shell at the moment they had just
 * authenticated successfully. Nothing threw, nothing logged, and the sign-in
 * itself looked like it had simply failed.
 *
 * These checks are static because the failure is an ABSENCE — a guard nobody
 * remembers to re-add — and because `app/_layout.tsx` cannot be imported
 * outside a React Native runtime.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { URL } = require('whatwg-url-minimum');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const layoutSource = read('app/_layout.tsx');
const recoverySource = read('src/auth/googleRedirectRecovery.ts');
const googleProviderSource = read(
  'node_modules/expo-auth-session/build/providers/Google.js',
);

const failures = [];
const check = (name, assertion) => {
  let passed = false;
  let detail = '';
  try {
    passed = assertion() === true;
  } catch (error) {
    detail = ` (${error.message})`;
  }
  if (!passed) failures.push(`${name}${detail}`);
};

/**
 * Compile the predicate out of the module and run it for real. The rest of
 * `googleRedirectRecovery.ts` imports expo-secure-store and react-native, so
 * the file as a whole cannot load here — but this function is self-contained
 * and its behaviour is the thing worth testing.
 */
function loadPredicate() {
  const snippet = recoverySource.match(
    /const GOOGLE_REDIRECT_PATH[\s\S]*?export function isGoogleAuthRedirectUrl[\s\S]*?\n}/,
  );
  if (!snippet) throw new Error('isGoogleAuthRedirectUrl not found in source');

  const compiled = ts.transpileModule(
    `${snippet[0]}\nmodule.exports = { isGoogleAuthRedirectUrl };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;

  const sandbox = { module: { exports: {} }, exports: {}, URL };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(compiled, sandbox);
  return sandbox.module.exports.isGoogleAuthRedirectUrl;
}

const isGoogleAuthRedirectUrl = loadPredicate();

check('recognises the Android Google callback', () =>
  isGoogleAuthRedirectUrl('com.wiez.wiez:/oauthredirect?code=abc&state=xyz'),
);

check('recognises the callback with no query string', () =>
  isGoogleAuthRedirectUrl('com.wiez.wiez:/oauthredirect'),
);

check('ignores ordinary in-app deep links', () =>
  !isGoogleAuthRedirectUrl('wiezmobile://designs/123') &&
  !isGoogleAuthRedirectUrl('https://weaz.me/profile?tab=orders') &&
  !isGoogleAuthRedirectUrl('com.wiez.wiez:/notifications'),
);

check('ignores nullish and unparseable input', () =>
  !isGoogleAuthRedirectUrl(null) &&
  !isGoogleAuthRedirectUrl(undefined) &&
  !isGoogleAuthRedirectUrl('') &&
  !isGoogleAuthRedirectUrl('not a url'),
);

/**
 * The path is not ours to choose: expo-auth-session builds the native redirect
 * URI as `${applicationId}:/oauthredirect`. If a future Expo version changes
 * that shape, the predicate silently stops matching and the hijack returns —
 * so assert the two stay in lock-step.
 */
check('matches the redirect shape expo-auth-session actually builds', () =>
  googleProviderSource.includes(':/oauthredirect') &&
  recoverySource.includes('"/oauthredirect"'),
);

check('the deep-link listener skips Google callbacks', () =>
  /const handleUrl = \(\{ url \}: \{ url: string \}\) => \{\s*if \(isGoogleAuthRedirectUrl\(url\)\) return;/.test(
    layoutSource,
  ),
);

check('the cold-start initial URL path skips Google callbacks', () =>
  // The launch URL may be passed through `claimFreshLaunchUrl` (replay filter)
  // first; the Google skip must still guard whatever comes out of it.
  /const initialUrl = await (?:claimFreshLaunchUrl\(await )?Linking\.getInitialURL\(\)\)?;\s*if \(initialUrl && !isGoogleAuthRedirectUrl\(initialUrl\)\)/.test(
    layoutSource,
  ),
);

check('the recovery gate still owns Google callbacks', () =>
  layoutSource.includes('captureGoogleAuthRedirectIfLive(url)') &&
  layoutSource.includes('recoverGoogleAuthRedirect(url)'),
);

if (failures.length) {
  console.error('google redirect ownership contract FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('google redirect ownership contract: 8 checks passed');
