/**
 * Settings sections contract (Rule 37) and bottom clearance.
 *
 * Every Settings section is `Label  ─────────`: the label first, then a 2px
 * divider on the same row with at least 12px clear space; the label wraps and
 * never truncates; the section itself is bare. And the end of every Settings
 * screen stays reachable: the last row, link or button clears the home
 * indicator instead of sitting on it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

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

function settingsScreens() {
  const out = ['app/settings.tsx'];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith('.tsx')) out.push(relative);
    }
  };
  walk('app/settings');
  return out;
}

check('the shared heading is label, then a 2px flexible divider', () => {
  const heading = read('components/settings/SettingsSectionHeading.tsx');
  assert.match(heading, /accessibilityRole="header"/, 'keeps the heading role');
  assert.match(heading, /flexDirection: 'row'/);
  assert.match(heading, /gap: tokens\.spacing\.md/, 'at least 12px between label and divider');
  assert.match(heading, /rule: \{ height: 2, flexGrow: 1/, 'a 2px divider that takes the remaining width');
  assert.match(heading, /label: \{ flexShrink: 1 \}/, 'a long label wraps; the divider yields');
  assert.doesNotMatch(heading, /numberOfLines/, 'the label never truncates');
});

check('the shared section and panel are bare', () => {
  const primitives = read('components/settings/SettingsPrimitives.tsx');
  assert.match(primitives, /<SettingsSectionHeading title=\{title\} \/>/, 'SettingsSection uses the shared heading');
  assert.doesNotMatch(primitives, /divided \?/, 'no closing rule under a panel');
  assert.doesNotMatch(primitives, /from '@\/components\/ui\/Card'/, 'no card around a settings group');
});

const screens = settingsScreens();

check('no Settings screen draws its own uppercase section label', () => {
  for (const file of screens) {
    const source = read(file);
    assert.doesNotMatch(source, /title\.toUpperCase\(\)/, `${file}: use SettingsSectionHeading`);
    assert.doesNotMatch(
      source,
      /variant="captionBold"[^>]*>\s*[A-Z][A-Z /&]{3,}\s*</,
      `${file}: an uppercase caption is a section label; use SettingsSectionHeading`,
    );
  }
});

check('the end of every Settings screen clears the home indicator', () => {
  for (const file of screens) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /Math\.max\(insets\.bottom/,
      `${file}: Math.max lets the last row touch the home indicator; add the inset instead`,
    );
    const addsInset = /paddingBottom: insets\.bottom \+/.test(source);
    const safeAreaBottom =
      /edges=\{\[[^\]]*['"]bottom['"][^\]]*\]\}/.test(source) || // explicit bottom edge
      /<SafeAreaView(?![^>]*edges=)[^>]*>/.test(source); // all edges by default
    assert.ok(addsInset || safeAreaBottom, `${file}: no bottom clearance for the home indicator`);
  }
});

if (failures > 0) {
  console.error(`\n${failures} settings section check(s) failed.`);
  process.exit(1);
}
console.log('\nSettings sections contract holds.');
