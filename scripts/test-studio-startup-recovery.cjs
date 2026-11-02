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
console.log('Studio startup recovery: focus, background, resume, cleanup and failure checks passed.');
