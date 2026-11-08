/**
 * Sign-in actions stay visible and in reach.
 *
 * On a phone, the password step showed the password field and then nothing:
 * SIGN IN, "Forgot password?", Google and "Create an account" were gone, and
 * taps on the empty card opened Forgot password. The cause was the ghost
 * "Forgot password?" Button: aligned right with no width of its own, its
 * shrinkable, wrapping label measured against almost nothing on Android, so the
 * button grew taller than the screen with its label centred off-screen and
 * pushed every control below it out of reach.
 *
 * This renders the REAL Button and pins the decisions:
 *   - a button that sizes to its label (aligned to one side, no width/flex)
 *     gets a one-line, non-shrinking label;
 *   - a button given a width (flex: 1, fullWidth, plain stretch) still wraps,
 *     which is what the long side-by-side consent buttons need;
 *   - the sign-in "Forgot password?" is a link (InlineNavLink), not a Button.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.IS_REACT_ACT_ENVIRONMENT = true;

const flatten = (value) =>
  Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value || {};
const native = {
  View: 'View',
  Pressable: 'Pressable',
  StyleSheet: {
    create: (value) => value,
    flatten,
    absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  },
  Easing: { quad: (value) => value, out: (value) => value },
  Animated: {
    View: 'View',
    Value: class {
      constructor(value) {
        this.value = value;
      }
    },
    timing: () => ({}),
    parallel: () => ({ start() {} }),
  },
};
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  modules.set(file, module.exports);
  const localRequire = (name) => {
    if (name === 'react') return React;
    if (name === 'react-native') return native;
    if (name === 'expo-linear-gradient') return { LinearGradient: 'View' };
    if (name === '@/components/ui/AppText') {
      return { AppText: (props) => React.createElement('Text', props, props.children) };
    }
    if (name === '@/components/ui/MuseLoader') return { MuseLoader: () => React.createElement('View') };
    if (name === '@/src/theme/ThemeProvider') return { useTheme: () => ({ theme: tokens.themes.dark }) };
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      if (fs.existsSync(base + suffix)) return load(base + suffix);
    }
    throw new Error(`Unexpected import: ${name}`);
  };
  new Function('module', 'exports', 'require', source)(module, module.exports, localRequire);
  return module.exports;
}

const { tokens } = load(path.join(root, 'src/styles/tokens.ts'));
const { Button } = load(path.join(root, 'components/ui/Button.tsx'));

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n  ${error.message}`);
  }
}

function renderLabel(props) {
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(Button, { title: 'Forgot password?', onPress: () => {}, ...props }));
  });
  // Walk past component instances (AppText) to the nearest host views.
  const hostParent = (node) => {
    let parent = node.parent;
    while (parent && typeof parent.type !== 'string') parent = parent.parent;
    return parent;
  };
  const text = tree.root.find((node) => node.type === 'Text');
  const slot = hostParent(text);
  const content = hostParent(slot);
  return {
    lines: text.props.numberOfLines,
    slotShrink: flatten(slot.props.style).flexShrink,
    contentShrink: flatten(content.props.style).flexShrink,
  };
}

for (const alignSelf of ['flex-end', 'flex-start', 'center']) {
  check(`a button aligned ${alignSelf} with no width keeps its label on one unshrunk line`, () => {
    const label = renderLabel({ variant: 'ghost', size: 'xs', style: { alignSelf } });
    assert.equal(label.lines, 1);
    assert.equal(label.slotShrink, 0);
    assert.equal(label.contentShrink, 0);
  });
}

for (const [label, props] of [
  ['flex: 1 (side-by-side pair)', { style: { flex: 1 } }],
  ['fullWidth', { fullWidth: true }],
  ['default stretch', {}],
  ['aligned but given a width', { style: { alignSelf: 'flex-end', width: 200 } }],
]) {
  check(`a button with a width (${label}) may still wrap a long title`, () => {
    const result = renderLabel({ title: 'Allow optional analytics and measurement', ...props });
    assert.equal(result.lines, undefined);
    assert.equal(result.slotShrink, 1);
  });
}

check('sign-in "Forgot password?" is a link, not a Button', () => {
  const login = fs.readFileSync(path.join(root, 'app/(auth)/login.tsx'), 'utf8');
  assert.match(login, /<InlineNavLink\s+label="Forgot password\?"/);
  assert.doesNotMatch(login, /<Button\s+title="Forgot password\?"/);
});

if (failures > 0) {
  console.error(`\n${failures} sign-in action check(s) failed.`);
  process.exit(1);
}
console.log('\nSign-in actions stay visible.');
