const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/uploadFinalizeRetry.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const api = {};
const delays = [];
new Function('exports', 'setTimeout', compiled)(api, (callback, delay) => {
  delays.push(delay); setImmediate(callback);
});

(async () => {
  let attempts = 0;
  const conflict = { response: { status: 409, data: { code: 'UPLOAD_FINALIZING' } } };
  assert.deepEqual(await api.retryUploadCompletion(async () => {
    if (++attempts === 1) throw conflict;
    return { id: 'committed' };
  }), { id: 'committed' });
  assert.equal(attempts, 2);
  for (const error of [{ response: { status: 409, data: { code: 'DRAFT_VERSION_CONFLICT' } } },
    { response: { status: 403 } }, { code: 'ERR_CANCELED' }, new Error('Offline')]) {
    attempts = 0;
    await assert.rejects(api.retryUploadCompletion(async () => { attempts++; throw error; }), (caught) => caught === error);
    assert.equal(attempts, 1);
  }
  attempts = 0;
  await assert.rejects(api.retryUploadCompletion(async () => { attempts++; throw conflict; }), (caught) => caught === conflict);
  assert.equal(attempts, 3);
  assert.equal(delays.length, 3);
  assert(delays.every((delay) => delay >= 250 && delay < 600));
  console.log('Native upload completion recovery: 6 scenarios passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
