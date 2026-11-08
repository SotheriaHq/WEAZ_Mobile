const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  OFFICIAL_SHA256,
  parseDistributionUrl,
  candidateSources,
  rewriteProperties,
  fetchDistribution,
} = require('./fetch-gradle-distribution.cjs');

const GOOD = Buffer.from('the genuine gradle distribution');
const BAD = Buffer.from('a tampered gradle distribution');
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const FILE = 'gradle-9.3.1-bin.zip';
const PINNED = { [FILE]: sha(GOOD) };
const PROPERTIES = [
  'distributionBase=GRADLE_USER_HOME',
  'distributionPath=wrapper/dists',
  `distributionUrl=https\\://services.gradle.org/distributions/${FILE}`,
  'networkTimeout=10000',
  'zipStoreBase=GRADLE_USER_HOME',
  '',
].join('\n');

function fixture(context) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'wiez-gradle-test-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const properties = path.join(root, 'gradle-wrapper.properties');
  fs.writeFileSync(properties, PROPERTIES);
  return { root, properties, cache: path.join(root, 'cache') };
}

/** Fake curl: `responses[host]` is the body to serve, or null for a failure. */
function fakeCurl(responses, calls) {
  return (_cmd, args) => {
    const source = args[args.length - 1];
    const output = args[args.indexOf('--output') + 1];
    const host = new URL(source).host;
    calls.push(host);
    const body = responses[host];
    if (!body) return { status: 22 };
    fs.writeFileSync(output, body);
    return { status: 0 };
  };
}

test('parses the escaped wrapper URL and refuses unexpected file names', () => {
  assert.deepEqual(parseDistributionUrl(PROPERTIES), {
    url: `https://services.gradle.org/distributions/${FILE}`,
    fileName: FILE,
  });
  assert.throws(() => parseDistributionUrl('distributionUrl=https\\://evil.example/x.sh'), /Unexpected/);
  assert.throws(() => parseDistributionUrl('nothing here'), /no distributionUrl/);
});

test('the real pinned checksum is the official 9.3.1 binary checksum', () => {
  assert.equal(OFFICIAL_SHA256[FILE], 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06');
});

test('official host first; mirrors only for pinned checksums', () => {
  const dist = parseDistributionUrl(PROPERTIES);
  const pinned = candidateSources(dist, PINNED);
  assert.equal(new URL(pinned[0]).host, 'services.gradle.org');
  assert.ok(pinned.length > 1);
  assert.deepEqual(candidateSources(dist, {}), [dist.url], 'no mirror without a pinned checksum');
});

test('uses the official download when it works and rewrites the wrapper to the verified file', (context) => {
  const f = fixture(context);
  const calls = [];
  const result = fetchDistribution(f.properties, f.cache, {
    run: fakeCurl({ 'services.gradle.org': GOOD }, calls), log: () => {}, pinned: PINNED,
  });
  assert.deepEqual(calls, ['services.gradle.org']);
  assert.equal(fs.readFileSync(result.localPath, 'utf8'), GOOD.toString());
  const rewritten = fs.readFileSync(f.properties, 'utf8');
  assert.match(rewritten, /^distributionUrl=file\\:/m);
  assert.match(rewritten, new RegExp(`^distributionSha256Sum=${sha(GOOD)}$`, 'm'));
  assert.match(rewritten, /^networkTimeout=120000$/m);
});

test('falls back to a mirror when the official host is down', (context) => {
  const f = fixture(context);
  const calls = [];
  fetchDistribution(f.properties, f.cache, {
    run: fakeCurl({ 'services.gradle.org': null, 'mirrors.cloud.tencent.com': GOOD }, calls), log: () => {}, pinned: PINNED,
  });
  assert.deepEqual(calls, ['services.gradle.org', 'mirrors.cloud.tencent.com']);
});

test('a mirror serving different bytes is rejected and the next source is tried', (context) => {
  const f = fixture(context);
  const calls = [];
  const result = fetchDistribution(f.properties, f.cache, {
    run: fakeCurl({ 'services.gradle.org': null, 'mirrors.cloud.tencent.com': BAD, 'mirrors.huaweicloud.com': GOOD }, calls),
    log: () => {},
    pinned: PINNED,
  });
  assert.equal(calls.length, 3);
  assert.equal(fs.readFileSync(result.localPath, 'utf8'), GOOD.toString());
});

test('fails closed and leaves the wrapper untouched when no source is genuine', (context) => {
  const f = fixture(context);
  assert.throws(
    () => fetchDistribution(f.properties, f.cache, {
      run: fakeCurl({ 'services.gradle.org': null, 'mirrors.cloud.tencent.com': BAD, 'mirrors.huaweicloud.com': null }, []),
      log: () => {},
      pinned: PINNED,
    }),
    /verified/,
  );
  assert.equal(fs.readFileSync(f.properties, 'utf8'), PROPERTIES);
  assert.ok(!fs.existsSync(path.join(f.cache, FILE)), 'no unverified file left behind');
});

test('a verified cached copy needs no network at all', (context) => {
  const f = fixture(context);
  fs.mkdirSync(f.cache, { recursive: true });
  fs.writeFileSync(path.join(f.cache, FILE), GOOD);
  const calls = [];
  fetchDistribution(f.properties, f.cache, { run: fakeCurl({}, calls), log: () => {}, pinned: PINNED });
  assert.deepEqual(calls, []);
});

test('rewriting replaces an existing checksum line instead of duplicating it', () => {
  const once = rewriteProperties(PROPERTIES, '/home/runner/.gradle-dist/x.zip', 'a'.repeat(64));
  const twice = rewriteProperties(once, '/home/runner/.gradle-dist/x.zip', 'b'.repeat(64));
  assert.equal((twice.match(/distributionSha256Sum=/g) || []).length, 1);
  assert.match(twice, /distributionSha256Sum=b{64}/);
});
