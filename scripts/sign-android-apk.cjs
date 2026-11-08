const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** APK Signature Scheme block IDs: v2, v3 and v3.1. */
const SIGNATURE_SCHEME_IDS = new Set([0x7109871a, 0xf05368c0, 0x1b93ad61]);

/**
 * SHA-256 of every signer's certificate in an APK's signing block (v2/v3/v3.1),
 * read from the binary format itself rather than from a tool's printed text —
 * apksigner builds word their output differently, and a check that parsed the
 * text refused a correctly signed APK because one build laid it out another way.
 * apksigner still proves the signatures are valid; this only says WHOSE they are.
 */
function apkSignerCertificates(apk) {
  const magic = Buffer.from('APK Sig Block 42');
  const magicAt = apk.lastIndexOf(magic);
  if (magicAt < 8) throw Error('The APK has no signing block.');
  const blockSize = Number(apk.readBigUInt64LE(magicAt - 8));
  const blockStart = magicAt + 16 - blockSize - 8;
  if (blockStart < 0) throw Error('The APK signing block is malformed.');
  const digests = [];
  let pair = blockStart + 8;
  const pairsEnd = magicAt - 8;
  while (pair + 12 <= pairsEnd) {
    const pairLength = Number(apk.readBigUInt64LE(pair));
    const id = apk.readUInt32LE(pair + 8);
    const value = apk.subarray(pair + 12, pair + 8 + pairLength);
    if (SIGNATURE_SCHEME_IDS.has(id)) {
      // value: u32 signers length, then length-prefixed signers.
      let cursor = 4;
      const signersEnd = 4 + value.readUInt32LE(0);
      while (cursor + 4 <= signersEnd) {
        const signerLength = value.readUInt32LE(cursor);
        const signer = value.subarray(cursor + 4, cursor + 4 + signerLength);
        // signer: u32 signed-data length, signed data = digests seq, certificates seq.
        const signedData = signer.subarray(4, 4 + signer.readUInt32LE(0));
        const digestsLength = signedData.readUInt32LE(0);
        const certificates = 4 + digestsLength + 4;
        const certificateLength = signedData.readUInt32LE(certificates);
        const certificate = signedData.subarray(certificates + 4, certificates + 4 + certificateLength);
        digests.push(crypto.createHash('sha256').update(certificate).digest('hex'));
        cursor += 4 + signerLength;
      }
    }
    pair += 8 + pairLength;
  }
  return digests;
}

const PUBLIC_DEBUG_CERT = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
function signingInputs(env) {
  for (const name of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'ANDROID_SIGNING_CERT_SHA256'])
    if (typeof env[name] !== 'string' || !env[name]) throw Error(`Missing required signing configuration: ${name}`);
  const encoded = env.ANDROID_KEYSTORE_BASE64;
  if (encoded.length > 3000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('Invalid Android keystore encoding.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 128 || bytes.toString('base64') !== encoded) throw Error('Invalid Android keystore encoding.');
  const certificate = env.ANDROID_SIGNING_CERT_SHA256.replaceAll(':', '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(certificate) || certificate === PUBLIC_DEBUG_CERT) throw Error('A private release signing certificate is required.');
  if (env.ANDROID_KEY_ALIAS.length > 256 || env.ANDROID_KEYSTORE_PASSWORD.length > 4096 || env.ANDROID_KEY_PASSWORD.length > 4096)
    throw Error('Invalid Android signing configuration.');
  return { bytes, certificate };
}
/**
 * The single signer certificate apksigner verified, or an error.
 *
 * Identical lines are one signer: some apksigner builds repeat a signer's
 * lines (once per scheme), and counting the repeat as a second signer refused
 * a correctly signed APK. Two DIFFERENT signer entries still fail, as does a
 * reported signer count other than one.
 */
function signerCertificate(output) {
  const text = String(output).replace(/\r\n/g, '\n');
  const lines = [...text.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f]{64})\s*$/gim)]
    .map((match) => match[0].trim().toLowerCase());
  const unique = [...new Set(lines)];
  const count = /^Number of signers:\s*(\d+)\s*$/im.exec(text);
  if (unique.length !== 1 || (count && Number(count[1]) !== 1)) {
    throw Error('The APK must have exactly one verified release signer.');
  }
  return /([0-9a-f]{64})\s*$/.exec(unique[0])[1];
}

