const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
const query = require('@tanstack/react-query');
const root = path.resolve(__dirname, '..');
global.IS_REACT_ACT_ENVIRONMENT = true;

const modules = new Map();
const mocks = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (mocks.has(name)) return mocks.get(name);
    if (name === 'react') return React;
    if (name === '@tanstack/react-query') return query;
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      if (fs.existsSync(base + suffix)) return load(base + suffix);
    }
    throw new Error(`Unexpected import: ${name}`);
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
  modules.set(file, module.exports);
  return module.exports;
}

const noop = () => {};
const host = name => props => React.createElement(name, props, props.children);
const animation = { duration() { return this; } };
mocks.set('react-native', { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable',
  Platform: { OS: 'android' }, StyleSheet: { create: value => value },
  InteractionManager: { runAfterInteractions: () => ({ cancel: noop }) } });
mocks.set('react-native-reanimated', { __esModule: true, default: { View: 'View' },
  FadeIn: animation, FadeOut: animation, LinearTransition: animation });
mocks.set('react-native-safe-area-context', { SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) });
const navigations = [];
mocks.set('expo-router', { router: { replace: value => navigations.push(value), setParams: noop },
  useLocalSearchParams: () => ({ recoveryTaskId: 'task', blank: '1' }) });
for (const name of ['AppBackButton', 'AppBottomSheet', 'AppFloatingMenu', 'AppLoader',
  'AppSelectSheet', 'AppText', 'Button', 'Card', 'Chip', 'Input', 'OptionRow',
  'RequiredFieldLabel', 'StableImage', 'ThemedSwitch', 'KeyboardAwareFormScroll', 'KeyboardStickyFooter']) {
  mocks.set(`@/components/ui/${name}`, new Proxy({}, { get: (_, key) => host(String(key)) }));
}
for (const name of ['DesignTaxonomyProposalField', 'DesignMediaStrip']) {
  mocks.set(`@/src/features/design-editor/${name}`, { [name]: host(name) });
}
mocks.set('@/src/utils/mobileNavigation', { drillDownPush: noop });
mocks.set('@/src/utils/perf', { perfMeasure: noop });
mocks.set('@/src/utils/navPerf', { navPerf: new Proxy({}, { get: () => noop }) });
mocks.set('@/src/perf/commitCost', { useCommitCost: noop });
// Review feedback loads over the network; this test renders the composer for
// draft recovery, where there is no review to show.
mocks.set('@/src/features/content-review/reviewFeedback', { useReviewFeedback: () => null });
mocks.set('@/components/content-review/ReviewFeedbackCard', { ReviewFeedbackCard: () => null, ReviewFieldHint: () => null });
const { tokens } = load(path.join(root, 'src/styles/tokens.ts'));
mocks.set('@/src/theme/ThemeProvider', { useTheme: () => ({ theme: tokens.themes.dark, scheme: 'dark' }) });
const providerSource = fs.readFileSync(path.join(root, 'src/features/design-editor/DesignEditorProvider.tsx'), 'utf8');
const providerAst = ts.createSourceFile('provider.tsx', providerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let form;
function findInitialForm(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(providerAst) === 'INITIAL_FORM') {
    form = new Function(`return (${node.initializer.getText(providerAst)})`)();
  }
  ts.forEachChild(node, findInitialForm);
}
findInitialForm(providerAst);
assert.ok(form);
const saved = [];
const state = { booting: true, isEditMode: true, activeDesignId: 'design-1',
  form: { ...form, title: 'Recovered draft' }, categories: [], subCategories: [],
  assets: [], filterDimensions: [], filterSelection: {}, measurementPoints: [], customMeasurementKeys: [],
  saveState: { action: null }, save: action => saved.push(action), canSaveDraft: true };
mocks.set('@/src/features/design-editor/DesignEditorProvider', {
  useDesignEditor: () => state, DESIGN_CUSTOM_ORDER_DEFAULTS: {},
});
mocks.set('@/src/api/TagsApi', { __esModule: true, default: {} });

