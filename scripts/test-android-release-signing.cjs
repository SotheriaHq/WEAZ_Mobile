const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { signingInputs, signerCertificate, signerSummary, apkSignerCertificates, signApk, PUBLIC_DEBUG_CERT } = require('./sign-android-apk.cjs');
const certificate = '12'.repeat(32);
const fields = { ANDROID_KEYSTORE_BASE64: Buffer.alloc(256, 1).toString('base64'), ANDROID_KEYSTORE_PASSWORD: 'private-store',
  ANDROID_KEY_ALIAS: 'test-key', ANDROID_KEY_PASSWORD: 'private-key', ANDROID_SIGNING_CERT_SHA256: certificate };
test('release signing requires complete credentials and refuses public debug trust', () => {
  for (const key of Object.keys(fields)) assert.throws(() => signingInputs({ ...fields, [key]: '' }), /Missing required/);
  assert.throws(() => signingInputs({ ...fields, ANDROID_SIGNING_CERT_SHA256: PUBLIC_DEBUG_CERT }), /private release/);
  assert.throws(() => signingInputs({ ...fields, ANDROID_KEYSTORE_BASE64: '***' }), /encoding/);
  assert.throws(() => signingInputs({ ...fields, ANDROID_KEYSTORE_BASE64: Buffer.alloc(12).toString('base64') }), /encoding/);
});
test('real apksigner 36 output yields its one signer; repeated identical lines are one signer', () => {
  const real = [
    'Verified using v2 scheme (APK Signature Scheme v2): true',
    'Verified using v3 scheme (APK Signature Scheme v3): true',
    'Number of signers: 1',
    'Signer #1 certificate DN: CN=WIEZ',
    `Signer #1 certificate SHA-256 digest: ${certificate}`,
    `Signer #1 public key SHA-256 digest: ${'cd'.repeat(32)}`,
  ].join('\n');
  assert.equal(signerCertificate(real), certificate);
  assert.equal(signerCertificate(`${real}\nSigner #1 certificate SHA-256 digest: ${certificate}`), certificate);
  assert.equal(signerCertificate(real.replace(/\n/g, '\r\n')), certificate);
  assert.throws(() => signerCertificate(real.replace('Number of signers: 1', 'Number of signers: 2')), /exactly one/);
  assert.match(signerSummary(real), /Number of signers 1; Signer #1 certificate SHA-256 digest: 1212/);
});
test('APK verification requires one actual certificate digest, ignoring unrelated output', () => {
  assert.equal(signerCertificate(`Signer #1 certificate SHA-256 digest: ${certificate}`), certificate);
  assert.throws(() => signerCertificate(`Source Stamp certificate SHA-256 digest: ${certificate}`), /exactly one/);
  assert.throws(() => signerCertificate(`Signer #1 certificate SHA-256 digest: ${certificate}\nSigner #2 certificate SHA-256 digest: ${certificate}`), /exactly one/);
});
function fixture(context) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'wiez-sign-test-'));
  // Tests only: verify the disposable root before any recursive fixture cleanup.
  context.after(() => { assert(path.dirname(root) === fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); });
  const lib = path.join(root, 'sdk/build-tools/36.0.0/lib'); fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, 'apksigner.jar'), 'fixture');
  const input = path.join(root, 'input.apk'), output = path.join(root, 'published/release.apk'); fs.writeFileSync(input, 'original');
  const env = { ...fields, ANDROID_HOME: path.join(root, 'sdk'), RUNNER_TEMP: root, EXPO_TOKEN: 'must-not-forward' };
  return { root, input, output, env };
}
test('publishes only after successful signing and certificate verification; passwords stay out of arguments', context => {
  const f = fixture(context); let calls = 0;
  const execute = (_java, args, options) => {
    calls++; assert(!args.includes(fields.ANDROID_KEYSTORE_PASSWORD)); assert(!args.includes(fields.ANDROID_KEY_PASSWORD));
    assert.equal(options.env.EXPO_TOKEN, undefined);
    if (args[2] === 'sign') { fs.writeFileSync(args[args.indexOf('--out') + 1], 'signed'); assert(!fs.existsSync(f.output)); return { status: 0 }; }
    return { status: 0, stdout: `Signer #1 certificate SHA-256 digest: ${certificate}` };
  };
  assert.equal(signApk(f.input, f.output, { env: f.env, execute, readCertificates: () => [certificate, certificate] }).certificateSha256, certificate);
  assert.equal(calls, 2); assert.equal(fs.readFileSync(f.output, 'utf8'), 'signed'); assert.equal(fs.readFileSync(f.input, 'utf8'), 'original');
  assert(!fs.readdirSync(f.root).some(name => name.startsWith('wiez-sign-')));
});
test('a wrong signer or failed cryptographic verification produces no publishable APK and cleans private files', context => {
  const f = fixture(context);
  for (const status of [0, 1]) {
    const execute = (_java, args) => {
      if (args[2] === 'sign') { fs.writeFileSync(args[args.indexOf('--out') + 1], 'untrusted'); return { status: 0 }; }
      return { status, stdout: `Signer #1 certificate SHA-256 digest: ${'ab'.repeat(32)}` };
    };
    assert.throws(() => signApk(f.input, f.output, { env: f.env, execute, readCertificates: () => ['ab'.repeat(32)] }), /signature does not match/);
    assert(!fs.existsSync(f.output)); assert(!fs.readdirSync(f.root).some(name => name.startsWith('wiez-sign-')));
  }
});
test('two different signer certificates are refused, and nothing is published', context => {
  const f = fixture(context);
  const execute = (_java, args) => {
    if (args[2] === 'sign') { fs.writeFileSync(args[args.indexOf('--out') + 1], 'signed'); return { status: 0 }; }
    return { status: 0, stdout: '' };
  };
  assert.throws(() => signApk(f.input, f.output, { env: f.env, execute, readCertificates: () => [certificate, 'ab'.repeat(32)] }), /exactly one/);
  assert(!fs.existsSync(f.output)); assert(!fs.readdirSync(f.root).some(name => name.startsWith('wiez-sign-')));
});
test('the signing block reader finds every signer certificate in a v2/v3 block', () => {
  const cert = Buffer.from('a release certificate');
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const lp = (buf) => Buffer.concat([u32(buf.length), buf]);
  const signedData = Buffer.concat([lp(Buffer.alloc(0)), lp(lp(cert))]);
  const signer = lp(Buffer.concat([lp(signedData), lp(Buffer.alloc(0)), lp(Buffer.alloc(0))]));
  const value = Buffer.concat([lp(Buffer.concat([signer, signer]))]);
  const pair = Buffer.concat([u64(4 + value.length), u32(0x7109871a), value]);
  const size = pair.length + 8 + 16;
  const block = Buffer.concat([u64(size), pair, u64(size), Buffer.from('APK Sig Block 42')]);
  const apk = Buffer.concat([Buffer.from('zip entries'), block, Buffer.from('central directory')]);
  const expected = require('node:crypto').createHash('sha256').update(cert).digest('hex');
  assert.deepEqual(apkSignerCertificates(apk), [expected, expected]);
  assert.throws(() => apkSignerCertificates(Buffer.from('not an apk')), /no signing block/);
});
test('a failed signing command cannot publish or leave a keystore in the temporary directory', context => {
  const f = fixture(context);
  assert.throws(() => signApk(f.input, f.output, { env: f.env, execute: () => ({ status: 1, stderr: 'private-store' }) }), /signing failed/);
  assert(!fs.existsSync(f.output)); assert(!fs.readdirSync(f.root).some(name => name.startsWith('wiez-sign-')));
});
test('input and existing output APKs are preserved', context => {
  const f = fixture(context);
  assert.throws(() => signApk(f.input, f.input, { env: f.env }), /separate, new/);
  fs.mkdirSync(path.dirname(f.output)); fs.writeFileSync(f.output, 'existing');
  assert.throws(() => signApk(f.input, f.output, { env: f.env }), /separate, new/);
  assert.equal(fs.readFileSync(f.output, 'utf8'), 'existing');
});
