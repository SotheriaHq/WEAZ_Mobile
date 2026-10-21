const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.join(__dirname, '../src/features/design-editor/DesignEditorProvider.tsx');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback, genderHelper;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'loadMeasurementPoints') callback = node.initializer.arguments[0].getText(source);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'measurementGenderForAudience') genderHelper = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback && genderHelper);
const requests = [];
let points;
const cache = new Map();
const mountedRef = { current: true };
const lastMeasurementGenderRef = { current: null };
const moduleState = { exports: {} };
const code = ts.transpileModule(genderHelper + '\nmodule.exports = ' + callback, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, {
  module: moduleState, mountedRef, lastMeasurementGenderRef, measurementRequestRef: { current: 0 },
  queryKeys: { measurementPoints: { byGender: (gender) => gender } },
  queryClient: { getQueryData: (key) => cache.get(key) },
  setMeasurementPoints: (value) => { points = value; },
  fetchMeasurementPointsQuery: (gender) => new Promise((resolve, reject) => requests.push({ gender, resolve, reject })),
});
(async () => {
  const load = moduleState.exports;
  const male = load('MALE');
  const female = load('FEMALE');
  requests[1].resolve(['bust']); await female;
  requests[0].resolve(['chest']); await male;
  assert.deepEqual(points, ['bust'], 'Late male response must not replace the selected female options');
  await load('FEMALE');
  assert.equal(requests.length, 2, 'Identical audience is deduplicated');
  const olderFailure = load('MALE');
  const current = load('EVERYBODY');
  requests[2].reject(new Error('offline')); await olderFailure;
  assert.equal(lastMeasurementGenderRef.current, 'all', 'An old failure cannot reset the newest request');
  requests[3].resolve(['general']); await current;
  cache.set('MEN', ['cached-chest']);
  const unmounted = load('MALE');
  assert.deepEqual(points, ['cached-chest'], 'Cached selected options paint immediately');
  mountedRef.current = false;
  requests[4].resolve(['late-chest']); await unmounted;
  assert.deepEqual(points, ['cached-chest'], 'Unmounted editor ignores late responses');
  console.log('Creator option races: reversed responses, deduplication, old failure, immediate cache and unmount passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