/** Public facts about the signers, for the build log when verification fails. */
function signerSummary(output) {
  const text = String(output || '').replace(/\r\n/g, '\n');
  const count = (/^Number of signers:\s*(\d+)/im.exec(text) || [])[1] ?? 'not reported';
  const digests = [...text.matchAll(/^(Signer[^\n]*certificate SHA-256 digest:\s*[0-9a-f]{64})\s*$/gim)].map((m) => m[1]);
  return `The APK signer check found: Number of signers ${count}; ${digests.length ? digests.join(' | ') : 'no signer certificate lines'}.`;
}
function signingJar(env) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk || !path.isAbsolute(sdk)) throw Error('Android SDK location is required for release signing.');
  const tools = path.join(sdk, 'build-tools');
  const versions = fs.readdirSync(tools, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name))
    .map(entry => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const jar = versions.map(version => path.join(tools, version, 'lib/apksigner.jar')).find(filename => fs.existsSync(filename));
  if (!jar) throw Error('Android SDK apksigner is not available.');
  return jar;
}

/** Sign into private temporary storage, verify the pinned certificate, then publish a copy. */
function signApk(input, output, {
  env = process.env,
  execute = spawnSync,
  readCertificates = (file) => apkSignerCertificates(fs.readFileSync(file)),
} = {}) {
  const { bytes, certificate } = signingInputs(env);
  const source = path.resolve(input), destination = path.resolve(output);
  if (source === destination || !/\.apk$/i.test(source) || !/\.apk$/i.test(destination) ||
    !fs.lstatSync(source).isFile() || fs.existsSync(destination)) throw Error('Signing requires an existing APK and a separate, new APK output.');
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP)) throw Error('A private runner temporary directory is required.');
  const temporaryRoot = fs.realpathSync(env.RUNNER_TEMP);
  const jar = signingJar(env);
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'wiez-sign-')); fs.chmodSync(directory, 0o700);
  const keystore = path.join(directory, 'release.jks'), signed = path.join(directory, 'signed.apk');
  const childEnv = {};
  for (const name of ['PATH', 'Path', 'JAVA_HOME', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'LANG', 'HOME'])
    if (env[name]) childEnv[name] = env[name];
  childEnv.ANDROID_KEYSTORE_PASSWORD = env.ANDROID_KEYSTORE_PASSWORD;
  childEnv.ANDROID_KEY_PASSWORD = env.ANDROID_KEY_PASSWORD;
  const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  try {
    fs.writeFileSync(keystore, bytes, { mode: 0o600, flag: 'wx' });
    const options = { env: childEnv, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 };
    const result = execute(java, ['-jar', jar, 'sign', '--ks', keystore, '--ks-key-alias', env.ANDROID_KEY_ALIAS,
      '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:ANDROID_KEY_PASSWORD',
      '--v4-signing-enabled', 'false', '--out', signed, source], options);
    if (result.status !== 0) throw Error('Android release signing failed. No APK was published.');
    const verified = execute(java, ['-jar', jar, 'verify', '--verbose', '--print-certs', signed], options);
    if (verified.status !== 0)
      throw Error('The APK signature does not match the configured release certificate. No APK was published.');
    // apksigner proved the signatures valid; the signing block says whose they are.
    const signers = [...new Set(readCertificates(signed))];
    if (signers.length !== 1) {
      console.log(`The APK signer check found ${signers.length} distinct signer certificates: ${signers.join(' | ') || 'none'}.`);
      throw Error('The APK must have exactly one verified release signer.');
    }
    if (signers[0] !== certificate) {
      console.log(`The APK signer check found certificate ${signers[0]}.`);
      throw Error('The APK signature does not match the configured release certificate. No APK was published.');
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(signed, destination, fs.constants.COPYFILE_EXCL);
    return { output: destination, certificateSha256: certificate };
  } finally {
    // Only our two named files, inside the verified runner temporary directory.
    if (path.dirname(directory) === temporaryRoot) {
      for (const filename of [keystore, signed]) if (fs.existsSync(filename)) fs.unlinkSync(filename);
      fs.rmdirSync(directory);
    }
  }
}

module.exports = { signingInputs, signerCertificate, signerSummary, apkSignerCertificates, signApk, PUBLIC_DEBUG_CERT };
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw Error('Usage: node scripts/sign-android-apk.cjs <input.apk> <new-output.apk>');
    const result = signApk(process.argv[2], process.argv[3]);
    console.log(`Verified release APK: ${result.output}; SHA-256 certificate ${result.certificateSha256}`);
  } catch (error) {
    // Never forward Java/provider output: it may include credential details.
    const allowed = /^(Missing required signing configuration: [A-Z_]+|Invalid Android (?:keystore encoding|signing configuration)\.|A private release signing certificate is required\.|Android SDK .*|Android release signing failed\..*|The APK .*|Signing requires .*|A private runner .*|Usage: .*)$/;
    console.error(allowed.test(error.message) ? error.message : 'Android signing could not finish. No APK was published.');
    process.exitCode = 1;
  }
}
