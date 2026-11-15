const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = new Map();
const component = (name) => ({ [name]: name });
const mocks = {
  'react-native': { View: 'View', Pressable: 'Pressable', StyleSheet: { create: (value) => value, absoluteFill: {} } },
  '@/components/ui/AppText': component('AppText'),
  '@/components/ui/AppBackButton': component('AppBackButton'),
  '@/components/ui/Button': component('Button'),
  '@/components/ui/MuseLoader': component('MuseLoader'),
  '@/src/theme/ThemeProvider': { useTheme: () => ({ theme: { colors: { border: '#777777' } } }) },
};
function resolveFile(candidate) {
  return [candidate + '.ts', candidate + '.tsx', path.join(candidate, 'index.ts'), candidate].find((value) => fs.existsSync(value) && fs.statSync(value).isFile());
}
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: (name) => {
    if (mocks[name]) return mocks[name];
    if (name === '@/src/styles/tokens') return load(path.join(root, 'src/styles/tokens.ts'));
    if (name.startsWith('.')) { const resolved = resolveFile(path.resolve(path.dirname(file), name)); assert.ok(resolved, 'Unresolved module ' + name); return load(resolved); }
    return require(name);
  } }, { filename: file });
  return module.exports;
}
const heading = load(path.join(root, 'components/settings/SettingsSectionHeading.tsx')).SettingsSectionHeading({ title: 'Login sessions with a very long device label' });
assert.equal(heading.props.style.flexDirection, 'row');
assert.ok(heading.props.style.gap >= 12, 'the real spacing token leaves at least 12px');
const [label, rule] = heading.props.children;
assert.equal(label.props.accessibilityRole, 'header');
assert.equal(label.props.numberOfLines, undefined);
assert.equal(label.props.style.flexShrink, 1);
assert.equal(rule.props.style[0].height, 2);
assert.ok(rule.props.style[0].flexGrow > 0);
const primitives = load(path.join(root, 'components/settings/SettingsPrimitives.tsx'));
for (const name of ['SettingsSection', 'SettingsPanel']) {
  const rendered = primitives[name]({ title: 'Section', children: 'Body', style: { borderWidth: 8, backgroundColor: '#123456', borderRadius: 32, elevation: 4 } });
  const style = Object.assign({}, ...rendered.props.style.filter(Boolean));
  assert.equal(style.borderWidth, 0, name + ' must remain bare even when a caller passes old card styling');
  assert.equal(style.borderRadius, 0);
  assert.equal(style.backgroundColor, 'transparent');
  assert.equal(style.elevation, 0);
}
const webRoot = process.env.WIEZ_WEB_SECURITY_ROOT || path.resolve(root, '../fthreadly');
const webFile = path.join(webRoot, 'src/components/settings/SettingsSectionHeading.tsx');
if (fs.existsSync(webFile)) {
  const rendered = load(webFile).SettingsSectionHeading({ children: 'Login sessions' });
  const webGap = rendered.props.style?.columnGap ?? (rendered.props.className.split(/\s+/).includes('gap-3') ? 12 : undefined);
  assert.equal(webGap, heading.props.style.gap, 'web/native use the same actual gap');
  const webRule = rendered.props.children[1];
  const webHeight = webRule.props.style?.height ?? (webRule.props.className.split(/\s+/).includes('h-0.5') ? 2 : undefined);
  assert.equal(webHeight, rule.props.style[0].height, 'web/native use the same divider thickness');
  assert.equal(String(rendered.props.children[1].props['aria-hidden']), 'true');
  assert.doesNotMatch(rendered.props.className, /truncate|line-clamp|text-ellipsis/);
} else console.log('SKIP web heading counterpart: sibling web checkout unavailable');
console.log('Actual native Settings heading/panel render and available web counterpart passed.');
