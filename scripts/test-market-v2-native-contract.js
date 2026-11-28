/**
 * Cross-repo contract for the server-composed Market on native.
 *
 * The app, the web and the API each declare the Market filter wire format,
 * the sort list and the optional signal telemetry. They share no package, so
 * this runs the real modules side by side:
 *
 * 1. Filter encoding: the same filters encoded by native and by web parse,
 *    through the API's own parser, to the same canonical filters and the same
 *    filter hash. The hash binds a signed cursor, so a mismatch would reject
 *    every second page. A web share link decoded on native also hashes the same.
 * 2. Sorts: native and web offer the same sorts, and the API accepts each.
 * 3. Limits: native and web enforce the API's per-key and total value limits.
 * 4. Signal telemetry: the optional event fields native sends are exactly the
 *    ones the API's DTO validates, and the batch carries `sentAt`.
 *
 * Sibling sources are read from each repo's `origin/SIT` (what is deployed),
 * falling back to the working tree. Skips with a printed reason when a sibling
 * repo is not checked out.
 */
const assert = require('assert');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const MOBILE = path.join(__dirname, '..');
const ROOT = path.join(MOBILE, '..');
const BACKEND = path.join(ROOT, 'bthreadly');
const WEB = path.join(ROOT, 'fthreadly');

