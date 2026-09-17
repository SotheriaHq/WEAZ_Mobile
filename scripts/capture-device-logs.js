/**
 * Capture JS logs from a USB-connected Android phone running a PREVIEW/RELEASE
 * build — no Metro, no dev client.
 *
 *   npm run logs:device            # stream + save
 *   npm run logs:device -- --nav   # only [NAV_PERF] timing lines
 *
 * What a release build actually prints:
 *   - `console.log/info/debug` are STRIPPED at bundle time
 *     (babel `transform-remove-console`, production only). Never rely on them.
 *   - `console.warn` / `console.error` survive and land in logcat under the
 *     `ReactNativeJS` tag. That includes swallowed API failures such as
 *     "Error fetching brand profile by ID", and `[NAV_PERF]` lines — navPerf
 *     re-emits via console.warn outside __DEV__, but only in builds bundled
 *     with EXPO_PUBLIC_DEBUG_NAV=1. The EAS `preview` profile sets it
 *     (eas.json); production/store builds do not, so `--nav` shows nothing there.
 *
 * The phone must be in USB-debugging mode. The "File transfer / Photo
 * transfer" USB choice is unrelated and does not matter:
 *   Settings → About phone → tap "OS version"/"Build number" 7× →
 *   Settings → Additional settings → Developer options → USB debugging ON →
 *   plug in → accept the "Allow USB debugging?" prompt on the phone.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const navOnly = process.argv.includes('--nav');

const devices = spawnSync('adb', ['devices'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (devices.error || devices.status !== 0) {
  console.error('adb was not found on PATH. Install Android platform-tools, or add C:\\Android\\platform-tools to PATH.');
  process.exit(1);
}
const rows = devices.stdout
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean);
if (rows.length === 0) {
  console.error('No phone detected. Enable USB debugging (see the top of this file) and reconnect the cable.');
  process.exit(1);
}
if (rows.every((row) => row.endsWith('unauthorized'))) {
  console.error('Phone detected but unauthorized. Unlock it and accept the "Allow USB debugging?" prompt.');
  process.exit(1);
}

const outDir = path.resolve(__dirname, '..', '..', '.runtime-logs');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `device-${navOnly ? 'nav-' : ''}${stamp}.log`);
const out = fs.createWriteStream(outFile);

console.log(`Streaming ${navOnly ? '[NAV_PERF] lines' : 'JS warnings/errors + crashes'} — saving to ${outFile}`);
console.log('Reproduce the issue on the phone, then press Ctrl+C.\n');

// Clear the old buffer so the capture starts at "now", not hours ago.
spawnSync('adb', ['logcat', '-c'], { shell: process.platform === 'win32' });

const logcat = spawn(
  'adb',
  ['logcat', '-v', 'time', 'ReactNativeJS:V', 'ReactNative:W', 'AndroidRuntime:E', '*:S'],
  { shell: process.platform === 'win32' },
);

let pending = '';
logcat.stdout.on('data', (chunk) => {
  pending += chunk.toString('utf8');
  const lines = pending.split(/\r?\n/);
  pending = lines.pop() ?? '';
  for (const line of lines) {
    if (navOnly && !line.includes('[NAV_PERF]')) continue;
    out.write(`${line}\n`);
    process.stdout.write(`${line}\n`);
  }
});
logcat.stderr.on('data', (chunk) => process.stderr.write(chunk));

const stop = () => {
  logcat.kill();
  out.end(() => {
    console.log(`\nSaved: ${outFile}`);
    process.exit(0);
  });
};
process.on('SIGINT', stop);
logcat.on('exit', stop);
