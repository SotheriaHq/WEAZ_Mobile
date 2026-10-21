const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function evaluate(file, requireModule, extras = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireModule,
    console: { warn() {} }, ...extras }, { filename: file });
  return module.exports;
}

function runtime({ available = true, encode = () => 1024 * 1024 } = {}) {
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
      SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
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
    source(uri, width, height, size) { files.set(uri, { width, height, size }); } };
}

async function main() {
  const original = runtime();
  original.source('file://photo', 3000, 4000, 6 * 1024 * 1024);
  const photo = await original.compressPickedImage('file://photo', 3000, 4000, 'photo.jpg', 'designMedia');
  assert.equal(photo.uri, 'file://photo'); assert.equal(photo.compressed, false);
  assert.equal(photo.fileSize, 6 * 1024 * 1024); assert.equal(original.calls.length, 0);
  original.source('file://alpha', 1000, 1000, 1024 * 1024);
  const alpha = await original.compressPickedImage('file://alpha', 1000, 1000, 'alpha.png', 'designMedia');
  assert.equal(alpha.mimeType, 'image/png'); assert.equal(alpha.uri, 'file://alpha');
  const renamed = await original.compressPickedImage('file://alpha', 1000, 1000, 'picker.heic', 'designMedia', { mimeType: 'image/png' });
  assert.equal(renamed.fileName, 'picker.png');
  const gif = await original.compressPickedImage('file://animation', 300, 400, 'animation.gif', 'designMedia', { fileSize: 1024 });
  assert.equal(gif.uri, 'file://animation'); assert.equal(gif.mimeType, 'image/gif');

  const png = runtime({ encode: () => 7 * 1024 * 1024 });
  png.source('file://large-alpha', 6000, 4000, 16 * 1024 * 1024);
  const converted = await png.compressPickedImage('file://large-alpha', 6000, 4000, 'large.png', 'designMedia');
  assert.equal(converted.mimeType, 'image/png'); assert.equal(converted.fileSize, 7 * 1024 * 1024);
  assert.equal(png.calls[0].options.format, 'png'); assert.equal(png.calls[0].options.compress, 1);
  assert.equal(converted.width, 4096); assert.equal(converted.height, 2731);

  const retries = runtime({ encode: ({ options }) => (options.compress > .95 ? 12 : 7) * 1024 * 1024 });
  retries.source('file://large-jpeg', 6000, 4000, 16 * 1024 * 1024);
  const retried = await retries.compressPickedImage('file://large-jpeg', 6000, 4000, 'large.jpg', 'designMedia');
  assert.equal(retried.fileSize, 7 * 1024 * 1024);
  assert.equal(retries.calls.length, 2);
  assert.ok(retries.calls.every((call) => call.uri === 'file://large-jpeg' && call.options.compress >= .95));
  assert.ok(!retries.removed.includes('file://large-jpeg')); assert.equal(retries.removed.length, 1);

  const unavailable = runtime({ available: false });
  unavailable.source('file://heic', 3000, 4000, 20 * 1024 * 1024);
  const fallback = await unavailable.compressPickedImage('file://heic', 3000, 4000, 'photo.heic', 'designMedia');
  assert.equal(fallback.uri, 'file://heic'); assert.equal(fallback.compressed, false);
  assert.equal(fallback.fileSize, 20 * 1024 * 1024);
  assert.ok(unavailable.validatePickedUploadAsset(fallback, unavailable.MOBILE_UPLOAD_POLICIES.designMedia).length > 0);

  const failure = runtime({ encode: () => { throw new Error('Native codec failed'); } });
  failure.source('file://failure', 6000, 4000, 16 * 1024 * 1024);
  const failed = await failure.compressPickedImage('file://failure', 6000, 4000, 'photo.jpg', 'designMedia');
  assert.equal(failed.uri, 'file://failure'); assert.equal(failed.compressed, false);

  const small = runtime({ encode: () => 9 * 1024 * 1024 });
  small.source('file://small', 200, 100, 20 * 1024 * 1024);
  await small.compressPickedImage('file://small', 200, 100, 'small.jpg', 'designMedia');
  assert.ok(small.calls.every((call) => call.actions.length === 0));

  const parallel = runtime();
  await Promise.all(Array.from({ length: 6 }, async (_, index) => {
    const uri = `file://parallel-${index}`;
    parallel.source(uri, 3000, 4000, 16 * 1024 * 1024);
    const output = await parallel.compressPickedImage(uri, 3000, 4000, 'photo.jpg', 'designMedia');
    assert.equal(output.compressed, true);
  }));
  assert.equal(parallel.calls.length, 6); assert.equal(parallel.peak(), 2);
  console.log('Image compression: source fidelity, PNG/animation, MIME, measured size, codec fallback, retries, cleanup, no-upscale and concurrency gates passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
