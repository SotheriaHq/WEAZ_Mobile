const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const suggestions = read('src/features/market/components/MobileMarketSuggestionBlocks.tsx');
const marketApi = read('src/api/MarketApi.ts');
const preferences = read('app/settings/market-preferences.tsx');

assert.match(
  marketApi,
  /export async function createMarketSuppression/,
  'Mobile market API must expose suppression creation.',
);
assert.match(
  marketApi,
  /export async function getMarketSuppressions/,
  'Mobile market API must expose suppression listing for settings restore.',
);
assert.match(
  preferences,
  /getMarketSuppressions/,
  'Mobile settings must let users review hidden market content.',
);
assert.match(
  suggestions,
  /createMarketSuppression/,
  'Mobile suggestions must call the backend suppression endpoint.',
);
assert.match(
  suggestions,
  /Not interested/,
  'Mobile suggestions must show a user-facing hide/suppress action.',
);
assert.match(
  suggestions,
  /suppressionType:\s*'NOT_INTERESTED'/,
  'Mobile suggestions must persist user intent as NOT_INTERESTED.',
);
assert.match(
  suggestions,
  /reason:\s*'mobile-suggestion-item-hidden'/,
  'Mobile suggestion suppression must include a non-sensitive reason.',
);
assert.match(
  suggestions,
  /anonymousSessionId:\s*getMarketSignalAnonymousSessionId\(\)/,
  'Guest suppression must be scoped by the anonymous market session.',
);
assert.doesNotMatch(
  suggestions,
  /createMarketSuppression\(\{[\s\S]{0,700}(accessToken|refreshToken|token|authorization|paymentReference|secret)/i,
  'Suppression payload must not include tokens, authorization headers, payment references, or secrets.',
);

console.log('Trust and safety contract passed.');
