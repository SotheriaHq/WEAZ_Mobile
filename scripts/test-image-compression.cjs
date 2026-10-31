const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const MB = 1024 * 1024;

function evaluate(file, requireModule, extras = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireModule,
    console: { warn() {} }, ...extras }, { filename: file });
  return module.exports;
}

function runtime({ available = true, encode = () => 0.5 * MB } = {}) {
  const policy = evaluate('src/utils/uploadValidation.ts', () => { throw new Error('Unexpected dependency'); });
  const files = new Map();
  const calls = [];
  const removed = [];
  let active = 0, peak = 0;
  class File {
    constructor(uri) { this.uri = uri; }
    get size() { return files.get(this.uri)?.size ?? 0; }
    delete() { removed.push(this.uri); files.delete(this.uri); }
  }
  const api = evaluate('src/utils/imageCompression.ts', (name) => {
    if (name === './uploadValidation') return policy;
    if (name === 'expo-file-system') return { File };
    if (name === 'expo-modules-core') return { NativeModulesProxy: {} };
    if (name === 'expo-image-manipulator') return {
      SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
      async manipulateAsync(uri, actions, options) {
        const call = { uri, actions, options };
        calls.push(call); active++; peak = Math.max(peak, active);
        try {
          await new Promise((resolve) => setImmediate(resolve));
          const size = encode(call, calls.length);
          const source = files.get(uri);
          const dimensions = actions[0]?.resize ?? source;
          const result = { uri: `file://encoded-${calls.indexOf(call)}.${options.format}`, width: dimensions.width, height: dimensions.height };
          files.set(result.uri, { ...result, size });
          return result;
        } finally { active--; }
      },
    };
    throw new Error(`Unexpected dependency: ${name}`);
  }, { expo: available ? { modules: { ExpoImageManipulator: {} } } : {},
    fetch: async () => { throw new Error('A known file must not be read into a JS blob'); } });
  return { ...api, ...policy, calls, removed, files, peak: () => peak,
    temporary: () => [...files.keys()].filter((uri) => uri.startsWith('file://encoded-')),
    source(uri, width, height, size) { files.set(uri, { width, height, size }); } };
}

// A size for each encoder setting, so a test states what would really be produced.
const bySize = (table) => ({ options }) => table[`${options.format} ${options.compress}`] * MB;

