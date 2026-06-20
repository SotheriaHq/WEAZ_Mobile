const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  compile,
  createScriptRequire,
} = require('./helpers/mobile-script-require');

const repoRoot = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

function loadTagNormalization() {
  const file = path.join(repoRoot, 'src', 'utils', 'tagNormalization.ts');
  const module = { exports: {} };
  const scriptRequire = createScriptRequire({ repoRoot, mocks: {} });
  vm.runInNewContext(
    compile(file),
    {
      module,
      exports: module.exports,
      require: (request) => scriptRequire(request, file),
    },
    { filename: file },
  );
  return module.exports;
}

function main() {
  const tags = loadTagNormalization();
  assert.equal(tags.normalizeTagValue('  #Aso   Ebi!!  '), 'aso-ebi');
  assert.equal(
    tags.normalizeTagValue('abcdefghijklmnopqrstuvwxMORE'),
    'abcdefghijklmnopqrstuvwx',
  );
  assert.equal(tags.isValidTagValue('a'), false);
  assert.deepEqual(
    Array.from(tags.normalizeTagList(['Aso Ebi', 'aso-ebi', 'Adire'], 10)),
    ['aso-ebi', 'adire'],
  );

  const bottomSheet = read('components/ui/AppBottomSheet.tsx');
  const selectSheet = read('components/ui/AppSelectSheet.tsx');
  const optionRow = read('components/ui/OptionRow.tsx');
  const composer = read('app/(tabs)/catalog/create-design/composer.tsx');
  const themedSwitch = read('components/ui/ThemedSwitch.tsx');

  assert.doesNotMatch(
    bottomSheet,
    /useAnimatedKeyboard/,
    'sheet must have one keyboard event owner',
  );
  assert.match(
    bottomSheet,
    /keyboardActive\?: boolean/,
    'searchable sheets must gate keyboard inset by focus',
  );
  assert.match(
    bottomSheet,
    /resizedBySystem/,
    'Android resize must suppress duplicate keyboard inset',
  );
  assert.match(
    bottomSheet,
    /width:\s*44[\s\S]*height:\s*44/,
    'sheet close action must expose a 44px target',
  );
  assert.match(
    selectSheet,
    /nestedScrollEnabled/,
    'tag overflow must retain Android nested scrolling',
  );
  assert.match(
    selectSheet,
    /keyboardShouldPersistTaps="handled"/,
    'keyboard-open tag actions must remain tappable',
  );
  assert.match(
    selectSheet,
    /keyboardActive=\{focusedInput !== null\}/,
    'tag sheet inset must follow its input focus',
  );
  assert.match(
    selectSheet,
    /TAG_MAX_LENGTH/,
    'custom tags must enforce the backend length contract',
  );
  assert.match(
    selectSheet,
    /pending=\{option\.pending\}/,
    'backend pending status must remain visible',
  );
  assert.match(
    optionRow,
    /valueState\?:/,
    'selector summaries must expose explicit visual states',
  );
  assert.match(
    themedSwitch,
    /trackColor/,
    'composer toggles must use theme-aware tracks',
  );
  assert.doesNotMatch(
    composer,
    /keyboardHeight|androidWindowResized|scheduleLayoutAnimation/,
    'composer must not duplicate keyboard insets',
  );
  assert.match(
    composer,
    /automaticallyAdjustKeyboardInsets=\{false\}/,
    'composer ScrollView must defer to its single owner',
  );
  assert.doesNotMatch(
    composer,
    /tagSuggestions\s*\.filter\(\(tag\) => !selectedTags/,
    'selected approved tags must remain known to the tag sheet',
  );

  console.log('Phase 2A selector and tag contract tests passed.');
}

main();
