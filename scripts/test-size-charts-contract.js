/**
 * Size charts contract: the charts screen, its place on the island, the
 * fittings round trip, and the two sheet fixes that shipped with it.
 *
 * Executes the pure modules for real (transpiled, sandboxed) and reads the
 * screens as source for the wiring that cannot run under Node.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

function load(relativePath, mocks = {}) {
  const filePath = path.join(repoRoot, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier in mocks) return mocks[specifier];
      throw new Error(`Unmocked import "${specifier}" in ${relativePath}`);
    },
    Math,
    Number,
  }, { filename: filePath });
  return module.exports;
}

const { SIZE_CHARTS } = load('src/data/sizeCharts.ts');
const { findClosestChartRow, describeDelta } = load('src/features/sizing/chartMatch.ts');
const womenTops = SIZE_CHARTS.find((chart) => chart.id === 'women-tops');

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('every chart names the point behind each column, and grades on one of them', () => {
  for (const chart of SIZE_CHARTS) {
    assert.equal(chart.measureKeys.length, chart.measureLabels.length, `${chart.id} keys/labels`);
    assert.ok(chart.measureKeys.includes(chart.primaryKey), `${chart.id} primary is a column`);
    for (const row of chart.rows) assert.equal(row.measures.length, chart.measureKeys.length);
  }
});

check('a shopper who measured nothing on this chart gets no match, not a guess', () => {
  assert.equal(findClosestChartRow(womenTops, {}), null);
  assert.equal(findClosestChartRow(womenTops, { INSEAM: 80 }), null);
});

check('an exact body lands on its own row', () => {
  // UK 12: bust 92, waist 74, hip 100
  const match = findClosestChartRow(womenTops, { CHEST_BUST: 92, WAIST: 74, HIP_SEAT: 100 });
  assert.equal(womenTops.rows[match.rowIndex].uk, '12');
  assert.deepEqual([...match.missing], []);
  assert.equal(match.usedPrimary, true);
});

check('the grading measurement outweighs the others', () => {
  // Bust says UK 16 (102); waist alone says UK 12 (74). Bust must win.
  const match = findClosestChartRow(womenTops, { CHEST_BUST: 102, WAIST: 74 });
  assert.equal(womenTops.rows[match.rowIndex].uk, '16');
});

check('it reports which measurements it used and which are missing', () => {
  const match = findClosestChartRow(womenTops, { WAIST: 74 });
  assert.deepEqual([...match.basedOn], ['WAIST']);
  assert.deepEqual([...match.missing], ['CHEST_BUST', 'HIP_SEAT']);
  assert.equal(match.usedPrimary, false);
});

check('outside the chart is the nearest end, never clamped into a false fit', () => {
  const huge = findClosestChartRow(womenTops, { CHEST_BUST: 180 });
  assert.equal(huge.rowIndex, womenTops.rows.length - 1);
  const delta = describeDelta(180, womenTops.rows[huge.rowIndex].measures[0]);
  assert.equal(delta.tone, 'over');
  assert.match(delta.label, /54 cm over/);
});

check('deltas are stated as measurements, with a tape-measure tolerance', () => {
  assert.equal(describeDelta(92.6, 92).tone, 'match');
  assert.equal(describeDelta(95, 92).label, '3 cm over');
  assert.equal(describeDelta(88, 92).label, '4 cm under');
});

check('Charts is on the shopper island, in (tabs), and off the brand island', () => {
  const config = read('src/navigation/nativeIslandConfig.ts');
  assert.match(config, /charts: 'charts'/);
  assert.match(config, /normalized === '\/charts'\) return NATIVE_ISLAND_KEYS\.charts/);
  assert.match(config, /NATIVE_ISLAND_KEYS\.charts\) return '\/\(tabs\)\/charts'/);
  assert.match(
    config,
    /item\.key !== NATIVE_ISLAND_KEYS\.bag && item\.key !== NATIVE_ISLAND_KEYS\.charts/,
    'brands have no fittings to read against a chart',
  );
  const layout = read('app/(tabs)/_layout.tsx');
  assert.match(layout, /<Tabs\.Screen\s+name="charts"/);
  assert.match(layout, /NATIVE_ISLAND_KEYS\.charts\) return 'charts'/);
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/(tabs)/charts.tsx')));
});

check('six island items stay a fixed row; only more than six scroll', () => {
  const nav = read('components/navigation/NativeIslandBottomNav.tsx');
  assert.match(
    nav,
    /const scrollableDock = items\.length > 6;/,
    'at > 5 the six-item shopper dock scrolls and pushes Me off the screen',
  );
});

check('the old size guide still resolves, and Settings points at Charts', () => {
  assert.match(read('app/size-guide.tsx'), /<Redirect href=\{'\/charts'/);
  assert.match(read('app/settings.tsx'), /topLevelNavigate\('\/charts'/);
});

check('charts and fittings link both ways, and charts re-read on focus', () => {
  const charts = read('app/(tabs)/charts.tsx');
  assert.match(charts, /useFocusEffect/, 'returning from fittings must refresh where you land');
  assert.match(charts, /pathname: '\/fittings', params: \{ from: 'charts' \}/);
  assert.match(charts, /MeasurementSilhouette/);
  const fittings = read('app/fittings.tsx');
  assert.match(fittings, /from === 'charts' && router\.canGoBack\(\)/, 'must step back, not stack a second charts');
  assert.match(fittings, /Save your changes first\?/, 'leaving mid-edit must not discard typed numbers');
});

check('the backdrop drags the sheet, and scrolling is off when content fits', () => {
  const sheet = read('components/ui/AppBottomSheet.tsx');
  assert.match(sheet, /backdropDragResponder\.panHandlers/);
  assert.match(sheet, /scrollEnabled: bodyOverflows/);
  assert.match(sheet, /bodyScrollYRef\.current <= 1/, 'Android reports sub-pixel offsets at rest');
});

check('the custom bag sheet reads delivery from the address book, not six bare fields', () => {
  const sheet = read('components/bagging/CustomBagSheet.tsx');
  assert.match(sheet, /<DeliveryAddressBook/);
  assert.match(sheet, /formatMeasurementLabel\(key\)/, 'no more pattern keys like "Waist To Hip"');
  assert.doesNotMatch(sheet, /label="Customer name"/);
  // The profile endpoint carries no phone; the signed-in account does.
  assert.match(sheet, /user\?\.phoneNumber/, 'email and phone must prefill from the account');
});

check('checkout uses the same address book, not its own form and pickers', () => {
  const checkout = read('src/features/checkout/MobileCheckoutScreen.tsx');
  assert.match(checkout, /<DeliveryAddressBook/);
  assert.doesNotMatch(checkout, /AppSelectSheet/, 'the book owns the location pickers now');
  assert.doesNotMatch(checkout, /label="Street address"/);
});

check('the address book offers choose, edit, remove and add another, and saves the whole book', () => {
  const book = read('components/delivery/DeliveryAddressBook.tsx');
  assert.match(book, /title="Edit"/);
  assert.match(book, /title="Remove"/);
  assert.match(book, /Add another address/);
  assert.match(book, /ProfileApi\.replaceDeliveryAddresses/);
  assert.match(book, /<LocationCascadeFields/, 'reuse the shared country/state/city pickers');
});

check('address book list maths: newest first, capped, replace by id, validated like the server', () => {
  const lib = load('src/features/delivery/deliveryAddressBook.ts', {
    '@/src/utils/phoneNumber': {
      isValidPhone: (value) => /^\+?\d{10,15}$/.test(String(value).replace(/\s/g, '')),
      normalizePhoneToE164: (value) => (String(value).startsWith('+') ? String(value) : null),
    },
  });
  const make = (id, updatedAt) => ({
    id, firstName: '', lastName: '', customerName: `Name ${id}`, contactEmail: 'a@b.co',
    phone: '+2348030000000', street: 'Street', apartment: '', city: 'Ikeja', state: 'Lagos',
    postalCode: '', country: 'Nigeria', updatedAt,
  });
  const book = [make('a', '2026-01-01'), make('b', '2026-02-01')];
  const edited = { ...make('a', '2026-03-01'), city: 'Lekki' };
  const next = lib.upsertAddress(book, edited);
  assert.deepEqual([...next.map((entry) => entry.id)], ['a', 'b'], 'edited address becomes newest');
  assert.equal(next[0].city, 'Lekki');
  assert.equal(next.length, 2, 'editing replaces, never duplicates');

  const full = Array.from({ length: 10 }, (_, index) => make(`x${index}`, `2026-01-${String(index + 1).padStart(2, '0')}`));
  const grown = lib.upsertAddress(full, make('new', '2026-12-01'));
  assert.equal(grown.length, lib.MAX_DELIVERY_ADDRESSES);
  assert.equal(grown[0].id, 'new');
  assert.ok(!grown.some((entry) => entry.id === 'x0'), 'the oldest drops off, as the server would');

  assert.deepEqual([...lib.removeAddress(book, 'a').map((entry) => entry.id)], ['b']);

  const errors = lib.validateAddressDraft(lib.emptyAddressDraft({ customerName: 'Jo' }));
  for (const field of ['customerName', 'contactEmail', 'phone', 'street', 'city', 'state']) {
    assert.ok(errors[field], `${field} must be required`);
  }
  const saved = lib.toSavedAddress({ ...lib.emptyAddressDraft(), customerName: 'Tale  Roll Junior', street: 'x' });
  assert.equal(saved.firstName, 'Tale');
  assert.equal(saved.lastName, 'Roll Junior');
});

check('sheets close on one curve, slide fully out, and never restart a drag', () => {
  const sheet = read('components/ui/AppBottomSheet.tsx');
  assert.match(sheet, /dragExitRef\.current = true/);
  assert.match(sheet, /if \(!dragExitRef\.current\)/);
  assert.match(sheet, /opacity: sheetOpacity\.value/, 'the sheet slides out solid; only the backdrop fades');
  assert.match(sheet, /SHEET_CLOSE_FALLBACK_MS = 450/, 'the fallback must outlast every close');
  const wiez = read('src/components/ui/WiezSheet.tsx');
  assert.match(wiez, /<AppBottomSheet/, 'action menus close like every other sheet');
  assert.doesNotMatch(wiez, /animationType="fade"/);
});

check('selectors commit after the close, and keep every label on one line', () => {
  const select = read('components/ui/AppSelectSheet.tsx');
  const onPress = select.slice(select.indexOf('selected={option.value === (pickedValue ?? value)}'));
  assert.match(onPress, /pendingValueRef\.current = option\.value;\s*onClose\(\);/);
  assert.doesNotMatch(onPress.slice(0, 1200), /onChange\(option\.value\)/, 'no form re-render mid-animation');
  assert.match(select, /\{option\.label\}/);
  assert.match(select, /numberOfLines=\{1\}\s*adjustsFontSizeToFit\s*minimumFontScale=\{0\.8\}\s*>\s*\{option\.label\}/);
  const field = read('components/forms/SelectField.tsx');
  assert.match(field, /numberOfLines=\{1\}\s*adjustsFontSizeToFit\s*minimumFontScale=\{0\.8\}\s*>\s*\{label\}/);
});

check('the custom sheet shows the price before anything is bagged, as web does', () => {
  const sheet = read('components/bagging/CustomBagSheet.tsx');
  assert.match(sheet, /label: 'Get price'/);
  assert.match(sheet, /label: 'Add to bag'/);
  // Pricing and bagging are separate handlers; one tap must not do both.
  const getPrice = sheet.slice(sheet.indexOf('const handleGetPrice'), sheet.indexOf('const handleAddToBag'));
  assert.doesNotMatch(getPrice, /addCustomOrder\(/, 'pricing must never add to the bag');
  assert.match(sheet, /quote\.priceSummary\.grandTotal/);
  assert.doesNotMatch(
    sheet,
    /noDirectMatchAcknowledged: true,/,
    'the size-match note must be shown and acknowledged, not auto-accepted',
  );
  const api = read('src/api/StoreApi.ts');
  assert.match(api, /priceSummary: toCustomPriceSummary\(summary\)/, 'the API client must keep the price it is sent');
});

check('a custom order keeps a street address, not just a city', () => {
  const sheet = read('components/bagging/CustomBagSheet.tsx');
  assert.match(sheet, /street: selectedAddress\.street,/);
});

check('the two custom-order sheets say which step they are', () => {
  assert.match(read('components/bagging/BagFittingsSheet.tsx'), /'Step 1 of 2'/);
  assert.match(read('components/bagging/CustomBagSheet.tsx'), /'Step 2 of 2'/);
  assert.match(read('src/features/bagging/BagFlowProvider.tsx'), /afterFittings=\{customAfterFittings\}/);
});

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${String(error && error.message).split('\n')[0]}`);
  }
}
if (failed) {
  console.error(`Size charts contract: ${failed} of ${checks.length} checks failed`);
  process.exit(1);
}
console.log(`Size charts contract: ${checks.length} checks passed`);
