/**
 * ARU Product Identity Migration — Mobile SecureStore Contract Suite (AUTH-T01 through AUTH-T08 & Section 4 Extended)
 * Governed by Document 26 (ARU-P1-CTR-026-REV2).
 */

const assert = require('assert');

// In-memory mock storage simulation of SecureStore
class MockSecureStore {
  constructor() {
    this.store = new Map();
    this.failNextWrite = false;
    this.failNextDelete = false;
    this.readbackMismatch = false;
  }

  async getItemAsync(key) {
    if (this.readbackMismatch && key === 'ARU_ACCESS_TOKEN.credentials.v2' && this.store.has(key)) {
      return JSON.stringify({ version: 2, accessToken: 'corrupt_readback_mismatch', refreshToken: null });
    }
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async setItemAsync(key, value) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Simulated SecureStore disk/keychain write failure');
    }
    this.store.set(key, String(value));
  }

  async deleteItemAsync(key) {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error('Simulated SecureStore keychain delete failure');
    }
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
    this.failNextWrite = false;
    this.failNextDelete = false;
    this.readbackMismatch = false;
  }
}

// Canonical Mobile SecureStore Adapter implementation using injected storage
class MobileSecureStoreAdapter {
  constructor(storage) {
    this.storage = storage;
    this.PRIMARY_KEY = 'ARU_ACCESS_TOKEN.credentials.v2';
    this.LEGACY_KEY = 'WIEZ_ACCESS_TOKEN.credentials.v2';
    this.HISTORICAL_KEYS = [
      'WIEZ_ACCESS_TOKEN',
      'WIEZ_REFRESH_TOKEN',
      'THREADLY_ACCESS_TOKEN',
      'THREADLY_REFRESH_TOKEN',
      'ARU_ACCESS_TOKEN',
      'ARU_REFRESH_TOKEN',
    ];
  }

  async readCredentials() {
    // 1. Read primary ARU credentials
    const primaryRaw = await this.storage.getItemAsync(this.PRIMARY_KEY);
    if (primaryRaw) {
      try {
        const parsed = JSON.parse(primaryRaw);
        if (parsed && parsed.version === 2) {
          return parsed;
        }
      } catch {
        await this.storage.deleteItemAsync(this.PRIMARY_KEY).catch(() => undefined);
      }
    }

    // 2. Read legacy fallback credentials
    const legacyRaw = await this.storage.getItemAsync(this.LEGACY_KEY);
    if (!legacyRaw) {
      return null;
    }

    let legacyCreds = null;
    try {
      const parsed = JSON.parse(legacyRaw);
      if (parsed && parsed.version === 2) {
        legacyCreds = parsed;
      }
    } catch {
      return null;
    }

    if (!legacyCreds) {
      return null;
    }

    // 3. Durable migration: Write-Primary -> Verify -> Retire-Legacy
    try {
      await this.storage.setItemAsync(this.PRIMARY_KEY, legacyRaw);
      const verified = await this.storage.getItemAsync(this.PRIMARY_KEY);
      if (verified === legacyRaw) {
        try {
          await this.storage.deleteItemAsync(this.LEGACY_KEY);
        } catch (delErr) {
          console.warn('[AuthMigration] Non-fatal legacy credential retirement failure. Retained for retry.');
        }
      }
    } catch (writeErr) {
      console.warn('[AuthMigration] Primary key write failed. Returning legacy credentials without deletion.');
    }

    return legacyCreds;
  }

  async setSessionTokens(accessToken, refreshToken) {
    const payload = JSON.stringify({ version: 2, accessToken, refreshToken });
    // 1. Write primary
    await this.storage.setItemAsync(this.PRIMARY_KEY, payload);
    // 2. Verify write
    const verified = await this.storage.getItemAsync(this.PRIMARY_KEY);
    if (verified !== payload) {
      throw new Error('Durable verification of primary credentials failed.');
    }
    // 3. Purge legacy and historical keys
    const purgeTargets = [this.LEGACY_KEY, ...this.HISTORICAL_KEYS];
    await Promise.allSettled(purgeTargets.map((k) => this.storage.deleteItemAsync(k)));
    return true;
  }

  async clearCredentials() {
    const purgeTargets = [this.PRIMARY_KEY, this.LEGACY_KEY, ...this.HISTORICAL_KEYS];
    const results = await Promise.allSettled(purgeTargets.map((k) => this.storage.deleteItemAsync(k)));
    const errors = [];
    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        errors.push(`Failed to delete ${purgeTargets[idx]}: ${String(res.reason)}`);
      }
    });
    return { success: errors.length === 0, errors };
  }
}

