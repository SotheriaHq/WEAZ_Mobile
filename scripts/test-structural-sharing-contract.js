/**
 * Contract: background revalidation must not churn object identity just because
 * the backend re-signed its S3 display URLs.
 *
 * On a FlatList, a new array of new row objects re-renders every visible row and
 * re-resolves every Image source — the shake users see whenever a screen
 * refreshes. React Query's stock structural sharing cannot prevent it because
 * `X-Amz-Signature` differs on every response, so `src/query/structuralSharing.ts`
 * teaches it that two signatures over the same object are the same value.
 *
 * This file is the native mirror of
 * fthreadly/src/query/structuralSharing.test.ts — keep them in step.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const structuralSharingPath = path.join(repoRoot, 'src', 'query', 'structuralSharing.ts');
const queryClientPath = path.join(repoRoot, 'src', 'query', 'queryClient.ts');
const queryKeysPath = path.join(repoRoot, 'src', 'query', 'queryKeys.ts');
const cachedQueryPath = path.join(repoRoot, 'src', 'cache', 'cachedQuery.ts');

function loadModule(filePath) {
  const outputText = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;

  const moduleShim = { exports: {} };
  // Same realm as this script, deliberately — NOT vm.runInNewContext.
  // `replaceEqualDeepPreservingSignedUrls` identifies plain objects by
  // prototype, and a fresh vm context has its own `Object.prototype`, so
  // fixtures built here would look like foreign objects to the module and every
  // merge assertion below would fail for a reason that does not exist in the app
  // (query payloads are JSON.parse'd in the same realm that renders them).
  vm.runInThisContext(`(function (module, exports, require) {\n${outputText}\n})`)(
    moduleShim,
    moduleShim.exports,
    require,
  );
  return moduleShim.exports;
}

const {
  getSignedUrlIdentity,
  isEquivalentSignedUrl,
  replaceEqualDeepPreservingSignedUrls,
} = loadModule(structuralSharingPath);

const BASE =
  'https://weaz-sit.s3.us-east-1.amazonaws.com/POST_IMAGE/user_1/cover.jpg';

/** A presigned GET shaped exactly like the ones UploadService issues. */
const signed = (issuedAt, signature, expiresSeconds = 604800) =>
  `${BASE}?X-Amz-Algorithm=AWS4-HMAC-SHA256` +
  `&X-Amz-Credential=AKIA%2F20260808%2Fus-east-1%2Fs3%2Faws4_request` +
  `&X-Amz-Date=${issuedAt}&X-Amz-Expires=${expiresSeconds}` +
  `&X-Amz-SignedHeaders=host&X-Amz-Signature=${signature}`;

const DURING_VALIDITY = Date.UTC(2026, 7, 9, 9, 0, 0);

// ── Identity ────────────────────────────────────────────────────────────────
assert.equal(
  getSignedUrlIdentity(signed('20260808T090000Z', 'aaa')),
  BASE,
  'signed URLs must key on the object path, not the signature',
);
assert.equal(
  getSignedUrlIdentity('https://cdn.example/POST_IMAGE/cover.jpg'),
  null,
  'unsigned URLs must compare as ordinary strings',
);

// ── Equivalence + the expiry safety valve ───────────────────────────────────
assert.equal(
  isEquivalentSignedUrl(
    signed('20260808T090000Z', 'aaa'),
    signed('20260808T091500Z', 'bbb'),
    DURING_VALIDITY,
  ),
  true,
  're-signed URL for the same object must count as unchanged',
);
assert.equal(
  isEquivalentSignedUrl(
    signed('20260808T090000Z', 'aaa', 3600),
    signed('20260808T093000Z', 'bbb'),
    Date.UTC(2026, 7, 8, 9, 30, 0),
  ),
  false,
  'a cached URL close to expiry must be replaced, never held',
);

// ── The behaviour the shake depended on ─────────────────────────────────────
const previous = {
  items: [
    { id: 'c1', title: 'Resort', coverImage: signed('20260808T090000Z', 'aaa') },
    { id: 'c2', title: 'Bridal', coverImage: signed('20260808T090000Z', 'ccc') },
  ],
};
const resigned = {
  items: [
    { id: 'c1', title: 'Resort', coverImage: signed('20260808T091500Z', 'bbb') },
    { id: 'c2', title: 'Bridal', coverImage: signed('20260808T091500Z', 'ddd') },
  ],
};
assert.equal(
  replaceEqualDeepPreservingSignedUrls(previous, resigned),
  previous,
  'a revalidation that changed nothing but signatures must keep every reference',
);

const edited = {
  items: [
    { id: 'c1', title: 'Resort 2026', coverImage: signed('20260808T091500Z', 'bbb') },
    { id: 'c2', title: 'Bridal', coverImage: signed('20260808T091500Z', 'ddd') },
  ],
};
const mergedEdit = replaceEqualDeepPreservingSignedUrls(previous, edited);
assert.notEqual(mergedEdit, previous, 'a real edit must still propagate');
assert.equal(mergedEdit.items[0].title, 'Resort 2026');
assert.equal(
  mergedEdit.items[1],
  previous.items[1],
  'an untouched sibling row must keep its identity so it does not re-render',
);

const grown = replaceEqualDeepPreservingSignedUrls(previous, {
  items: [...resigned.items, { id: 'c3' }],
});
assert.equal(grown.items.length, 3, 'added rows must survive');
assert.equal(grown.items[0], previous.items[0], 'existing rows must not be rebuilt');

// ── Wiring ──────────────────────────────────────────────────────────────────
const queryClientSource = fs.readFileSync(queryClientPath, 'utf8');
assert.match(
  queryClientSource,
  /structuralSharing:\s*\(previous,\s*next\)\s*=>\s*\n?\s*replaceEqualDeepPreservingSignedUrls\(previous,\s*next\)/,
  'queryClient must install the signed-URL-aware structural sharing',
);

// ── Persistence parity with web ─────────────────────────────────────────────
const { isPersistableWiezQueryKey, PRIVATE_QUERY_ROOTS } = loadModule(queryKeysPath);
assert.equal(
  isPersistableWiezQueryKey(['reviews', 'mine', 'user_1']),
  true,
  'reviews must survive an app restart like the catalog tabs do',
);
assert.equal(
  isPersistableWiezQueryKey(['orders', 'list', 'user_1']),
  false,
  'orders carry addresses and payment references — never persist them to disk',
);
assert.equal(
  isPersistableWiezQueryKey(['brandFinance', 'bundle', 'brand_1']),
  false,
  'brand finance must stay memory-only',
);
for (const root of ['reviews', 'orders', 'brandFinance']) {
  assert.equal(
    PRIVATE_QUERY_ROOTS.has(root),
    true,
    `${root} must be purged on logout`,
  );
}

// ── useCachedQuery must not render the previous key's data ──────────────────
const cachedQuerySource = fs.readFileSync(cachedQueryPath, 'utf8');
assert.match(
  cachedQuerySource,
  /setData\(cached\);\s*\n\s*setIsLoading\(cached === undefined\);/,
  'a key change with no cache must clear data, not leave the previous key visible',
);

console.log('structural sharing contract: OK');