function readSibling(repo, relativePath) {
  try {
    return execFileSync('git', ['-C', repo, 'show', `origin/SIT:${relativePath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    const file = path.join(repo, relativePath);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
}

function loadTs(source, requireStub = () => ({})) {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(module, module.exports, requireStub);
  return module.exports;
}

/** Enough of Prisma.Decimal for `money()`: the input is already bounded to two decimals. */
class BoundedDecimal {
  constructor(raw) {
    this.value = Number(raw);
  }
  isFinite() {
    return Number.isFinite(this.value);
  }
  lt(other) {
    return this.value < Number(other);
  }
  gt(other) {
    return this.value > Number(other);
  }
  eq(other) {
    return this.value === Number(other);
  }
  toNumber() {
    return this.value;
  }
}

class BadRequestException extends Error {
  constructor(body) {
    super(typeof body === 'string' ? body : body && body.message);
    this.response = body;
  }
}

const backendFiltersSource = readSibling(BACKEND, 'src/market/catalog/market-filters.ts');
const backendTagSource = readSibling(BACKEND, 'src/common/utils/tag-validator.ts');
const backendCursorSource = readSibling(BACKEND, 'src/market/catalog/market-cursor.ts');
const backendSignalDtoSource = readSibling(BACKEND, 'src/market/dto/market-signal.dto.ts');
const webFiltersSource = readSibling(WEB, 'src/features/market-v2/marketFilterState.ts');

const missing = [
  ['backend filter parser', backendFiltersSource],
  ['backend tag rules', backendTagSource],
  ['backend cursor sorts', backendCursorSource],
  ['backend signal DTO', backendSignalDtoSource],
  ['web filter state', webFiltersSource],
].filter(([, source]) => !source);
if (missing.length) {
  console.log(`SKIP market v2 native contract: ${missing.map(([name]) => name).join(', ')} not available.`);
  process.exit(0);
}

const tagValidator = loadTs(backendTagSource);
const backend = loadTs(backendFiltersSource, (id) => {
  if (id === '@nestjs/common') return { BadRequestException };
  if (id === '@prisma/client') return { Prisma: { Decimal: BoundedDecimal } };
  if (id === 'node:crypto' || id === 'crypto') return crypto;
  if (id.endsWith('tag-validator')) return tagValidator;
  throw new Error(`Unexpected backend import: ${id}`);
});
const backendCursor = loadTs(backendCursorSource, (id) => {
  if (id === '@nestjs/common') return { BadRequestException };
  if (id === 'node:crypto' || id === 'crypto') return crypto;
  return {};
});
const web = loadTs(webFiltersSource);
const native = loadTs(
  fs.readFileSync(path.join(MOBILE, 'src/features/market/v2/marketV2Contract.ts'), 'utf8'),
);

const canonical = (pairs) => {
  const params = new URLSearchParams();
  for (const [key, value] of pairs) params.append(key, value);
  const filters = backend.parseMarketFilters(params);
  // Parameter order is not part of the contract: the API re-encodes in one
  // fixed order before hashing, so compare values (any key order) and hashes.
  return { filters, hash: backend.marketFilterHash(filters) };
};
const nativeCanonical = (filters) => canonical(native.encodeMarketV2Filters(filters));
const webCanonical = (filters) => canonical([...web.marketFiltersToParams(filters)]);

const ID = {
  category: '0b8a4f1e-7c2d-4e5f-9a1b-2c3d4e5f6a7b',
  type: '1c9b5a2f-8d3e-4f60-8b2c-3d4e5f6a7b8c',
  brandA: '2dac6b3a-9e4f-4071-9c3d-4e5f6a7b8c9d',
  brandB: '3ebd7c4b-af50-4182-8d4e-5f6a7b8c9dae',
};

/** Each case states one shopper's filters in both clients' own shapes. */
const CASES = [
  {
    name: 'no filters',
    native: {},
    web: web.EMPTY_MARKET_FILTERS,
  },
  {
    name: 'every filter at once, in unsorted input order',
    native: {
      audience: ['WOMEN', 'MEN'],
      categoryIds: [ID.category],
      categoryTypeIds: [ID.type],
      brandIds: [ID.brandB, ID.brandA],
      tags: ['aso-oke', 'ankara'],
      colors: ['red', 'blue'],
      sizes: ['M', '8,5'],
      dimensions: { occasion: ['wedding'], fabric: ['silk', 'cotton'] },
      price: { min: 1500.5, max: 90000 },
      onSale: true,
      inStockOnly: true,
      fulfilment: 'READY_TO_WEAR',
    },
    web: {
      ...web.EMPTY_MARKET_FILTERS,
      audience: ['WOMEN', 'MEN'],
      category: [ID.category],
      type: [ID.type],
      brand: [ID.brandB, ID.brandA],
      tag: ['aso-oke', 'ankara'],
      color: ['red', 'blue'],
      size: ['M', '8,5'],
      dimensions: { occasion: ['wedding'], fabric: ['silk', 'cotton'] },
      priceMin: 1500.5,
      priceMax: 90000,
      onSale: true,
      inStockOnly: true,
      fulfilment: 'READY_TO_WEAR',
    },
  },
  {
    name: 'a free minimum and made to order',
    native: { price: { min: 0 }, fulfilment: 'MADE_TO_ORDER' },
    web: { ...web.EMPTY_MARKET_FILTERS, priceMin: 0, fulfilment: 'MADE_TO_ORDER' },
  },
];

let passed = 0;
const check = (name, run) => {
  run();
  passed += 1;
  console.log(`  ok ${name}`);
};

console.log('market v2 native contract');

for (const testCase of CASES) {
  check(`filters hash the same on native and web: ${testCase.name}`, () => {
    const fromNative = nativeCanonical(testCase.native);
    const fromWeb = webCanonical(testCase.web);
    assert.deepStrictEqual(fromNative.filters, fromWeb.filters);
    assert.strictEqual(fromNative.hash, fromWeb.hash);
  });
  check(`a web link decodes on native to the same filters: ${testCase.name}`, () => {
    const webLink = web.marketFiltersToParams(testCase.web).toString();
    const decoded = native.decodeMarketV2Filters(webLink);
    assert.strictEqual(nativeCanonical(decoded).hash, webCanonical(testCase.web).hash);
  });
  check(`native round-trips its own route parameter: ${testCase.name}`, () => {
    const param = native.encodeMarketV2FilterParam(testCase.native);
    assert.strictEqual(
      nativeCanonical(native.decodeMarketV2Filters(param)).hash,
      nativeCanonical(testCase.native).hash,
    );
  });
}

check('native and web offer the same sorts, and the API accepts each', () => {
  const nativeSorts = [...native.MARKET_V2_SORTS].sort();
  const webSorts = [...web.MARKET_SORTS].sort();
  assert.deepStrictEqual(nativeSorts, webSorts);
  for (const sort of nativeSorts) assert.ok(backendCursor.MARKET_SORTS.includes(sort), `API refuses sort ${sort}`);
});

check('native and web enforce the API value limits', () => {
  const api = backend.MARKET_FILTER_LIMITS;
  for (const limits of [native.MARKET_V2_FILTER_LIMITS, web.MARKET_FILTER_LIMITS]) {
    assert.strictEqual(limits.valuesPerKey, api.valuesPerKey);
    assert.strictEqual(limits.valuesTotal, api.valuesTotal);
  }
});

check('native telemetry fields are exactly the ones the API validates', () => {
  const nativeApi = fs.readFileSync(path.join(MOBILE, 'src/api/MarketApi.ts'), 'utf8');
  const declared = nativeApi.match(/MARKET_SIGNAL_TELEMETRY_FIELDS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(declared, 'MARKET_SIGNAL_TELEMETRY_FIELDS not found in src/api/MarketApi.ts');
  const nativeFields = [...declared[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]).sort();

  // The in-class marker; a file-level comment above the class also mentions telemetry.
  const block = backendSignalDtoSource.match(/\n\s+\/\/ Optional telemetry:[\s\S]*?\n}\n/);
  assert.ok(block, 'optional telemetry block not found in market-signal.dto.ts');
  const apiFields = [...block[0].matchAll(/^\s+([A-Za-z]+)\?:/gm)].map((match) => match[1]).sort();
  assert.deepStrictEqual(nativeFields, apiFields);
  assert.match(backendSignalDtoSource, /class MarketSignalBatchDto[\s\S]*?\bsentAt\?:/);
});

console.log(`market v2 native contract: ${passed} passed`);
