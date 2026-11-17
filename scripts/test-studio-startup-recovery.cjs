const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../app/(tabs)/studio/webview.tsx'), 'utf8');
const ast = ts.createSourceFile('webview.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let watchdog;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect') {
    const callback = node.arguments[0];
    if (callback && ts.isCallExpression(callback)) {
      const body = callback.arguments[0];
      if (body?.getText(ast).includes("if (!webUrl || loadState !== 'loading')")) watchdog = body.getText(ast);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(watchdog, 'The startup watchdog must belong to the focused Studio screen.');
const timers = new Map();
let nextId = 0;
let listener;
let removed = 0;
const recovered = [];
const state = {
  currentState: 'active',
  addEventListener(event, callback) {
    assert.equal(event, 'change');
    listener = callback;
    return { remove() { removed += 1; listener = undefined; } };
  },
};
const context = {
  webUrl: 'https://weaz.me/studio', loadState: 'loading', AppState: state,
  READY_TIMEOUT_MS: 25000,
  recoverStudio: (...args) => recovered.push(args),
  setTimeout(callback, delay) { assert.equal(delay, 25000); timers.set(++nextId, callback); return nextId; },
  clearTimeout(id) { timers.delete(id); },
};
const code = ts.transpileModule(`module.exports = ${watchdog}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
context.module = { exports: null };
vm.runInNewContext(code, context);
const cleanup = context.module.exports();
assert.equal(timers.size, 1);
state.currentState = 'background'; listener();
assert.equal(timers.size, 0, 'Backgrounding must cancel a pending reload.');
state.currentState = 'active'; listener();
assert.equal(timers.size, 1, 'Resume must grant a fresh timeout.');
Array.from(timers.values())[0]();
assert.deepEqual(recovered, [['ready-timeout']]);
cleanup();
assert.equal(timers.size, 0, 'Leaving Studio must cancel the watchdog.');
assert.equal(removed, 1);
context.loadState = 'ready';
assert.equal(context.module.exports(), undefined);
assert.equal(timers.size, 0, 'A ready page must not start a loading watchdog.');

const failure = source.match(/case 'BOOT_FAILED':([\s\S]*?)\n\s*case 'PONG':/);
assert.ok(failure, 'The web startup failure must stop the native loader.');
const result = { sessionEstablishedRef: { current: true }, resolvedRouteKey: 'overview' };
const states = [];
vm.runInNewContext(`switch ('BOOT_FAILED') { case 'BOOT_FAILED': ${failure[1]} }`, {
  ...result, setErrorMessage: (message) => assert.match(message, /could not start/),
  setLoadState: (value) => states.push(value), trackStudioWebViewEvent: () => {},
});
assert.equal(result.sessionEstablishedRef.current, false);
assert.deepEqual(states, ['error'], 'A startup failure must never establish a ready session.');
// Regression (17 Nov 2026): a brand that had just signed up opened store
// setup and got "Studio unavailable — session expired" with a Close button.
// A sign-in refusal now gets one fresh handoff silently; only a refusal that
// survives it is shown, and the panel offers Retry, never Close.
const authCase = source.match(/case 'HANDOFF_FAILED':([\s\S]*?)\n\s*case 'PROFILE_SETUP_REQUIRED':/);
assert.ok(authCase, 'The sign-in refusal handler must exist.');
const windowMs = Number(source.match(/const AUTH_AUTO_RETRY_WINDOW_MS = ([\d_]+);/)?.[1].replace(/_/g, ''));
assert.ok(windowMs > 0, 'The automatic sign-in retry must be bounded by a window.');
let now = 1_000_000;
const auth = {
  sessionEstablishedRef: { current: true },
  lastAuthAutoRetryAtRef: { current: 0 },
  retries: 0,
  states: [],
  messages: [],
};
const runAuth = (message) => vm.runInNewContext(
  `switch (message.type) { case 'AUTH_REQUIRED': case 'HANDOFF_FAILED': ${authCase[1]} }`,
  {
    message,
    Date: { now: () => now },
    AUTH_AUTO_RETRY_WINDOW_MS: windowMs,
    resolvedRouteKey: 'essentials',
    sessionEstablishedRef: auth.sessionEstablishedRef,
    lastAuthAutoRetryAtRef: auth.lastAuthAutoRetryAtRef,
    trackStudioWebViewEvent: () => {},
    retry: () => { auth.retries += 1; },
    setErrorMessage: (value) => auth.messages.push(value),
    setLoadState: (value) => auth.states.push(value),
  },
);
runAuth({ type: 'AUTH_REQUIRED', reason: 'missing_user' });
assert.equal(auth.retries, 1, 'The first refusal must hand the page a fresh session.');
assert.deepEqual(auth.states, [], 'The first refusal must not show the error panel.');
now += 1_000;
runAuth({ type: 'AUTH_REQUIRED', reason: 'missing_user' });
assert.equal(auth.retries, 1, 'A second refusal inside the window must not reload again (no loop).');
assert.deepEqual(auth.states, ['error']);
assert.match(auth.messages[0], /Retry/);
assert.doesNotMatch(auth.messages.join(' '), /expired|Close Studio/, 'The panel must not blame an expired session or send people to Close.');
now += windowMs + 1;
runAuth({ type: 'HANDOFF_FAILED', reason: 'network_or_cors_error' });
assert.equal(auth.retries, 2, 'Once the window has passed, a new refusal gets its own fresh handoff.');

const errorPanel = source.match(/\{loadState === 'error' \? \(([\s\S]*?)\) : null\}/);
assert.ok(errorPanel, 'The Studio error panel must exist.');
assert.match(errorPanel[1], /title="Retry"/);
assert.doesNotMatch(errorPanel[1], /closeStudio|title="Close"/, 'The error panel offers Retry only.');

console.log('Studio startup recovery: focus, background, resume, cleanup, failure and sign-in retry checks passed.');
