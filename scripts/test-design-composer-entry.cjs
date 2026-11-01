const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { BaseRouter } = require('expo-router/build/react-navigation/routers/BaseRouter');
const root = path.resolve(__dirname, '..');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}
const { AUTO_OPEN_CONSUMED_PARAMS, isBlankComposerStart } = load(path.join(root, 'src/features/design-editor/designComposerEntry.ts'));

for (const params of [{ blank: '1' }, { blank: 'true' }, { blank: ['1'] }, { autoOpenPickerSource: 'library' }, { autoOpenPickerSource: ['camera'] }]) {
  assert.equal(isBlankComposerStart(params), true, JSON.stringify(params));
}
for (const params of [{}, { blank: '0' }, { recoveryTaskId: 'task-1' }]) {
  assert.equal(isBlankComposerStart(params), false, JSON.stringify(params));
}

// Runs the installed router's own reducer, so this breaks if setParams stops being one merge.
const arrival = { autoOpenPickerSource: 'library', brandId: 'brand-1' };
const afterSetParams = (params) => BaseRouter.getStateForAction(
  { index: 0, routes: [{ key: 'composer', name: 'composer', params: arrival }] },
  { type: 'SET_PARAMS', payload: { params } },
).routes[0].params;

assert.equal(isBlankComposerStart(arrival), true);
assert.equal(isBlankComposerStart(afterSetParams({ autoOpenPickerSource: undefined })), false, 'Clearing the param alone is the redirect bug');
const consumed = afterSetParams(AUTO_OPEN_CONSUMED_PARAMS);
assert.equal(isBlankComposerStart(consumed), true, 'The empty composer must stay open once the picker launches');
assert.equal(consumed.autoOpenPickerSource, undefined, 'The picker must not open a second time');
assert.equal(consumed.brandId, 'brand-1', 'Other route params must survive');

const composer = fs.readFileSync(path.join(root, 'app/(tabs)/catalog/create-design/composer.tsx'), 'utf8');
assert.match(composer, /const isBlankStart = isBlankComposerStart\(params\);/);
assert.match(composer, /router\.setParams\(AUTO_OPEN_CONSUMED_PARAMS\);/);
assert.match(composer, /!isEditMode &&\s+!isBlankStart &&/);
assert.equal((composer.match(/router\.setParams\(/g) ?? []).length, 1, 'Composer params may only change through the entry handover');
console.log('Design composer entry: the empty composer stays open and the picker opens once.');
