const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(source) {
  const result = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', code)(result, result.exports);
  return result.exports.describeRefund;
}
const nativeSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/refundPresentation.ts'), 'utf8');
const native = load(nativeSource);
const states = ['REQUESTED', 'SUBMITTING', 'PROCESSING', 'FAILED', 'NEEDS_ATTENTION', 'SETTLED', 'FUTURE_STATUS', ' settled ', null, undefined, ''];
for (const state of ['REQUESTED', 'SUBMITTING', 'PROCESSING', 'FAILED', 'NEEDS_ATTENTION']) {
  assert.notEqual(native(state).title, 'Refund processed by the payment provider');
}
assert.match(native('SETTLED').description, /additional time/);
assert.equal(native(null), null);
assert.equal(native('FUTURE_STATUS').title, 'Refund status being verified');
const webRoot = process.env.WIEZ_WEB_ROOT || path.resolve(__dirname, '../../fthreadly');
const webPath = path.join(webRoot, 'src/lib/refundPresentation.ts');
if (fs.existsSync(webPath)) {
  const web = load(fs.readFileSync(webPath, 'utf8'));
  const compare = other => { for (const state of states) assert.deepEqual(other(state), native(state), `Refund state drift: ${state}`); };
  compare(web);
  // Prove the contract catches a real incorrect completion decision.
  const broken = load(nativeSource.replace("case 'SETTLED':", "case 'PROCESSING':"));
  assert.throws(() => compare(broken), /Refund state drift/);
  console.log('PASS native/web refund decisions and negative drift control');
} else if (process.env.WIEZ_WEB_ROOT) {
  throw Error('Explicit web checkout has no refund presentation contract');
} else {
  console.log('PASS native refund decisions; web twin skipped because sibling source is not checked out');
}