async function composerRegression() {
  const Composer = load(process.env.WIEZ_COMPOSER_SOURCE || path.join(root, 'app/(tabs)/catalog/create-design/composer.tsx')).default;
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const tree = () => React.createElement(query.QueryClientProvider, { client }, React.createElement(Composer));
  let screen;
  await renderer.act(async () => { screen = renderer.create(tree()); });
  for (const booting of [false, true, false]) {
    state.booting = booting;
    await renderer.act(async () => { screen.update(tree()); });
  }
  const draftButton = screen.root.findAllByType('Button').find(node =>
    node.props.title === 'Save draft');
  assert.ok(draftButton, 'Recovered draft has a save action');
  await renderer.act(async () => { draftButton.props.onPress(); });
  assert.deepEqual(saved, ['draft']);
  assert.deepEqual(navigations, [], 'Loading/retry must not bounce the recovered draft home');
  await renderer.act(async () => { screen.unmount(); });
  client.clear();
}

async function catalogueRegression() {
  let offline = false;
  let revision = 1;
  let reads = 0;
  const network = { get: async url => {
    reads++;
    if (offline) throw new Error('offline');
    const status = url.startsWith('/designs/my/drafts') ? 'DRAFT' : 'IN_REVIEW';
    return { data: [{ id: `${status}-${revision}`, title: `Design ${revision}`, status }] };
  } };
  mocks.set('./httpClient', { apiClient: network });
  mocks.set('@/src/query/queryClient', { WIEZ_QUERY_STALE_TIME_MS: 180000, WIEZ_MEDIA_URL_GC_TIME_MS: 3600000 });
  const { brandApi } = load(path.join(root, 'src/api/BrandApi.ts'));
  mocks.set('@/src/api/BrandApi', { brandApi });
  mocks.set('@/src/api/DesignApi', {});
  const hooks = load(path.join(root, 'src/query/catalogQueries.ts'));
  const { queryKeys } = load(path.join(root, 'src/query/queryKeys.ts'));
  const { refreshCatalogQueries } = load(path.join(root, 'src/query/catalogFreshness.ts'));
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let values;
  function Catalogue() {
    values = { drafts: hooks.useBrandDraftsQuery({ ownerId: 'owner' }),
      review: hooks.useBrandInReviewQuery({ ownerId: 'owner' }) };
    return React.createElement('Catalogue', { status: values.drafts.status,
      drafts: values.drafts.data, review: values.review.data });
  }
  let screen;
  await renderer.act(async () => {
    screen = renderer.create(React.createElement(query.QueryClientProvider, { client }, React.createElement(Catalogue)));
  });
  const settle = () => renderer.act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  await settle();
  assert.equal(values.drafts.data[0].id, 'DRAFT-1');
  assert.equal(values.review.data[0].id, 'IN_REVIEW-1');
  const otherKey = queryKeys.brand.collections('other', { status: 'DRAFT' });
  client.setQueryData(otherKey, ['untouched']);
  revision = 2;
  await renderer.act(async () => { await refreshCatalogQueries(client, 'owner', 'owner'); });
  await settle();
  assert.equal(values.drafts.data[0].id, 'DRAFT-2', 'Route re-entry refreshes even within staleTime');
  assert.equal(values.review.data[0].id, 'IN_REVIEW-2', 'Unselected tab data and counts refresh together');
  offline = true;
  const originalError = console.error;
  try {
    console.error = noop;
    await renderer.act(async () => { await refreshCatalogQueries(client, 'owner', 'owner'); });
    await settle();
    assert.equal(values.drafts.isError, true);
    assert.equal(values.drafts.data[0].id, 'DRAFT-2', 'Network errors retain cached cards');
    assert.equal(values.review.data[0].id, 'IN_REVIEW-2');
    offline = false;
    revision = 3;
    await renderer.act(async () => { await refreshCatalogQueries(client, 'owner', 'owner'); });
    await settle();
    assert.equal(values.drafts.data[0].id, 'DRAFT-3', 'One retry recovers every mounted bucket');
    assert.equal(values.review.data[0].id, 'IN_REVIEW-3');
    assert.deepEqual(client.getQueryData(otherKey), ['untouched'], 'No other account is refreshed or cleared');
    const before = reads;
    await refreshCatalogQueries(client, null, null);
    assert.equal(reads, before, 'No signed-out request');
  } finally {
    console.error = originalError;
    await renderer.act(async () => { screen.unmount(); });
    client.clear();
  }
}

(async () => {
  await composerRegression();
  await catalogueRegression();
  console.log('Draft loading/retry/save and catalogue route/error/recovery scenarios PASS.');
})().catch(error => { console.error(error); process.exitCode = 1; });
