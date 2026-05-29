const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const queuePath = path.join(repoRoot, 'src', 'services', 'marketSignals.ts');
const marketScreenPath = path.join(repoRoot, 'src', 'features', 'market', 'components', 'MarketScreen.tsx');
const marketApiPath = path.join(repoRoot, 'src', 'api', 'MarketApi.ts');
const sessionCleanupPath = path.join(repoRoot, 'src', 'auth', 'sessionCleanup.ts');

const queueSource = fs.readFileSync(queuePath, 'utf8');
const marketScreenSource = fs.readFileSync(marketScreenPath, 'utf8');
const marketApiSource = fs.readFileSync(marketApiPath, 'utf8');
const sessionCleanupSource = fs.readFileSync(sessionCleanupPath, 'utf8');

assert.match(queueSource, /@react-native-async-storage\/async-storage/);
assert.match(queueSource, /MARKET_SIGNAL_QUEUE_LIMIT\s*=\s*100/);
assert.match(queueSource, /MARKET_SIGNAL_BATCH_LIMIT\s*=\s*25/);
assert.match(queueSource, /MARKET_SIGNAL_FLUSH_INTERVAL_MS\s*=\s*5000/);
assert.match(queueSource, /MARKET_SIGNAL_EVENT_TTL_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
assert.match(queueSource, /MARKET_SIGNAL_MAX_RETRIES\s*=\s*5/);
assert.match(queueSource, /MARKET_SIGNAL_QUEUE_STORAGE_KEY\s*=\s*['"]threadly\.market\.signalQueue\.v1['"]/);
assert.match(queueSource, /MARKET_SIGNAL_RECENT_STORAGE_KEY\s*=\s*['"]threadly\.market\.signalRecent\.v1['"]/);
assert.match(queueSource, /MARKET_SIGNAL_IDENTITY_STORAGE_KEY\s*=\s*['"]threadly\.market\.signalIdentity\.v1['"]/);
assert.match(queueSource, /MARKET_SIGNAL_LAST_CLEARED_STORAGE_KEY\s*=/);
assert.match(queueSource, /AsyncStorage\.getItem\(MARKET_SIGNAL_QUEUE_STORAGE_KEY\)/);
assert.match(queueSource, /AsyncStorage\.multiSet\(/);
assert.match(queueSource, /entry\.queuedAt > lastClearedAt/);
assert.match(queueSource, /retryCount:\s*entry\.retryCount \+ 1/);
assert.match(queueSource, /nextAttemptAt:\s*retryAt \+ getRetryDelay\(entry\.retryCount \+ 1\)/);
assert.match(queueSource, /AppState\.addEventListener\(\s*['"]change['"]/);
assert.match(queueSource, /nextState === ['"]background['"]/);
assert.match(queueSource, /nextState === ['"]inactive['"]/);
assert.match(queueSource, /sendMarketSignalBatch\(/);
assert.match(queueSource, /clientEventId: event\.clientEventId \?\? createClientId\(['"]market_signal_event['"]\)/);
assert.match(queueSource, /queue = queue[\s\S]*\.slice\(-MARKET_SIGNAL_QUEUE_LIMIT\)/);
assert.match(queueSource, /export async function clearMobileMarketSignalQueue/);
assert.match(queueSource, /AsyncStorage\.multiRemove\(\[/);

assert.match(marketApiSource, /clientEventId\?: string \| null/);
assert.match(marketScreenSource, /startMarketSignalRuntime/);
assert.match(marketScreenSource, /trackMarketSignal/);
assert.match(marketScreenSource, /flushMarketSignals/);
assert.match(marketScreenSource, /onViewableItemsChanged=\{handleViewableRowsChanged\}/);
assert.match(marketScreenSource, /signalType: 'MARKET_SECTION_VIEW'/);
assert.match(marketScreenSource, /signalType: 'IMPRESSION'/);
assert.match(marketScreenSource, /signalType: 'OPEN'/);
assert.doesNotMatch(
  marketScreenSource,
  /follow|follower|following/i,
  'MarketScreen must not introduce user-facing follow language.',
);
assert.match(sessionCleanupSource, /clearMobileMarketSignalQueue/);
assert.match(sessionCleanupSource, /clearMobileMarketSignalQueue\(\)/);

console.log('Market signal queue contract checks passed.');
