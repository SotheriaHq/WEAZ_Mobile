/**
 * Drift check for the location-cascade twins.
 *
 * Three things about "where do you live" are duplicated across repos that cannot
 * import each other, and all three have already broken in production:
 *
 * 1. **The bundled region fallback.** `src/data/countryRegions.ts` and
 *    `fthreadly/src/data/countryRegions.ts`. The list exists because every
 *    caller renders an empty option array as a DISABLED dropdown, so an outage
 *    at `countriesnow.space` becomes a form the user physically cannot finish.
 *    If one repo's Nigeria list grows a state and the other's does not, two
 *    users of the same platform get different answers to the same question.
 *
 * 2. **The endpoint shape.** Web moved from `POST /countries/states` to
 *    `GET /countries/states/q` when the POST form started answering a 301 that
 *    a browser cannot follow. Mobile was left on the dead endpoint for months —
 *    it failed silently on every call, and with no fallback that rendered as a
 *    permanently grey state dropdown. That is exactly the kind of fix that
 *    lands on one surface and is forgotten on the other, so it is asserted.
 *
 * 3. **The field labels.** "City / LGA" is a product decision — the same
 *    administrative level is called a Local Government Area in Nigeria and a
 *    city almost everywhere else, and both readers have to find the field.
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

const projectRoot = path.join(__dirname, '..');
const mobileRegionsPath = path.join(projectRoot, 'src', 'data', 'countryRegions.ts');
const webRegionsPath = path.join(
  projectRoot,
  '..',
  'fthreadly',
  'src',
  'data',
  'countryRegions.ts',
);

const mobileRegions = loadTsModule(mobileRegionsPath);

/*
  Independent of the sibling repo: these are facts about our own markets that a
  future edit must not quietly drop. Nigeria is 36 states plus the FCT, and the
  fallback is worthless if the country a shopper is most likely to pick is the
  one that is missing.
*/
assert.strictEqual(
  mobileRegions.getOfflineRegions('Nigeria').length,
  37,
  'Nigeria must resolve to 36 states + the Federal Capital Territory',
);
assert.ok(
  mobileRegions.getOfflineRegions('Nigeria').includes('Lagos'),
  'Nigeria regions must include Lagos',
);
/*
  Name matching, not just ISO2. The cascade stores country NAMES, so the
  fallback has to answer when all it is given is what the picker displayed —
  including the long-form UK name some sources return.
*/
assert.strictEqual(
  mobileRegions.getOfflineRegions(
    'United Kingdom of Great Britain and Northern Ireland',
  ).length,
  4,
  'the long-form UK name must resolve to the same four nations as "United Kingdom"',
);
assert.strictEqual(
  mobileRegions.getOfflineRegions(undefined, 'GH').length,
  16,
  'Ghana must resolve to its 16 post-2019 regions from the ISO2 alone',
);
/*
  An unknown country returns [] and that is CORRECT — the caller's contract is
  "empty means let them type one", never "disable the field". Asserted so nobody
  later makes this throw or invent a list.
*/
assert.deepStrictEqual(
  mobileRegions.getOfflineRegions('Atlantis'),
  [],
  'an unknown country must return an empty list, not throw and not guess',
);

/* ── The service must be on the GET endpoints ──────────────────────────── */
const serviceSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'services', 'locationService.ts'),
  'utf8',
);
assert.ok(
  serviceSource.includes('/states/q'),
  'getStates must call GET /countries/states/q — the POST form 301-redirects and times out',
);
assert.ok(
  serviceSource.includes('/state/cities/q'),
  'getCities must call GET /countries/state/cities/q for the same reason',
);
assert.ok(
  !/axios\.post<CountriesNow/.test(serviceSource),
  'the location service must not POST to countriesnow — that endpoint is dead',
);
assert.ok(
  serviceSource.includes('getOfflineRegions'),
  'getStates must fall back to bundled regions; returning [] renders a disabled dropdown',
);

/* ── Labels are a product decision, not a string ───────────────────────── */
const fieldsSource = fs.readFileSync(
  path.join(projectRoot, 'components', 'forms', 'LocationCascadeFields.tsx'),
  'utf8',
);
assert.ok(
  fieldsSource.includes('City / LGA'),
  'the city field must name the Local Government Area too — it is the same level under two names',
);

/* ── Cross-repo: the two region tables must agree ──────────────────────── */
if (!fs.existsSync(webRegionsPath)) {
  console.log(
    'location cascade contract: SKIPPED the cross-repo half — fthreadly is not checked out beside this repo.',
  );
  console.log('location cascade contract passed (mobile-only assertions)');
  process.exit(0);
}

const webRegions = loadTsModule(webRegionsPath);

const mobileCodes = Object.keys(mobileRegions.OFFLINE_COUNTRY_REGIONS).sort();
const webCodes = Object.keys(webRegions.OFFLINE_COUNTRY_REGIONS).sort();
assert.deepStrictEqual(
  mobileCodes,
  webCodes,
  'the two repos cover different countries offline — one surface can complete a form the other cannot',
);

for (const code of mobileCodes) {
  assert.deepStrictEqual(
    mobileRegions.OFFLINE_COUNTRY_REGIONS[code],
    webRegions.OFFLINE_COUNTRY_REGIONS[code],
    `offline regions for ${code} differ between mobile and web`,
  );
}

/* The alias table decides whether a stored country name resolves at all. */
for (const name of [
  'Nigeria',
  'Ghana',
  'Kenya',
  'South Africa',
  'United Kingdom',
  'United Kingdom of Great Britain and Northern Ireland',
  'United States',
  'Canada',
  'Atlantis',
]) {
  assert.deepStrictEqual(
    mobileRegions.getOfflineRegions(name),
    webRegions.getOfflineRegions(name),
    `"${name}" resolves to different regions on mobile and web`,
  );
}

console.log(
  `location cascade contract passed (${mobileCodes.length} countries agree across both repos)`,
);
