/** Plan Beta: prevent market detail grids changing columns as pages arrive. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.join(__dirname, '../src/features/market/components/MarketSectionDetailScreen.tsx'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '../src/api/MarketApi.ts'), 'utf8');

assert.match(api, /sourceType: MarketSectionSourceType/);
assert.match(api, /layout: MarketSectionLayout/);
assert.match(screen, /section\?\.sourceType === 'BRAND'/);
assert.match(screen, /section\?\.layout === 'BRAND_RAIL'/);
assert.doesNotMatch(screen, /items\.length > 0 && items\.every\(/, 'layout must not depend on currently loaded page');
assert.match(screen, /key=\{columnCount\}/);
assert.match(screen, /numColumns=\{columnCount\}/);
assert.match(screen, /width >= 720 \? 3 : 2/);
console.log('PASS Plan Beta market layout source contract (metadata-based columns)');