async function main() {
  const original = runtime();
  original.source('file://photo', 3000, 4000, MB);
  const photo = await original.compressPickedImage('file://photo', 3000, 4000, 'photo.jpg', 'designMedia');
  assert.equal(photo.uri, 'file://photo'); assert.equal(photo.compressed, false);
  assert.equal(photo.fileSize, MB); assert.equal(original.calls.length, 0);
  original.source('file://alpha', 1000, 1000, MB);
  const alpha = await original.compressPickedImage('file://alpha', 1000, 1000, 'alpha.png', 'designMedia');
  assert.equal(alpha.mimeType, 'image/png'); assert.equal(alpha.uri, 'file://alpha');
  const renamed = await original.compressPickedImage('file://alpha', 1000, 1000, 'picker.heic', 'designMedia', { mimeType: 'image/png' });
  assert.equal(renamed.fileName, 'picker.png');
  const gif = await original.compressPickedImage('file://animation', 300, 400, 'animation.gif', 'designMedia', { fileSize: 1024 });
  assert.equal(gif.uri, 'file://animation'); assert.equal(gif.mimeType, 'image/gif');

  // The reported failure: a 3MB photo passed every local check and the server refused it.
  const reported = runtime({ encode: bySize({ 'jpeg 0.95': 1.6, 'jpeg 0.9': 1.2, 'jpeg 0.85': .9 }) });
  reported.source('file://13068', 3000, 4000, 3 * MB);
  const fixed = await reported.compressPickedImage('file://13068', 3000, 4000, '13068.jpg', 'designMedia');
  assert.equal(fixed.compressed, true); assert.equal(fixed.mimeType, 'image/jpeg');
  assert.equal(fixed.fileName, '13068.jpg'); assert.equal(fixed.fileSize, .9 * MB);
  assert.deepEqual(reported.calls.map((call) => call.options.compress), [.85, .95, .9], 'keeps the highest quality that fits');
  assert.equal(reported.validatePickedUploadAsset(fixed, reported.MOBILE_UPLOAD_POLICIES.designMedia).length, 0);
  assert.deepEqual(reported.temporary(), [fixed.uri], 'rejected attempts must not stay in the cache');
  assert.ok(!reported.removed.includes('file://13068'));

  const underCeiling = runtime({ encode: bySize({ 'jpeg 0.95': .8, 'jpeg 0.85': .6 }) });
  underCeiling.source('file://1500kb', 3000, 4000, 1.5 * MB);
  const aimed = await underCeiling.compressPickedImage('file://1500kb', 3000, 4000, 'photo.jpg', 'designMedia');
  assert.equal(aimed.fileSize, .8 * MB, 'a photo the API would accept still aims for the target');

  // Compression only. These sizes never fit, so every path through the code runs.
  const huge = runtime({ encode: bySize({ 'jpeg 0.85': 6.9, 'jpeg 0.7': 4.5, 'jpeg 0.6': 3.7, 'webp 0.6': 2.3, 'webp 0.5': 1.8 }) });
  huge.source('file://50mp', 8160, 6120, 12 * MB);
  const kept = await huge.compressPickedImage('file://50mp', 8160, 6120, '50mp.jpg', 'designMedia');
  assert.ok(huge.calls.every((call) => call.actions.length === 0), 'an upload must never be resized');
  assert.equal(kept.width, 8160); assert.equal(kept.height, 6120);
  assert.equal(kept.fileSize, 1.8 * MB); assert.equal(kept.mimeType, 'image/webp');
  assert.deepEqual(huge.calls.map((call) => `${call.options.format} ${call.options.compress}`),
    ['jpeg 0.85', 'jpeg 0.7', 'jpeg 0.6', 'webp 0.6', 'webp 0.5'], 'WebP only as the last resort for the ceiling');

  const betweenLimits = runtime({ encode: bySize({ 'jpeg 0.85': 2.2, 'jpeg 0.7': 1.9, 'jpeg 0.6': 1.6 }) });
  betweenLimits.source('file://busy', 4000, 3000, 5 * MB);
  const busy = await betweenLimits.compressPickedImage('file://busy', 4000, 3000, 'busy.jpg', 'designMedia');
  assert.equal(busy.fileSize, 1.6 * MB); assert.equal(betweenLimits.calls.length, 3, 'no quality is spent chasing the target past the floor');

  // Under 8MP the view is not scaled down enough to hide heavier compression.
  const small = runtime({ encode: () => 1.3 * MB });
  small.source('file://small', 2000, 1500, 3 * MB);
  const smallOutput = await small.compressPickedImage('file://small', 2000, 1500, 'small.jpg', 'designMedia');
  assert.equal(smallOutput.fileSize, 1.3 * MB);
  assert.deepEqual(small.calls.map((call) => call.options.compress), [.9, .85, .8], 'a small photo stops at the 80% floor');

  const keepSource = runtime({ encode: () => 1.2 * MB });
  keepSource.source('file://sharp', 3000, 4000, 1.5 * MB);
  const sharpest = await keepSource.compressPickedImage('file://sharp', 3000, 4000, 'sharp.jpg', 'designMedia');
  assert.equal(sharpest.uri, 'file://sharp', 'an acceptable source beats a second generation that misses the target anyway');
  assert.deepEqual(keepSource.temporary(), []);

  const impossible = runtime({ encode: () => 9 * MB });
  impossible.source('file://noise', 8000, 6000, 11 * MB);
  const refused = await impossible.compressPickedImage('file://noise', 8000, 6000, 'noise.jpg', 'designMedia');
  assert.equal(refused.uri, 'file://noise'); assert.equal(impossible.calls.length, 6, 'work is bounded');
  assert.ok(impossible.validatePickedUploadAsset(refused, impossible.MOBILE_UPLOAD_POLICIES.designMedia).length > 0);
  assert.deepEqual(impossible.temporary(), []);

  const flat = runtime({ encode: () => .7 * MB });
  flat.source('file://screenshot', 1080, 2400, 1.5 * MB);
  const lossless = await flat.compressPickedImage('file://screenshot', 1080, 2400, 'screen.png', 'designMedia');
  assert.equal(lossless.mimeType, 'image/png'); assert.equal(lossless.fileName, 'screen.png');
  assert.equal(flat.calls.length, 1); assert.equal(flat.calls[0].options.compress, 1);

  const large = runtime({ encode: ({ options }) => (options.format === 'png' ? 4 : .8) * MB });
  large.source('file://large-alpha', 6000, 4000, 16 * MB);
  const transparent = await large.compressPickedImage('file://large-alpha', 6000, 4000, 'large.png', 'designMedia');
  assert.equal(transparent.mimeType, 'image/webp', 'WebP keeps transparency, JPEG would not');
  assert.ok(large.calls.every((call) => call.options.format === 'webp'), 'a lossless attempt that cannot fit is skipped');

  const heic = runtime();
  heic.source('file://heic', 3000, 4000, 800 * 1024);
  const converted = await heic.compressPickedImage('file://heic', 3000, 4000, 'IMG_0001.heic', 'designMedia');
  assert.equal(converted.mimeType, 'image/jpeg'); assert.equal(converted.fileName, 'IMG_0001.jpg');

  for (const profile of ['profileImage', 'bannerImage', 'messageImage']) {
    const other = runtime();
    other.source('file://other', 3000, 4000, 3 * MB);
    const output = await other.compressPickedImage('file://other', 3000, 4000, 'other.jpg', profile);
    assert.equal(output.compressed, true, `${profile} must compress what the API would refuse`);
    assert.equal(other.MOBILE_UPLOAD_POLICIES[profile].maxSizeBytes, 2 * MB);
    assert.equal(other.MOBILE_UPLOAD_POLICIES[profile].preferredSizeBytes, MB);
  }

  const unmeasured = runtime({ encode: () => 0 });
  unmeasured.source('file://unmeasured', 3000, 4000, 3 * MB);
  const unknown = await unmeasured.compressPickedImage('file://unmeasured', 3000, 4000, 'photo.jpg', 'designMedia');
  assert.equal(unknown.compressed, true); assert.equal(unknown.fileSize, undefined); assert.equal(unmeasured.calls.length, 1);

  const unavailable = runtime({ available: false });
  unavailable.source('file://heic', 3000, 4000, 20 * MB);
  const fallback = await unavailable.compressPickedImage('file://heic', 3000, 4000, 'photo.heic', 'designMedia');
  assert.equal(fallback.uri, 'file://heic'); assert.equal(fallback.compressed, false);
  assert.equal(fallback.fileSize, 20 * MB);
  assert.ok(unavailable.validatePickedUploadAsset(fallback, unavailable.MOBILE_UPLOAD_POLICIES.designMedia).length > 0);

  const failure = runtime({ encode: () => { throw new Error('Native codec failed'); } });
  failure.source('file://failure', 6000, 4000, 16 * MB);
  const failed = await failure.compressPickedImage('file://failure', 6000, 4000, 'photo.jpg', 'designMedia');
  assert.equal(failed.uri, 'file://failure'); assert.equal(failed.compressed, false);

  const midway = runtime({ encode: (_, count) => { if (count > 1) throw new Error('Out of memory'); return .9 * MB; } });
  midway.source('file://midway', 3000, 4000, 3 * MB);
  await midway.compressPickedImage('file://midway', 3000, 4000, 'photo.jpg', 'designMedia');
  assert.deepEqual(midway.temporary(), [], 'a failed attempt must not leave earlier candidates behind');

  const parallel = runtime();
  await Promise.all(Array.from({ length: 6 }, async (_, index) => {
    const uri = `file://parallel-${index}`;
    parallel.source(uri, 3000, 4000, 16 * MB);
    const output = await parallel.compressPickedImage(uri, 3000, 4000, 'photo.jpg', 'designMedia');
    assert.equal(output.compressed, true);
  }));
  assert.ok(parallel.calls.length <= 18, 'each photo costs at most three encodes'); assert.equal(parallel.peak(), 2);
  console.log('Image compression: no resizing, 1MB target, 2MB ceiling, source fidelity, transparency, animation, MIME, measured size, codec fallback, cleanup and concurrency gates passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
