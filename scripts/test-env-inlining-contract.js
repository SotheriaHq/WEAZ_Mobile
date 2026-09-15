/**
 * EXPO_PUBLIC_* inlining contract.
 *
 * Expo replaces `process.env.EXPO_PUBLIC_FOO` with a literal at BUNDLE time.
 * Its docs are explicit about the limit:
 *
 *   "process.env['EXPO_PUBLIC_KEY'] or const {EXPO_PUBLIC_X} = process.env
 *    is invalid and will not be inlined."
 *
 * `src/config/env.ts` read `process.env[key]` for months. The bundler could not
 * see which keys were wanted, inlined none, and every value fell back to its
 * default in release builds — while development kept working, because the Expo
 * CLI populates `process.env` at runtime there. The bug was therefore invisible
 * in the one place with a console, and the first symptom on a real build was
 * "Google sign-up isn't available in this version of the app", because
 * `env.google.configured` was computed from three empty strings.
 *
 * A type error cannot catch this: a loop over `EnvKey` type-checks perfectly
 * and is just as broken. Only the shape of the source tells the truth.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, 'src', 'config', 'env.ts');
const packageJsonPath = path.join(repoRoot, 'package.json');

const SEARCH_DIRS = ['src', 'app', 'components'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The declared key union — the set that must each be inlined. */
function readEnvKeys(source) {
  const match = source.match(/type EnvKey =([\s\S]*?);/);
  assert.ok(match, 'env.ts must declare an EnvKey union.');
  const keys = match[1].match(/'([A-Z0-9_]+)'/g)?.map((raw) => raw.slice(1, -1)) ?? [];
  assert.ok(keys.length > 0, 'EnvKey must list at least one variable.');
  return keys;
}

function testEveryDeclaredKeyIsStaticallyReferenced() {
  const source = fs.readFileSync(envPath, 'utf8');

  for (const key of readEnvKeys(source)) {
    assert.ok(
      new RegExp(`process\\.env\\.${key}\\b`).test(source),
      `${key} is declared in EnvKey but never read as a static \`process.env.${key}\` — ` +
        'Expo will not inline it, so it will silently fall back to its default in a release build.',
    );
  }
}

/**
 * Comments are stripped before scanning: this contract documents the invalid
 * patterns by quoting them, and `env.ts` does the same, so a scan of raw text
 * flags the explanation as the offence. The `[^:]` guard keeps `https://` from
 * being read as a line comment.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function testNoComputedOrDestructuredAccessAnywhere() {
  const offenders = [];

  for (const dir of SEARCH_DIRS) {
    for (const file of walk(path.join(repoRoot, dir))) {
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      const relative = path.relative(repoRoot, file).replace(/\\/g, '/');

      // Computed access: process.env[...]
      if (/process\.env\s*\[/.test(source)) {
        offenders.push(`${relative}: process.env[...] is never inlined`);
      }
      // Destructuring: const { EXPO_PUBLIC_X } = process.env
      if (/(?:const|let|var)\s*\{[^}]*\}\s*=\s*process\.env\b/.test(source)) {
        offenders.push(`${relative}: destructuring process.env is never inlined`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `EXPO_PUBLIC_* must be read as a static property.\n  ${offenders.join('\n  ')}`,
  );
}

function testTheMapStaysALiteral() {
  const source = stripComments(fs.readFileSync(envPath, 'utf8'));
  const map = source.match(/const RAW_ENV[\s\S]*?\n\};/);
  assert.ok(map, 'env.ts must keep a literal RAW_ENV map.');

  // A loop or spread over the key union type-checks and reintroduces the bug.
  for (const pattern of [/\.map\(/, /\.forEach\(/, /\.reduce\(/, /\.\.\./, /for\s*\(/]) {
    assert.doesNotMatch(
      map[0],
      pattern,
      'RAW_ENV must stay one static `process.env.KEY` per line — a loop or spread ' +
        'type-checks but inlines nothing.',
    );
  }

  const keys = readEnvKeys(source);
  const entries = map[0].match(/process\.env\.[A-Z0-9_]+/g) ?? [];
  assert.equal(
    entries.length,
    keys.length,
    `RAW_ENV has ${entries.length} static reads for ${keys.length} declared keys.`,
  );
}

function testGoogleConfiguredCannotBeSilentlyEmpty() {
  const source = fs.readFileSync(envPath, 'utf8');
  // The three ids whose emptiness produced the reported symptom.
  for (const key of [
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  ]) {
    assert.match(
      source,
      new RegExp(`${key}:\\s*process\\.env\\.${key}`),
      `${key} must be mapped from its own static read.`,
    );
  }
}

function testScriptIsRegistered() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.equal(
    pkg.scripts['test:env-inlining-contract'],
    'node scripts/test-env-inlining-contract.js',
    'The contract must be runnable by name.',
  );
}

function main() {
  testEveryDeclaredKeyIsStaticallyReferenced();
  testNoComputedOrDestructuredAccessAnywhere();
  testTheMapStaysALiteral();
  testGoogleConfiguredCannotBeSilentlyEmpty();
  testScriptIsRegistered();

  console.log('env inlining contract: 5 checks passed');
}

main();
