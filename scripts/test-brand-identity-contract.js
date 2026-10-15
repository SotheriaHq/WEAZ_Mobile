/**
 * Drift check for "whose UI is this?" across web and native.
 *
 * `isBrandAccount` and `hasActiveBrandMembership` answer two different
 * questions, and collapsing them is what sent a freshly verified brand to the
 * shopper profile on BOTH surfaces:
 *
 *   IDENTITY   — whose UI is this? A brand mid-setup is still a brand.
 *   CAPABILITY — can this account manage a store right now? Correctly false
 *                until a store exists; the setup flow depends on that false.
 *
 * The two copies live in separate repos and cannot import each other, so this
 * runs the real functions from both over the same accounts. It also asserts the
 * predicates stay DIFFERENT — collapsing them back into one would pass a naive
 * "they agree" test while reintroducing the bug.
 *
 * Skips with a printed reason when the sibling repo is not checked out.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath, stubs = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in stubs) return stubs[specifier];
    // Every import in these files is type-only at runtime.
    return {};
  };
  new Function('module', 'exports', 'require', transpiled)(
    module,
    module.exports,
    localRequire,
  );
  return module.exports;
}

const mobilePath = path.join(__dirname, '..', 'src', 'auth', 'brandAccess.ts');
const webPath = path.join(
  __dirname,
  '..',
  '..',
  'fthreadly',
  'src',
  'lib',
  'brandAccess.ts',
);

/*
  Both files read a stored active-brand id from platform storage. Neither is
  available here and neither is what this test is about, so they are stubbed to
  "nothing stored" — which is also the state a newly verified account is in.
*/
const mobile = loadTsModule(mobilePath);

const CASES = [
  {
    label: 'brand that has NOT finished store setup',
    account: {
      type: 'BRAND',
      activeBrandId: null,
      storeId: null,
      brandMemberships: [],
      brandFullName: 'Nuel Cotour',
    },
    identity: true,
    // Deliberately false: the store-setup flow is shown on this.
    capability: false,
  },
  {
    label: 'brand with a store',
    account: {
      type: 'BRAND',
      activeBrandId: 'brand-1',
      storeId: 'brand-1',
      brandMemberships: [],
      brandFullName: 'Nuel Cotour',
    },
    identity: true,
    capability: true,
  },
  {
    label: 'shopper',
    account: {
      type: 'REGULAR',
      activeBrandId: null,
      storeId: null,
      brandMemberships: [],
    },
    identity: false,
    capability: false,
  },
  {
    label: 'staff on someone else\'s brand',
    account: {
      type: 'REGULAR',
      activeBrandId: 'brand-9',
      storeId: null,
      brandMemberships: [
        {
          brandId: 'brand-9',
          brandName: 'Abi Lines',
          role: 'STAFF',
          status: 'ACTIVE',
          isOwner: false,
        },
      ],
    },
    identity: true,
    capability: true,
  },
  { label: 'no account', account: null, identity: false, capability: false },
];

function check(moduleUnderTest, surface) {
  for (const testCase of CASES) {
    assert.strictEqual(
      moduleUnderTest.isBrandAccount(testCase.account),
      testCase.identity,
      `${surface} isBrandAccount wrong for: ${testCase.label}`,
    );
    assert.strictEqual(
      moduleUnderTest.hasActiveBrandMembership(testCase.account),
      testCase.capability,
      `${surface} hasActiveBrandMembership wrong for: ${testCase.label}`,
    );
  }
}

check(mobile, 'native');

// The predicates must stay distinct. If a later change makes them identical,
// the brand-mid-setup case is broken again on one side or the other.
const midSetup = CASES[0].account;
assert.notStrictEqual(
  mobile.isBrandAccount(midSetup),
  mobile.hasActiveBrandMembership(midSetup),
  'native: identity and capability collapsed into the same answer for a brand mid-setup',
);

if (!fs.existsSync(webPath)) {
  console.log(
    'brand identity contract passed (web drift check skipped — fthreadly not checked out)',
  );
  process.exit(0);
}

const web = loadTsModule(webPath);
check(web, 'web');

assert.notStrictEqual(
  web.isBrandAccount(midSetup),
  web.hasActiveBrandMembership(midSetup),
  'web: identity and capability collapsed into the same answer for a brand mid-setup',
);

for (const testCase of CASES) {
  assert.strictEqual(
    web.isBrandAccount(testCase.account),
    mobile.isBrandAccount(testCase.account),
    `web and native disagree about identity for "${testCase.label}"`,
  );
}

console.log(
  `brand identity contract passed (${CASES.length} accounts agree across both repos, identity and capability stay distinct)`,
);
