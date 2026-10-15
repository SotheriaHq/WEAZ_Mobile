/**
 * Drift check for the gender-prompt twin.
 *
 * `src/lib/profileGender.ts` and `fthreadly/src/lib/profileGender.ts` decide
 * WHO gets asked how to size their clothes. They live in separate repos, cannot
 * import each other, and have already drifted twice: web excluded console
 * operators before native did, and the auth-route skip lists diverged so the
 * prompt opened over `/verify-email` on one surface after being fixed on the
 * other.
 *
 * A comment saying "change both" did not prevent either. This does: it runs the
 * REAL function from both repos over the same accounts and asserts identical
 * answers, so a rule added on one side and forgotten on the other fails CI
 * rather than shipping.
 *
 * Skips with a printed reason when the sibling repo is not checked out, so a
 * standalone mobile clone still passes.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(
    module,
    module.exports,
    require,
  );
  return module.exports;
}

const mobilePath = path.join(__dirname, '..', 'src', 'lib', 'profileGender.ts');
const webPath = path.join(
  __dirname,
  '..',
  '..',
  'fthreadly',
  'src',
  'lib',
  'profileGender.ts',
);

const mobile = loadTsModule(mobilePath);

/*
  Cases chosen to pin the DECISIONS, not the implementation. Each one is a
  question someone actually asked and a product answer that was given.
*/
const CASES = [
  { label: 'shopper who has not answered', account: { gender: null }, expected: true },
  {
    label: 'shopper with an explicit type',
    account: { gender: null, type: 'REGULAR' },
    expected: true,
  },
  {
    label: 'shopper who answered',
    account: { gender: 'FEMALE' },
    expected: false,
  },
  {
    label: 'shopper who declined — a decline is an answer',
    account: { gender: 'UNSPECIFIED' },
    expected: false,
  },
  {
    label: 'brand account — a brand signs up to sell, not to be sized',
    account: { gender: null, type: 'BRAND' },
    expected: false,
  },
  {
    label: 'brand account that also carries a role',
    account: { gender: null, type: 'BRAND', role: 'User' },
    expected: false,
  },
  {
    label: 'Admin — cannot bag, order or hold measurements',
    account: { gender: null, role: 'Admin' },
    expected: false,
  },
  {
    label: 'SuperAdmin',
    account: { gender: null, role: 'SuperAdmin' },
    expected: false,
  },
  { label: 'no account', account: null, expected: false },
  { label: 'undefined account', account: undefined, expected: false },
];

for (const testCase of CASES) {
  assert.strictEqual(
    mobile.needsGenderPrompt(testCase.account),
    testCase.expected,
    `mobile needsGenderPrompt disagrees for: ${testCase.label}`,
  );
}

if (!fs.existsSync(webPath)) {
  console.log(
    'profile gender contract passed (web drift check skipped — fthreadly not checked out)',
  );
  process.exit(0);
}

const web = loadTsModule(webPath);

for (const testCase of CASES) {
  const mobileAnswer = mobile.needsGenderPrompt(testCase.account);
  const webAnswer = web.needsGenderPrompt(testCase.account);
  assert.strictEqual(
    webAnswer,
    mobileAnswer,
    `web and native disagree about "${testCase.label}": web=${webAnswer} native=${mobileAnswer}. ` +
      'These two files are deliberate twins — a rule added to one must be added to the other.',
  );
}

// The option list is what the person actually chooses from; a value present on
// one surface and not the other means an account can hold a gender the other
// surface cannot render.
const mobileValues = mobile.PROFILE_GENDERS.slice().sort();
const webValues = web.PROFILE_GENDERS.slice().sort();
assert.deepStrictEqual(
  webValues,
  mobileValues,
  'PROFILE_GENDERS have drifted between fthreadly and threadly-mobile',
);

console.log(
  `profile gender contract passed (${CASES.length} cases agree across both repos, ${mobileValues.length} gender values)`,
);
