const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const queuePath = path.join(repoRoot, 'src', 'services', 'marketSignals.ts');
const marketScreenPath = path.join(repoRoot, 'src', 'features', 'market', 'components', 'MarketScreen.tsx');
const marketApiPath = path.join(repoRoot, 'src', 'api', 'MarketApi.ts');

const queueSource = fs.readFileSync(queuePath, 'utf8');
const marketScreenSource = fs.readFileSync(marketScreenPath, 'utf8');
const marketApiSource = fs.readFileSync(marketApiPath, 'utf8');

assert.match(queueSource, /MARKET_SIGNAL_QUEUE_LIMIT\s*=\s*100/);
assert.match(queueSource, /MARKET_SIGNAL_BATCH_LIMIT\s*=\s*25/);
assert.match(queueSource, /MARKET_SIGNAL_FLUSH_INTERVAL_MS\s*=\s*5000/);
assert.match(queueSource, /AppState\.addEventListener\(\s*['"]change['"]/);
assert.match(queueSource, /nextState === ['"]background['"]/);
assert.match(queueSource, /nextState === ['"]inactive['"]/);
assert.match(queueSource, /sendMarketSignalBatch\(/);
assert.match(queueSource, /clientEventId: event\.clientEventId \?\? createClientId\(['"]market_signal_event['"]\)/);
assert.match(queueSource, /queue\.shift\(\)/);
assert.match(queueSource, /queue = \[\.\.\.batch, \.\.\.queue\]\.slice\(\s*0,\s*MARKET_SIGNAL_QUEUE_LIMIT\s*\)/);

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

console.log('Market signal queue contract checks passed.');