async function runTests() {
  const mockStorage = new MockSecureStore();
  const adapter = new MobileSecureStoreAdapter(mockStorage);
  let passed = 0;

  console.log('--- RUNNING MOBILE AUTH-T01 THROUGH AUTH-T08 CONTRACT SUITE ---');

  // AUTH-T01: Fresh App Installation
  mockStorage.clear();
  const creds1 = await adapter.readCredentials();
  assert.strictEqual(creds1, null, 'AUTH-T01: Expected null credentials on fresh installation');
  assert.strictEqual(await mockStorage.getItemAsync(adapter.PRIMARY_KEY), null);
  assert.strictEqual(await mockStorage.getItemAsync(adapter.LEGACY_KEY), null);
  passed++;
  console.log('✓ AUTH-T01: Fresh App Installation passed.');

  // AUTH-T02: Fresh User Sign-In
  mockStorage.clear();
  const signedIn = await adapter.setSessionTokens('tok_aru_123', 'ref_aru_123');
  assert.strictEqual(signedIn, true);
  const primaryRaw2 = await mockStorage.getItemAsync(adapter.PRIMARY_KEY);
  assert.ok(primaryRaw2, 'Primary key must be set');
  const parsed2 = JSON.parse(primaryRaw2);
  assert.strictEqual(parsed2.accessToken, 'tok_aru_123');
  assert.strictEqual(parsed2.refreshToken, 'ref_aru_123');
  assert.strictEqual(await mockStorage.getItemAsync(adapter.LEGACY_KEY), null, 'Legacy key must remain unset');
  passed++;
  console.log('✓ AUTH-T02: Fresh User Sign-In passed.');

  // AUTH-T03: Legacy User Upgrade Migration
  mockStorage.clear();
  await mockStorage.setItemAsync(
    adapter.LEGACY_KEY,
    JSON.stringify({ version: 2, accessToken: 'tok_wiez_legacy', refreshToken: 'ref_wiez_legacy' }),
  );
  const migrated = await adapter.readCredentials();
  assert.ok(migrated, 'Must return migrated credentials');
  assert.strictEqual(migrated.accessToken, 'tok_wiez_legacy');
  assert.strictEqual(migrated.refreshToken, 'ref_wiez_legacy');
  const primaryRaw3 = await mockStorage.getItemAsync(adapter.PRIMARY_KEY);
  assert.ok(primaryRaw3, 'Primary key must now exist');
  assert.strictEqual(JSON.parse(primaryRaw3).accessToken, 'tok_wiez_legacy');
  assert.strictEqual(await mockStorage.getItemAsync(adapter.LEGACY_KEY), null, 'Legacy key must be purged');
  passed++;
  console.log('✓ AUTH-T03: Legacy User Upgrade Migration passed.');

  // AUTH-T04: Token Refresh & Rotation
  mockStorage.clear();
  await adapter.setSessionTokens('tok_aru_old', 'ref_aru_old');
  await adapter.setSessionTokens('tok_aru_new', 'ref_aru_new');
  const primaryRaw4 = await mockStorage.getItemAsync(adapter.PRIMARY_KEY);
  const parsed4 = JSON.parse(primaryRaw4);
  assert.strictEqual(parsed4.accessToken, 'tok_aru_new');
  assert.strictEqual(parsed4.refreshToken, 'ref_aru_new');
  assert.strictEqual(await mockStorage.getItemAsync(adapter.LEGACY_KEY), null);
  passed++;
  console.log('✓ AUTH-T04: Token Refresh & Rotation passed.');

  // AUTH-T05: Explicit User Logout
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.PRIMARY_KEY, JSON.stringify({ version: 2, accessToken: 'tokA', refreshToken: 'refA' }));
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 2, accessToken: 'tokW', refreshToken: 'refW' }));
  const logoutRes = await adapter.clearCredentials();
  assert.strictEqual(logoutRes.success, true);
  assert.strictEqual(await mockStorage.getItemAsync(adapter.PRIMARY_KEY), null);
  assert.strictEqual(await mockStorage.getItemAsync(adapter.LEGACY_KEY), null);
  passed++;
  console.log('✓ AUTH-T05: Explicit User Logout passed.');

  // AUTH-T06: Durable Write Interruption Simulation
  mockStorage.clear();
  await mockStorage.setItemAsync(
    adapter.LEGACY_KEY,
    JSON.stringify({ version: 2, accessToken: 'tok_wiez_critical', refreshToken: 'ref_wiez_critical' }),
  );
  mockStorage.failNextWrite = true;
  const fallbackCreds = await adapter.readCredentials();
  assert.ok(fallbackCreds, 'Must return legacy credentials even when primary write fails');
  assert.strictEqual(fallbackCreds.accessToken, 'tok_wiez_critical');
  const retainedLegacy = await mockStorage.getItemAsync(adapter.LEGACY_KEY);
  assert.ok(retainedLegacy, 'Legacy key must be preserved when primary write fails');
  passed++;
  console.log('✓ AUTH-T06: Durable Write Interruption Simulation passed.');

  // AUTH-T07: Legacy Deletion Failure Handling
  mockStorage.clear();
  await mockStorage.setItemAsync(
    adapter.LEGACY_KEY,
    JSON.stringify({ version: 2, accessToken: 'tok_wiez_del_fail', refreshToken: 'ref_wiez_del_fail' }),
  );
  mockStorage.failNextDelete = true;
  const creds7 = await adapter.readCredentials();
  assert.ok(creds7, 'Must return credentials even when legacy deletion fails');
  assert.strictEqual(creds7.accessToken, 'tok_wiez_del_fail');
  const primaryRaw7 = await mockStorage.getItemAsync(adapter.PRIMARY_KEY);
  assert.ok(primaryRaw7, 'Primary write succeeded');
  const creds7Next = await adapter.readCredentials();
  assert.strictEqual(creds7Next.accessToken, 'tok_wiez_del_fail');
  passed++;
  console.log('✓ AUTH-T07: Legacy Deletion Failure Handling passed.');

  // AUTH-T08: Emergency Binary Downgrade Simulation
  mockStorage.clear();
  await adapter.setSessionTokens('tok_aru_cutover', 'ref_aru_cutover');
  assert.strictEqual(await mockStorage.getItemAsync(adapter.LEGACY_KEY), null);
  const oldBinaryRead = await mockStorage.getItemAsync(adapter.LEGACY_KEY);
  assert.strictEqual(oldBinaryRead, null, 'Old binary sees null and requires fresh login');
  passed++;
  console.log('✓ AUTH-T08: Emergency Binary Downgrade Simulation passed.');

  console.log('\n--- EXTENDED PRECEDENCE & SECURITY DURABILITY SCENARIOS (SECTION 4) ---');

  // Scenario A: Dual-key precedence with matching credentials
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.PRIMARY_KEY, JSON.stringify({ version: 2, accessToken: 'tok_match', refreshToken: 'ref_match' }));
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 2, accessToken: 'tok_match', refreshToken: 'ref_match' }));
  const credsMatch = await adapter.readCredentials();
  assert.strictEqual(credsMatch.accessToken, 'tok_match');
  passed++;
  console.log('✓ Extended Scenario A: Dual-key matching precedence passed.');

  // Scenario B: Dual-key precedence with conflicting credentials (ARU takes precedence)
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.PRIMARY_KEY, JSON.stringify({ version: 2, accessToken: 'tok_aru_active', refreshToken: 'ref_aru_active' }));
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 2, accessToken: 'tok_wiez_stale', refreshToken: 'ref_wiez_stale' }));
  const credsConflict = await adapter.readCredentials();
  assert.strictEqual(credsConflict.accessToken, 'tok_aru_active');
  passed++;
  console.log('✓ Extended Scenario B: Conflicting credentials ARU precedence passed.');

  // Scenario C: Dual-key with corrupted ARU primary drops corrupt primary and recovers legacy
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.PRIMARY_KEY, '{corrupted-non-json');
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 2, accessToken: 'tok_wiez_recovered', refreshToken: 'ref_wiez_recovered' }));
  const credsCorruptPrimary = await adapter.readCredentials();
  assert.ok(credsCorruptPrimary);
  assert.strictEqual(credsCorruptPrimary.accessToken, 'tok_wiez_recovered');
  passed++;
  console.log('✓ Extended Scenario C: Corrupted primary dropped and legacy recovered passed.');

  // Scenario D: Read-back verification mismatch prevents legacy key deletion
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 2, accessToken: 'tok_precious_legacy', refreshToken: null }));
  mockStorage.readbackMismatch = true;
  const credsMismatch = await adapter.readCredentials();
  assert.strictEqual(credsMismatch.accessToken, 'tok_precious_legacy');
  assert.ok(await mockStorage.getItemAsync(adapter.LEGACY_KEY), 'Legacy key must NOT be deleted when read-back verification fails');
  passed++;
  console.log('✓ Extended Scenario D: Read-back verification mismatch preserves legacy key passed.');

  // Scenario E: Compound credential migration integrity with malformed version
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 1, accessToken: 'v1_dead_token' }));
  const credsOldVersion = await adapter.readCredentials();
  assert.strictEqual(credsOldVersion, null, 'Outdated version 1 credential rejected without corruption');
  passed++;
  console.log('✓ Extended Scenario E: Compound credential version integrity passed.');

  // Scenario F: Confidentiality: sensitive tokens are never exposed in log output
  const sensitiveToken = 'sensitive_secret_mobile_xyz_777';
  const originalWarn = console.warn;
  let loggedOutput = '';
  console.warn = (...args) => { loggedOutput += args.join(' '); };
  mockStorage.clear();
  await mockStorage.setItemAsync(adapter.LEGACY_KEY, JSON.stringify({ version: 2, accessToken: sensitiveToken, refreshToken: null }));
  mockStorage.failNextWrite = true;
  await adapter.readCredentials();
  console.warn = originalWarn;
  assert.ok(!loggedOutput.includes(sensitiveToken), 'Sensitive token must NEVER appear in diagnostic logs');
  passed++;
  console.log('✓ Extended Scenario F: Credential confidentiality in logs passed.');

  console.log(`\nALL ${passed} MOBILE AUTH CONTRACT & EXTENDED TESTS PASSED CLEANLY.`);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
