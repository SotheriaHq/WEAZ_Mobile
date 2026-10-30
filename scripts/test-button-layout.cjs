// Measure the real rendered Button tree with Yoga, including auto-height rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
global.IS_REACT_ACT_ENVIRONMENT = true;
const flatten = value => Array.isArray(value)
  ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : (value || {});
const modules = new Map();
const native = {
  View: 'View', Pressable: 'Pressable',
  StyleSheet: { create: value => value, flatten, absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } },
  Easing: { quad: value => value, out: value => value },
  Animated: {
    View: 'View', Value: class { constructor(value) { this.value = value; } },
    timing: () => ({}), parallel: () => ({ start() {} }),
  },
};
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  modules.set(file, module.exports);
  const localRequire = name => {
    if (name === 'react') return React;
    if (name === 'react-native') return native;
    if (name === 'expo-linear-gradient') return { LinearGradient: 'View' };
    if (name === '@/components/ui/AppText') return {
      AppText: props => React.createElement('Text', props, props.children),
    };
    if (name === '@/components/ui/MuseLoader') return {
      MuseLoader: ({ size }) => React.createElement('View', { style: { width: size, height: size } }),
    };
    if (name === '@/src/theme/ThemeProvider') return {
      useTheme: () => ({ theme: tokens.themes.dark }),
    };
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
const { Button } = load(process.env.WIEZ_BUTTON_SOURCE || path.join(root, 'components/ui/Button.tsx'));

async function main() {
  const { default: Yoga } = process.env.WIEZ_YOGA_MODULE
    ? await import(pathToFileURL(process.env.WIEZ_YOGA_MODULE).href)
    : await import('yoga-layout');
  const measured = new Map();
  function nodeFor(element) {
    const node = Yoga.Node.create();
    const style = flatten(element.props?.style);
    const setters = { width: 'setWidth', height: 'setHeight', minWidth: 'setMinWidth',
      minHeight: 'setMinHeight', maxWidth: 'setMaxWidth', maxHeight: 'setMaxHeight',
      flex: 'setFlex', flexGrow: 'setFlexGrow', flexShrink: 'setFlexShrink', flexBasis: 'setFlexBasis' };
    for (const [key, setter] of Object.entries(setters)) if (style[key] !== undefined) node[setter](style[key]);
    node.setFlexDirection(style.flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN);
    if (style.alignSelf === 'stretch') node.setAlignSelf(Yoga.ALIGN_STRETCH);
    if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER);
    if (style.justifyContent === 'center') node.setJustifyContent(Yoga.JUSTIFY_CENTER);
    if (style.gap !== undefined) node.setGap(Yoga.GUTTER_ALL, style.gap);
    for (const [key, edge] of [['paddingHorizontal', Yoga.EDGE_HORIZONTAL], ['paddingVertical', Yoga.EDGE_VERTICAL]]) {
      if (style[key] !== undefined) node.setPadding(edge, style[key]);
    }
    if (style.borderWidth !== undefined) node.setBorder(Yoga.EDGE_ALL, style.borderWidth);
    if (style.marginTop !== undefined) node.setMargin(Yoga.EDGE_TOP, style.marginTop);
    if (element.props?.testID) measured.set(element.props.testID, node);
    if (element.type === 'Text') {
      const text = (element.children || []).join('');
      node.setMeasureFunc(width => {
        // Deterministic glyph measurement; Yoga computes the surrounding layout.
        const fullWidth = text.length * 8;
        const limit = Number.isFinite(width) ? Math.max(1, width) : fullWidth;
        const lines = element.props.numberOfLines === 1 ? 1 : Math.max(1, Math.ceil(fullWidth / limit));
        return { width: Math.min(fullWidth, limit), height: lines * 24 };
      });
    } else {
      for (const child of element.children || []) {
        if (typeof child !== 'object' || flatten(child.props?.style).position === 'absolute') continue;
        node.insertChild(nodeFor(child), node.getChildCount());
      }
    }
    return node;
  }
  let cases = 0;
  for (const width of [200, 320, 390, 768]) for (const loading of [false, true]) for (const fullWidth of [false, true]) {
    let tree;
    await renderer.act(() => {
      tree = renderer.create(React.createElement('View', { style: { width } },
        React.createElement('View', { style: { flexDirection: 'row', gap: 8 } },
          React.createElement(Button, { title: "Don't allow", variant: 'secondary', fullWidth, style: { flex: 1 }, testID: 'left' }),
          React.createElement(Button, { title: 'Allow optional analytics and measurement', loading,
            variant: 'secondary', fullWidth, style: { flex: 1 }, testID: 'right' })),
        React.createElement(Button, { title: 'Continue', fullWidth: true, testID: 'full' })));
    });
    measured.clear();
    const layout = nodeFor(tree.toJSON());
    try {
      layout.calculateLayout(width, undefined, Yoga.DIRECTION_LTR);
      const left = measured.get('left').getComputedLayout();
      const right = measured.get('right').getComputedLayout();
      assert.ok(left.height >= tokens.button.md.height, `Left action collapsed: ${JSON.stringify(left)}`);
      assert.ok(right.height >= tokens.button.md.height, `Right action collapsed: ${JSON.stringify(right)}`);
      assert.ok(left.width >= 44 && right.width >= 44, 'both actions remain touchable');
      assert.ok(Math.abs(left.width - right.width) <= 1, 'row flex is allocated to the button roots');
      assert.ok(left.width + right.width + 8 <= width + 1, 'action row stays inside its sheet');
      if (width <= 390) assert.ok(right.height >= 72, 'long labels wrap instead of disappearing');
      assert.equal(measured.get('full').getComputedWidth(), width, 'existing full-width controls remain full width');
      cases++;
    } finally {
      layout.freeRecursive();
      await renderer.act(() => tree.unmount());
    }
  }
  console.log(`Button Yoga layout: ${cases} width/loading cases passed, including wrapped labels and auto-height footer rows.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
