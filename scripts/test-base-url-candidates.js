/**
 * A remote API host must never gain loopback fallbacks.
 *
 * The failover list is walked on failure with a 15s timeout per candidate, so
 * every bogus entry is up to 15 seconds of dead wait on a request that was
 * always going to fail there. When `https://api.weaz.me` picked up
 * `https://10.0.2.2`, `https://127.0.0.1` and `https://localhost` on an
 * emulator, one transient failure on the real host cost up to 45 extra
 * seconds — the 23s `/bag/count` in the device log.
 *
 * The regression is invisible in normal use: everything works until the
 * network hiccups, and then the app appears to hang. So it gets a test.
 *
 * Reimplements the candidate rules rather than importing them, because the
 * real module reads Expo Constants and Platform at import time. The point is
 * to pin the RULE; `assertMatchesSource` below keeps this honest by failing if
 * the guard disappears from the source.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '10.0.2.2']);

function isPrivateOrLoopbackHost(hostname) {
  const normalized = String(hostname ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (LOCAL_HOSTS.has(normalized) || normalized === 'host.docker.internal') return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;
  const octets = normalized.split('.');
  if (octets.length === 4 && octets.every((part) => /^\d+$/.test(part))) {
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    if (first === 172 && second >= 16 && second <= 31) return true;
  }
  return false;
}

function buildCandidates({ configuredUrl, platform, isPhysicalDevice, expoHost }) {
  const candidates = [configuredUrl];
  const parsed = new URL(configuredUrl);
  const primaryHost = parsed.hostname;
  const privateOrLoopback = isPrivateOrLoopbackHost(primaryHost);

  const withHost = (host) => {
    const next = new URL(configuredUrl);
    next.hostname = host;
    return next.toString().replace(/\/$/, '');
  };
  const push = (url) => {
    if (!candidates.includes(url)) candidates.push(url);
  };

  if (platform === 'android') {
    if (expoHost && expoHost !== primaryHost && privateOrLoopback) push(withHost(expoHost));
    if (!isPhysicalDevice && privateOrLoopback) {
      push(withHost('10.0.2.2'));
      push(withHost('127.0.0.1'));
      push(withHost('localhost'));
    }
  } else {
    if (expoHost && expoHost !== primaryHost && privateOrLoopback) push(withHost(expoHost));
    if (privateOrLoopback) push(withHost('localhost'));
  }

  return candidates;
}

// A remote host gets NO fallbacks, on any platform, emulator or not.
for (const platform of ['android', 'ios']) {
  for (const isPhysicalDevice of [true, false]) {
    const candidates = buildCandidates({
      configuredUrl: 'https://api.weaz.me',
      platform,
      isPhysicalDevice,
      expoHost: '192.168.0.158',
    });
    assert.deepStrictEqual(
      candidates,
      ['https://api.weaz.me'],
      `remote host gained fallbacks on ${platform} (physical=${isPhysicalDevice})`,
    );
  }
}

// A local dev server still gets them — that is what the feature is for.
const localEmulator = buildCandidates({
  configuredUrl: 'http://192.168.0.158:3040',
  platform: 'android',
  isPhysicalDevice: false,
  expoHost: '192.168.0.158',
});
assert.ok(
  localEmulator.some((url) => url.includes('10.0.2.2')),
  'android emulator lost its 10.0.2.2 fallback for a local dev server',
);
assert.ok(
  localEmulator.length > 1,
  'local dev server should keep loopback fallbacks',
);

// A physical device on a LAN dev server must not be sent to loopback: on a
// phone, localhost is the phone.
const localPhysical = buildCandidates({
  configuredUrl: 'http://192.168.0.158:3040',
  platform: 'android',
  isPhysicalDevice: true,
  expoHost: '192.168.0.158',
});
assert.ok(
  !localPhysical.some((url) => url.includes('127.0.0.1') || url.includes('10.0.2.2')),
  'physical device gained loopback candidates',
);

/** The rule above is only worth anything if the source still enforces it. */
function assertMatchesSource() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'api', 'httpClient.ts'),
    'utf8',
  );
  assert.ok(
    /!runningOnPhysicalDevice && privateOrLoopback/.test(source),
    'httpClient no longer guards the emulator fallbacks on privateOrLoopback',
  );
  assert.ok(
    /if \(privateOrLoopback\) \{\s*\n\s*pushUniqueCandidate\(candidates, buildBaseUrlWithHost\(configuredUrl, 'localhost'\)\);/.test(
      source,
    ),
    'httpClient no longer guards the iOS localhost fallback on privateOrLoopback',
  );
}

assertMatchesSource();

console.log(
  'base url candidate contract passed (remote hosts get no loopback fallbacks; local dev servers keep theirs)',
);
