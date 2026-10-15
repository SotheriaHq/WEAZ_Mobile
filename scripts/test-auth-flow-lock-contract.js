/**
 * Auth flow lock contract.
 *
 * The defect this guards against: on the auth screen a person pressed
 * "Continue with Google" and then, immediately, "Create an account". The Google
 * account chooser opened over the screen; the link underneath had already
 * pushed the signup route; dismissing the chooser revealed a signup form nobody
 * asked for, with a Google sign-in still resolving against the abandoned
 * screen. Two auth flows, one tap apart, both live.
 *
 * Half of this file exercises the real state machine in a sandbox. The other
 * half asserts the screens are actually wired to it — a correct lock that no
 * control calls is worth nothing.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const lockPath = path.join(repoRoot, 'src', 'auth', 'authFlowLock.ts');
const hookPath = path.join(repoRoot, 'src', 'auth', 'useAuthFlowLock.ts');
const loginPath = path.join(repoRoot, 'app', '(auth)', 'login.tsx');
const signupPath = path.join(repoRoot, 'app', '(auth)', 'signup.tsx');
const packageJsonPath = path.join(repoRoot, 'package.json');

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
}

/**
 * A fresh copy per test. The lock is module state on purpose (the Google flow
 * outlives the screen that starts it), so tests must not share one instance.
 */
function loadLock() {
  const module = { exports: {} };
  vm.runInNewContext(
    compile(lockPath),
    { module, exports: module.exports, Array, Set, Promise },
    { filename: lockPath },
  );
  return module.exports;
}

function testExclusion() {
  const lock = loadLock();

  assert.equal(lock.isAuthFlowBusy(), false, 'A fresh lock must be free.');

  const releaseGoogle = lock.acquireAuthFlowLock('google');
  assert.ok(releaseGoogle, 'The first action must get the lock.');
  assert.equal(lock.isAuthFlowBusy(), true);
  assert.equal(lock.getActiveAuthAction(), 'google');

  assert.equal(
    lock.acquireAuthFlowLock('signup'),
    null,
    'A second action must be refused while the first holds the lock — this is the tap on "Create an account" behind the Google chooser.',
  );

  releaseGoogle();
  assert.equal(lock.isAuthFlowBusy(), false, 'Releasing must free the lock.');
  assert.ok(
    lock.acquireAuthFlowLock('signup'),
    'The next action must be able to take a released lock.',
  );
}

function testAcquisitionIsSynchronous() {
  const lock = loadLock();

  // The whole point of module state over `useState`: two presses landing in the
  // same tick both read a React state value that has not re-rendered yet. Here
  // the second acquisition sees the first one's write immediately.
  const results = [
    lock.acquireAuthFlowLock('google'),
    lock.acquireAuthFlowLock('google'),
  ];

  assert.ok(results[0], 'First same-tick press wins.');
  assert.equal(results[1], null, 'Second same-tick press must be refused.');
}

function testStaleReleaseCannotUnlockANewerHolder() {
  const lock = loadLock();

  const releaseFirst = lock.acquireAuthFlowLock('google');
  releaseFirst();

  const releaseSecond = lock.acquireAuthFlowLock('signup');
  assert.ok(releaseSecond);

  // An abandoned flow's `finally` arriving late must not open the door for the
  // flow that replaced it.
  releaseFirst();
  assert.equal(
    lock.getActiveAuthAction(),
    'signup',
    'A stale release must not free a lock it does not own.',
  );

  releaseSecond();
  assert.equal(lock.isAuthFlowBusy(), false);
}

function testReleaseIsIdempotent() {
  const lock = loadLock();
  const release = lock.acquireAuthFlowLock('google');

  release();
  const releaseNext = lock.acquireAuthFlowLock('password-login');
  release();

  assert.equal(
    lock.getActiveAuthAction(),
    'password-login',
    'Calling a release twice must not free the next holder.',
  );
  releaseNext();
}

function testSubscribersSeeEveryTransition() {
  const lock = loadLock();
  const seen = [];
  const unsubscribe = lock.subscribeToAuthFlowLock(() => {
    seen.push(lock.getActiveAuthAction());
  });

  const release = lock.acquireAuthFlowLock('google');
  release();

  assert.deepEqual(
    seen,
    ['google', null],
    'Both the acquire and the release must notify, or the screen never re-enables.',
  );

  unsubscribe();
  lock.acquireAuthFlowLock('signup');
  assert.equal(seen.length, 2, 'Unsubscribing must stop notifications.');
}

