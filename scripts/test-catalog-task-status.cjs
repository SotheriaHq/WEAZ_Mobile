const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}
const mobile = load(path.join(root, 'src/utils/catalogTaskStatus.ts'));
const cases = [
  [{ action: 'publish', status: 'failed' }, 'FAILED'],
  [{ action: 'draft', status: 'failed' }, 'FAILED'],
  [{ action: 'publish', status: 'running' }, 'IN_REVIEW'],
  [{ action: 'publish', status: 'complete' }, 'IN_REVIEW'],
  [{ action: 'publish', status: 'publishing' }, 'IN_REVIEW'],
  [{ action: 'publish', status: 'settling' }, 'IN_REVIEW'],
  [{ action: 'draft', status: 'running' }, 'DRAFT'],
  [{ action: 'publish', status: 'cancelled' }, null],
];
for (const [input, expected] of cases) assert.equal(mobile.resolveCatalogTaskBucket(input), expected);
const failed = { id: 'attempt-1', designId: 'design-1', action: 'publish', status: 'failed', updatedAt: 1 };
assert.equal(mobile.countCatalogTaskBucket([{ id: 'design-1' }], [failed], 'IN_REVIEW'), 0);
assert.equal(mobile.countCatalogTaskBucket([], [failed], 'FAILED'), 1);
assert.equal(mobile.countCatalogTaskBucket([{ id: 'design-1' }], [failed], 'FAILED'), 1);
assert.equal(mobile.filterCatalogServerItems([{ id: 'design-1' }], [failed], 'DRAFT').length, 0);
assert.equal(mobile.filterCatalogServerItems([{ id: 'unrelated' }], [failed], 'DRAFT').length, 1);
const retry = { ...failed, id: 'attempt-2', status: 'running', updatedAt: 2 };
assert.equal(mobile.countCatalogTaskBucket([], [failed, retry], 'FAILED'), 0);
assert.equal(mobile.countCatalogTaskBucket([], [failed, retry], 'IN_REVIEW'), 1);
const webRoot = process.env.WIEZ_WEB_REPO_ROOT || path.resolve(root, '../fthreadly');
const webFile = path.join(webRoot, 'src/utils/catalogTaskStatus.ts');
if (fs.existsSync(webFile)) {
  const web = load(webFile);
  for (const [input, expected] of cases) assert.equal(web.resolveCatalogTaskBucket(input), expected, 'Web/native status drift');
  console.log('Web/native catalog status decisions agree.');
} else console.log('SKIP sibling drift check: matching web policy is not checked out. Native policy cases passed.');
console.log('Catalog task buckets: failures, server deduplication and latest retry passed.');
