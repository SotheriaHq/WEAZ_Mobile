/**
 * Fetch the Gradle distribution the wrapper wants, verify it, and point the
 * wrapper at the verified local copy.
 *
 * Every CI build runs on a fresh machine, so `./gradlew` first downloads Gradle
 * (~130 MB) from services.gradle.org with a 10-second timeout. When that host
 * is slow or down (2026-11-08: repeated 504s) the build dies before compiling
 * anything. This makes the build independent of one host:
 *
 *   1. A copy already in the cache directory is reused if its SHA-256 matches.
 *   2. Otherwise each source is tried in order — the official URL first, then
 *      public mirrors — with retries and backoff.
 *   3. Nothing is accepted unless its SHA-256 equals Gradle's OFFICIAL checksum
 *      (pinned below from https://gradle.org/release-checksums/). A mirror can
 *      only ever supply the identical file, never a different one: this build
 *      is signed with the release key, so a tampered toolchain must fail.
 *   4. The wrapper is rewritten to the verified local file plus
 *      `distributionSha256Sum`, so Gradle verifies it again itself.
 *
 * A wrapper version without a pinned checksum may only come from the official
 * host, verified against the official `.sha256` beside it — never a mirror.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** Official SHA-256 of `gradle-<version>-<type>.zip`, from gradle.org/release-checksums. */
const OFFICIAL_SHA256 = {
  'gradle-9.3.1-bin.zip': 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06',
  'gradle-9.3.1-all.zip': '17f277867f6914d61b1aa02efab1ba7bb439ad652ca485cd8ca6842fccec6e43',
};

/** Mirrors of services.gradle.org/distributions, tried only for pinned checksums. */
const MIRRORS = [
  'https://mirrors.cloud.tencent.com/gradle/',
  'https://mirrors.huaweicloud.com/gradle/',
];

function parseDistributionUrl(properties) {
  const match = /^distributionUrl=(.+)$/m.exec(properties);
  if (!match) throw new Error('gradle-wrapper.properties has no distributionUrl.');
  const url = match[1].trim().replace(/\\:/g, ':');
  const fileName = url.slice(url.lastIndexOf('/') + 1);
  if (!/^gradle-[0-9][0-9A-Za-z.-]*-(bin|all)\.zip$/.test(fileName)) {
    throw new Error(`Unexpected Gradle distribution name: ${fileName}`);
  }
  return { url, fileName };
}

/** Sources to try, official first. Mirrors only when the checksum is pinned. */
function candidateSources({ url, fileName }, pinned = OFFICIAL_SHA256) {
  const sources = [url];
  if (pinned[fileName]) for (const mirror of MIRRORS) sources.push(mirror + fileName);
  return sources;
}

/** Point the wrapper at a verified local file and pin its checksum. */
function rewriteProperties(properties, localPath, sha256) {
  const fileUrl = 'file\\:' + localPath.split(path.sep).join('/').replace(/:/g, '\\:');
  let next = properties.replace(/^distributionUrl=.*$/m, `distributionUrl=${fileUrl}`);
  next = next.replace(/^distributionSha256Sum=.*\r?\n?/m, '');
  next = next.replace(/^networkTimeout=.*$/m, 'networkTimeout=120000');
  if (!next.endsWith('\n')) next += '\n';
  return `${next}distributionSha256Sum=${sha256}\n`;
}

const sha256Of = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function download(source, destination, run = spawnSync) {
  const result = run('curl', [
    '--fail', '--location', '--silent', '--show-error',
    '--retry', '4', '--retry-all-errors', '--retry-delay', '15',
    '--connect-timeout', '20', '--max-time', '900',
    '--output', destination, source,
  ], { encoding: 'utf8', timeout: 1000 * 60 * 20 });
  return result.status === 0;
}

function expectedChecksum({ url, fileName }, run = spawnSync, pinned = OFFICIAL_SHA256) {
  if (pinned[fileName]) return pinned[fileName];
  // Not pinned: only the official checksum file will do.
  const result = run('curl', ['--fail', '--location', '--silent', '--max-time', '60', `${url}.sha256`], { encoding: 'utf8' });
  const sha = (result.stdout || '').trim().toLowerCase();
  if (result.status !== 0 || !/^[0-9a-f]{64}$/.test(sha)) {
    throw new Error(`No pinned checksum for ${fileName} and the official checksum is unavailable; add it to OFFICIAL_SHA256.`);
  }
  return sha;
}

function fetchDistribution(propertiesPath, cacheDir, { run = spawnSync, log = console.log, pinned = OFFICIAL_SHA256 } = {}) {
  const properties = fs.readFileSync(propertiesPath, 'utf8');
  const dist = parseDistributionUrl(properties);
  const sha256 = expectedChecksum(dist, run, pinned);
  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, dist.fileName);

  if (fs.existsSync(localPath) && sha256Of(localPath) === sha256) {
    log(`Using cached ${dist.fileName} (checksum verified).`);
  } else {
    const partial = `${localPath}.partial`;
    let verified = false;
    for (const source of candidateSources(dist, pinned)) {
      fs.rmSync(partial, { force: true });
      if (!download(source, partial, run)) {
        log(`Could not download from ${new URL(source).host}; trying the next source.`);
        continue;
      }
      if (sha256Of(partial) !== sha256) {
        log(`Rejected ${new URL(source).host}: checksum does not match the official release.`);
        continue;
      }
      fs.renameSync(partial, localPath);
      log(`Fetched ${dist.fileName} from ${new URL(source).host} (checksum verified).`);
      verified = true;
      break;
    }
    fs.rmSync(partial, { force: true });
    if (!verified) throw new Error(`Could not obtain a verified ${dist.fileName} from any source.`);
  }

  fs.writeFileSync(propertiesPath, rewriteProperties(properties, localPath, sha256));
  return { localPath, sha256 };
}

module.exports = { OFFICIAL_SHA256, MIRRORS, parseDistributionUrl, candidateSources, rewriteProperties, fetchDistribution };

if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/fetch-gradle-distribution.cjs <gradle-wrapper.properties> <cache-dir>');
    fetchDistribution(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
