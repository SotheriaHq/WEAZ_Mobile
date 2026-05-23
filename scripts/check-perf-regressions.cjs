const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const failures = [];

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const fail = (message) => failures.push(message);

const assertIncludes = (relativePath, needle, message) => {
  const content = read(relativePath);
  if (!content.includes(needle)) fail(`${relativePath}: ${message}`);
};

const assertNotMatches = (relativePath, pattern, message) => {
  const content = read(relativePath);
  if (pattern.test(content)) fail(`${relativePath}: ${message}`);
};

const assertOrder = (relativePath, firstNeedle, secondNeedle, message) => {
  const content = read(relativePath);
  const first = content.indexOf(firstNeedle);
  const second = content.indexOf(secondNeedle);
  if (first < 0 || second < 0 || first > second) fail(`${relativePath}: ${message}`);
};

const assertCacheBypassIsForceGuarded = (relativePath) => {
  const lines = read(relativePath).split(/\r?\n/);
  lines.forEach((line, index) => {
    const isBypass =
      line.includes('_cb') ||
      /Cache-Control['"]?\s*:\s*['"]no-store['"]/.test(line) ||
      /Pragma['"]?\s*:\s*['"]no-cache['"]/.test(line);
    if (!isBypass) return;

    const windowStart = Math.max(0, index - 10);
    const context = lines.slice(windowStart, index + 1).join('\n');
    if (!/forceRefresh|opts\?\.forceRefresh|args\?\.forceRefresh/.test(context)) {
      fail(`${relativePath}:${index + 1}: cache bypass must be guarded by explicit forceRefresh`);
    }
  });
};

assertIncludes('src/query/queryClient.ts', 'refetchOnMount: false', 'query defaults must not refetch on mount');
assertIncludes('src/query/queryClient.ts', 'refetchOnWindowFocus: false', 'query defaults must not refetch on focus');
assertIncludes('src/query/queryClient.ts', 'staleTime: THREADLY_QUERY_STALE_TIME_MS', 'query defaults must keep shared staleTime');
assertIncludes('src/query/queryClient.ts', 'gcTime: THREADLY_QUERY_GC_TIME_MS', 'query defaults must keep shared gcTime');

assertNotMatches('src/query/queryKeys.ts', /Date\.now\(|Math\.random\(/, 'query keys must stay deterministic');
assertIncludes('src/query/queryKeys.ts', "scope === 'publicUrl'", 'public media URLs should remain persistable');
assertNotMatches('src/query/queryKeys.ts', /scope\s*===\s*['"]signedUrl['"]/, 'private signed URLs must not be persisted');

assertIncludes('src/query/QueryProvider.tsx', 'focusManager.setEventListener', 'AppState must use the TanStack focus bridge');
assertNotMatches('src/query/QueryProvider.tsx', /invalidateQueries\s*\(/, 'AppState bridge must not invalidate queries broadly');

assertOrder(
  'src/hooks/useResolvedImageUri.ts',
  'queryKeys.media.publicUrl(normalizedFileId)',
  'queryKeys.media.signedUrl(normalizedFileId)',
  'image resolution must try public URLs before private signed fallback',
);
assertIncludes('src/hooks/useResolvedImageUri.ts', 'resolvedUriMissingCache', 'invalid media IDs need miss caching');
assertIncludes('src/hooks/useResolvedImageUri.ts', 'pendingResolutions', 'media resolution needs in-flight dedupe');

assertOrder(
  'src/api/BrandApi.ts',
  'const publicUrl = await this.getPublicFileUrl(fileId, context)',
  'return this.getPrivateSignedFileUrl(fileId, context)',
  'brand media helper must remain public-first before signing',
);
assertCacheBypassIsForceGuarded('src/api/BrandApi.ts');
assertCacheBypassIsForceGuarded('src/api/DesignApi.ts');

assertIncludes('src/features/feed/api/feedApi.ts', "import AsyncStorage from '@react-native-async-storage/async-storage'", 'feed persisted cache must use non-secret storage');
assertNotMatches('src/features/feed/api/feedApi.ts', /expo-secure-store/, 'feed snapshots must not use SecureStore size-limited secret storage');
assertIncludes('src/features/feed/api/feedApi.ts', 'readCachedMarketFeed', 'feed cache read path must remain present');
assertIncludes('src/features/feed/api/feedApi.ts', 'FEED_CACHE_TTL_MS', 'feed cache TTL guard must remain present');

assertIncludes('src/hooks/useResolvedImageUri.ts', 'allowSignedFallback', 'media resolver must expose signed fallback control');
assertIncludes('src/features/feed/components/FeedImage.tsx', 'allowSignedFallback: false', 'public feed images must not fall back to signed URLs');
assertIncludes('src/features/feed/media/mediaUrlResolver.ts', 'allowSignedFallback: false', 'feed media resolver must keep public-first/no-signed policy');
assertIncludes('src/features/feed/media/mediaCache.ts', 'isUsableImageHttpUrl', 'feed prefetch must require stable direct public URLs');
assertIncludes('src/features/feed/components/FeedMediaCarousel.tsx', 'allowSignedFallback: false', 'feed carousel prefetch must not sign public media');
assertIncludes('src/features/feed/components/MarketFeedScreen.tsx', 'lastSavedCheckKeyRef', 'feed saved status checks must dedupe stable item ID sets');
assertIncludes('src/features/feed/utils/feedDiagnostics.ts', 'EXPO_PUBLIC_DEBUG_FEED', 'feed diagnostics must be opt-in');
assertIncludes('src/features/feed/utils/feedDiagnostics.ts', 'EXPO_PUBLIC_DEBUG_MEDIA', 'media diagnostics must be opt-in');
assertIncludes('src/features/feed/utils/feedDiagnostics.ts', 'EXPO_PUBLIC_DEBUG_NETWORK', 'API diagnostics must be opt-in');

if (failures.length > 0) {
  console.error('Performance regression guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Performance regression guard passed.');
