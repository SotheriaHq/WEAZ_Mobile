const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { signingInputs, signerCertificate, signApk, PUBLIC_DEBUG_CERT } = require('./sign-android-apk.cjs');
const certificate = '12'.repeat(32);
const fields = { ANDROID_KEYSTORE_BASE64: Buffer.alloc(256, 1).toString('base64'), ANDROID_KEYSTORE_PASSWORD: 'private-store',
  ANDROID_KEY_ALIAS: 'test-key', ANDROID_KEY_PASSWORD: 'private-key', ANDROID_SIGNING_CERT_SHA256: certificate };
test('release signing requires complete credentials and refuses public debug trust', () => {
  for (const key of Object.keys(fields)) assert.throws(() => signingInputs({ ...fields, [key]: '' }), /Missing required/);
  assert.throws(() => signingInputs({ ...fields, ANDROID_SIGNING_CERT_SHA256: PUBLIC_DEBUG_CERT }), /private release/);
  assert.throws(() => signingInputs({ ...fields, ANDROID_KEYSTORE_BASE64: '***' }), /encoding/);
  assert.throws(() => signingInputs({ ...fields, ANDROID_KEYSTORE_BASE64: Buffer.alloc(12).toString('base64') }), /encoding/);
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
  assert.equal(signApk(f.input, f.output, { env: f.env, execute }).certificateSha256, certificate);
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
    assert.throws(() => signApk(f.input, f.output, { env: f.env, execute }), /signature does not match/);
    assert(!fs.existsSync(f.output)); assert(!fs.readdirSync(f.root).some(name => name.startsWith('wiez-sign-')));
  }
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