async function testRunExclusiveRefusesSilently() {
  const lock = loadLock();
  let secondRan = false;

  let releaseFirst;
  const firstSettled = lock.runExclusiveAuthAction(
    'google',
    () => new Promise((resolve) => {
      releaseFirst = resolve;
    }),
  );

  await lock.runExclusiveAuthAction('signup', async () => {
    secondRan = true;
  });

  assert.equal(
    secondRan,
    false,
    'The refused action must not run its work at all — not run it and discard the result.',
  );

  releaseFirst();
  await firstSettled;
  assert.equal(lock.isAuthFlowBusy(), false, 'The lock must be free once the work settles.');
}

async function testRunExclusiveReleasesOnThrow() {
  const lock = loadLock();

  await assert.rejects(
    () => lock.runExclusiveAuthAction('google', async () => {
      throw new Error('network down');
    }),
    /network down/,
    'Errors must propagate — every call site owns its own reporting.',
  );

  assert.equal(
    lock.isAuthFlowBusy(),
    false,
    'A failed action must release the lock, or the screen is dead until a reload.',
  );
}

function testLockModuleStaysDependencyFree() {
  const source = fs.readFileSync(lockPath, 'utf8');
  assert.doesNotMatch(
    source,
    /^\s*import\s/m,
    'authFlowLock.ts must stay import-free so this test can exercise the real state machine instead of its source text.',
  );
}

function testScreensAreWiredToTheLock() {
  for (const [label, screenPath] of [
    ['login', loginPath],
    ['signup', signupPath],
  ]) {
    const source = fs.readFileSync(screenPath, 'utf8');

    assert.match(
      source,
      /useAuthFlowLock\(\)/,
      `${label} must take the auth flow lock.`,
    );

    // The original bug was a navigation, not a submission. Every route change
    // reachable by a press on these screens has to go through the guard.
    assert.doesNotMatch(
      source,
      /onPress=\{\(\)\s*=>\s*drillDownPush\(/,
      `${label} has a navigation link that is live during an auth flow — wrap it in authFlow.guard.`,
    );
    assert.doesNotMatch(
      source,
      /onPress=\{\(\)\s*=>\s*router\.replace\(/,
      `${label} has a router.replace press handler that is live during an auth flow — wrap it in authFlow.guard.`,
    );

    // Google is the flow that hands control to another app, so its button must
    // be inert while anything else holds the lock.
    const googleButton = source.match(/<GoogleSignInButton[\s\S]*?\/>/);
    assert.ok(googleButton, `${label} must render the Google button.`);
    assert.match(
      googleButton[0],
      /disabled=/,
      `${label}'s Google button must carry a disabled prop driven by the lock.`,
    );
    assert.match(
      googleButton[0],
      /authFlow\.run\('google'/,
      `${label}'s Google button must start its flow through the lock.`,
    );
  }
}

function testHookReadsTheLockAtPressTime() {
  const source = fs.readFileSync(hookPath, 'utf8');

  // `busy` is a render-old value. A press racing the re-render must still be
  // stopped, so the guard has to consult the module directly.
  assert.match(
    source,
    /isAuthFlowBusy\(\)/,
    'guard() must read the lock synchronously at press time, not trust the rendered `busy` flag.',
  );
  assert.match(
    source,
    /useSyncExternalStore/,
    'The hook must subscribe to the lock so controls re-enable when it frees.',
  );
}

function testScriptIsRegistered() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.equal(
    pkg.scripts['test:auth-flow-lock-contract'],
    'node scripts/test-auth-flow-lock-contract.js',
    'The contract must be runnable by name.',
  );
}

async function main() {
  testExclusion();
  testAcquisitionIsSynchronous();
  testStaleReleaseCannotUnlockANewerHolder();
  testReleaseIsIdempotent();
  testSubscribersSeeEveryTransition();
  await testRunExclusiveRefusesSilently();
  await testRunExclusiveReleasesOnThrow();
  testLockModuleStaysDependencyFree();
  testScreensAreWiredToTheLock();
  testHookReadsTheLockAtPressTime();
  testScriptIsRegistered();

  console.log('auth flow lock contract: 11 checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
