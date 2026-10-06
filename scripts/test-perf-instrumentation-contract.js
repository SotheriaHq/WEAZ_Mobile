/**
 * The instrumentation has to be trustworthy before its numbers mean anything.
 *
 * Every check here corresponds to a way a timing instrument can lie, and most
 * of them correspond to a way this one already did:
 *
 *   - measuring with a wall clock, so an NTP step silently shifts a delta
 *   - logging with `console.log`, which a release bundle strips, so the build
 *     that matters reports nothing
 *   - latching a start timestamp, so later flows are measured from an older tap
 *   - mapping "the shell painted" to "content appeared", which would make every
 *     screen look fast and hide the entire problem
 *   - leaving the API stages dev-only, so the two most important stages are
 *     missing from the preview build under test
 *
 * These are static source assertions, not a runtime harness. The numbers must
 * come from a device; what this protects is the instrument that produces them.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

let checks = 0;
const failures = [];

function check(label, condition) {
  checks += 1;
  if (!condition) failures.push(label);
}

// ---------------------------------------------------------------- clock

const wiezPerf = read('src/perf/wiezPerf.ts');

check(
  'wiezPerf prefers performance.now() over Date.now()',
  /\}\)\.performance;/.test(wiezPerf) &&
    /typeof perf\.now === 'function'/.test(wiezPerf) &&
    /return \(\) => perf\.now!\(\)/.test(wiezPerf),
);
check(
  'wiezPerf keeps a Date.now fallback for non-RN runtimes',
  /return \(\) => Date\.now\(\)/.test(wiezPerf),
);
check(
  'wiezPerf never computes a stage offset from Date.now()',
  !/Date\.now\(\) - /.test(wiezPerf),
);

// ------------------------------------------------- release-build visibility

check(
  'wiezPerf emits on console.warn outside __DEV__ so release bundles report',
  /if \(__DEV__\) console\.log\(line\);\s*\n\s*else console\.warn\(line\);/.test(wiezPerf),
);

const babelConfig = read('babel.config.js');
check(
  'babel strips console.log in production but keeps warn/error',
  /transform-remove-console/.test(babelConfig) &&
    /exclude: \['error', 'warn'\]/.test(babelConfig),
);

const easJson = JSON.parse(read('eas.json'));
check(
  'the EAS preview profile bundles the instrumentation flag',
  easJson.build.preview.env.EXPO_PUBLIC_DEBUG_NAV === '1',
);
check(
  'the EAS production profile does NOT bundle the instrumentation flag',
  !easJson.build.production.env ||
    easJson.build.production.env.EXPO_PUBLIC_DEBUG_NAV === undefined,
);

// ------------------------------------------------------- stage completeness

for (const [stage, tNumber] of Object.entries({
  tap: 'T0',
  navigation_initiated: 'T1',
  transition_begin: 'T2',
  screen_mount: 'T3',
  first_meaningful_render: 'T4',
  cache_lookup_begin: 'T5',
  cache_result: 'T6',
  request_begin: 'T7',
  response_available: 'T8',
  data_usable: 'T9',
  skeleton_removed: 'T10',
})) {
  check(
    `stage ${stage} is declared as ${tNumber}`,
    new RegExp(`${stage}: '${tNumber}'`).test(wiezPerf),
  );
}

// ------------------------------------------------------- the four intervals

for (const interval of ['T0->T1', 'T1->T3', 'T3->T4', 'T4->T10', 'T0->T4']) {
  check(`summary reports ${interval}`, wiezPerf.includes(`${interval}=`));
}
check(
  'a stage that never fired reports n/a rather than a fabricated number',
  /return value === null \? 'n\/a'/.test(wiezPerf),
);

// --------------------------------------------------------- flow correctness

check(
  'a new flow always restarts its own clock',
  /export function perfBeginFlow\(label: string\): void \{[\s\S]*?startedAt: now\(\)/.test(
    wiezPerf,
  ),
);
check(
  'an unfinished flow is closed as abandoned rather than left open',
  /closeFlow\(activeFlow, 'abandoned'\)/.test(wiezPerf),
);
check(
  'a flow that never completes still publishes a partial summary',
  /FLOW_WATCHDOG_MS/.test(wiezPerf) && /closeFlow\(flow, 'timeout'\)/.test(wiezPerf),
);

const navPerf = read('src/utils/navPerf.ts');
check(
  'navPerf no longer latches a stale tap timestamp across flows',
  !/if \(!activeFlow\) \{\s*\n\s*activeFlow = flow;/.test(navPerf),
);
check(
  'navPerf restarts its clock when the flow changes or the last one ended',
  /if \(activeFlow !== flow \|\| flowEnded\) \{/.test(navPerf),
);
check(
  'dataReady no longer zeroes the clock and untimes every later stage',
  !/emit\('data_ready', f\);\s*\n\s*activeFlow = null;\s*\n\s*tapAt = 0;/.test(navPerf),
);
check(
  'navPerf forwards every stage into the T-timeline from one place',
  /bridgeNavPerfStage\(stage, flow\)/.test(navPerf),
);
check(
  'navPerf no longer logs unconditionally at module load',
  !/^console\.log\('\[NAV_PERF DEBUG\]/m.test(navPerf),
);

// ------------------------------------------------------------ honest mapping

const bridge = read('src/perf/navPerfBridge.ts');
check(
  'shell_visible is NOT mapped to first_meaningful_render',
  !/shell_visible: 'first_meaningful_render'/.test(bridge),
);
check(
  'first_visible_ui is NOT mapped to first_meaningful_render',
  !/first_visible_ui: 'first_meaningful_render'/.test(bridge),
);
check(
  'a painted cached snapshot IS mapped to first_meaningful_render',
  /stale_ui_rendered: 'first_meaningful_render'/.test(bridge),
);
check('the bridge cannot throw into the app', /\} catch \{/.test(bridge));

// ----------------------------------------------------------------- API stages

const networkTrace = read('src/api/networkTrace.ts');
check(
  'T7 is recorded regardless of the dev-only trace flag',
  /if \(perfEnabled\(\)\) \{[\s\S]*?perfMark\('request_begin'/.test(networkTrace),
);
check(
  'T8 is recorded regardless of the dev-only trace flag',
  /perfMark\('response_available'/.test(networkTrace),
);
check(
  'T7/T8 run BEFORE the isTraceEnabled early return',
  networkTrace.indexOf("perfMark('request_begin'") <
    networkTrace.indexOf('if (!isTraceEnabled) return config;'),
);
check(
  'the perf path does not stringify response bodies',
  !/estimateResponseSize[\s\S]{0,200}perfMark/.test(networkTrace),
);
check(
  'T8 reports a real round trip from a monotonic start stamp',
  /__wiezPerfStartedAt/.test(networkTrace) && /rttMs=/.test(networkTrace),
);

const httpClient = read('src/api/httpClient.ts');
check(
  'the pre-transport auth gate is measured separately from the request',
  /auth_hydration_wait/.test(httpClient),
);
check(
  'the auth gate is timed around the await, not after it',
  httpClient.indexOf('const gateStartedAt') <
    httpClient.indexOf('await waitForAuthHydration'),
);

// ----------------------------------------------------------- cache stages

const cachedQuery = read('src/cache/cachedQuery.ts');
check(
  'the query cache lookup reports both T5 and T6',
  /perfMark\('cache_lookup_begin'/.test(cachedQuery) &&
    /perfMark\('cache_result'/.test(cachedQuery),
);
check(
  'the cache verdict reaches the flow summary',
  /query_cache_miss/.test(cachedQuery) && /query_cache_hit/.test(cachedQuery),
);

const restoreProbe = read('src/perf/CacheRestoreProbe.tsx');
check('the persisted-cache restore window is measured', /useIsRestoring/.test(restoreProbe));
check(
  'the restore probe distinguishes "already restored" from a measured window',
  /alreadyRestoredBeforeFirstRender/.test(restoreProbe),
);

const queryProvider = read('src/query/QueryProvider.tsx');
check(
  'the restore probe is mounted inside PersistQueryClientProvider',
  queryProvider.indexOf('<PersistQueryClientProvider') <
    queryProvider.indexOf('<CacheRestoreProbe />'),
);

// ------------------------------------------------- thread-contention evidence

const threadMonitor = read('src/perf/jsThreadMonitor.ts');
check(
  'JS-thread stalls are sampled so late requests can be attributed',
  /setInterval/.test(threadMonitor) && /js_thread_blocked/.test(threadMonitor),
);
check(
  'a stall annotates the flow it happened during',
  /perfAnnotate\('js_thread_blocked'\)/.test(threadMonitor),
);
check(
  'the monitor is inert without the debug flag',
  /if \(!perfEnabled\(\)/.test(threadMonitor),
);

const rootLayout = read('app/_layout.tsx');
check('the thread monitor starts at boot', /startJsThreadMonitor\(\)/.test(rootLayout));

// ------------------------------------------------------- screen-level stages

const stageHooks = read('src/perf/usePerfStages.ts');
check(
  'T10 comes from a real loading flag, and a cache-hit open is labelled',
  /never_shown/.test(stageHooks) && /perfAnnotate\('no_skeleton'\)/.test(stageHooks),
);

for (const [file, label] of [
  ['app/(tabs)/me.tsx', 'me'],
  ['app/profile/[id].tsx', 'profile detail'],
  ['src/features/market/components/MarketScreen.tsx', 'market'],
  ['src/features/feed/components/RunwayFeedScreen.tsx', 'runway'],
]) {
  check(`${label} reports T10`, /useSkeletonTiming\(/.test(read(file)));
}
for (const [file, label] of [
  ['app/(tabs)/me.tsx', 'me'],
  ['app/profile/[id].tsx', 'profile detail'],
]) {
  check(`${label} reports T4 from real content`, /useFirstMeaningfulRender\(/.test(read(file)));
}

// ------------------------------- first-capture gaps (2026-10-06 device run)

check(
  'the summary carries accumulated thread-stall time, not just a boolean',
  /blockedMs=/.test(wiezPerf) && /perfAddBlockedMs/.test(wiezPerf),
);
check(
  'a stall adds its duration to the flow it happened during',
  /perfAddBlockedMs\(drift\)/.test(threadMonitor),
);
check(
  'the summary distinguishes "already mounted" from "never arrived"',
  /mounted=\$\{flow\.stages\.has\('screen_mount'\)/.test(wiezPerf),
);
check(
  'a kept-alive tab can still report T3 on focus',
  /useFocusEffect/.test(stageHooks) && /export function useScreenArrival/.test(stageHooks),
);
check(
  'focus-based arrival reuses screen_mount so a cold mount still wins',
  /perfMark\('screen_mount', \{ detail: `\$\{label\}:focus`/.test(stageHooks),
);
for (const [file, label] of [
  ['app/(tabs)/me.tsx', 'me'],
  ['app/profile/[id].tsx', 'profile detail'],
  ['src/features/market/components/MarketScreen.tsx', 'market'],
  ['src/features/feed/components/RunwayFeedScreen.tsx', 'runway'],
]) {
  check(`${label} reports arrival on revisit`, /useScreenArrival\(/.test(read(file)));
}

// ------------------------------- island press -> active pill (2026-10-06 bug)

const island = read('components/navigation/NativeIslandBottomNav.tsx');

check(
  'the summary reports press -> active pill latency',
  /indicatorMs=/.test(wiezPerf) && /perfRecordIndicatorVisible/.test(wiezPerf),
);
check(
  'the pill timestamp is first-write-wins',
  /if \(activeFlow\.indicatorAt !== null\) return;/.test(wiezPerf),
);
check(
  'the bridge routes active_indicator_visible into that field',
  /stage === 'active_indicator_visible'/.test(bridge) &&
    /perfRecordIndicatorVisible\(\)/.test(bridge),
);
check(
  'the fixed dock does not batch the pill into the navigation commit',
  /React\.startTransition\(\(\) => commitSelection\(item\)\)/.test(island),
);
check(
  'the fixed dock still paints the pill urgently, outside the transition',
  /paintCandidate\(item\);[\s\S]{0,1400}?React\.startTransition\(\(\) => commitSelection\(item\)\)/.test(
    island,
  ),
);
check(
  'the scrolling dock highlights on touch-down instead of after the slop timer',
  /paintCandidate\(item\);\s*\n\s*const timer = setTimeout\(\(\) => \{\s*\n\s*commitScrollDockTap\(item\);\s*\n\s*\}, SCROLL_DOCK_COMMIT_DELAY_MS\);/.test(
    island,
  ),
);
check(
  'the slop timer still gates the ROUTE, not just the highlight',
  /SCROLL_DOCK_COMMIT_DELAY_MS\)/.test(island) &&
    /commitScrollDockTap\(item\);/.test(island),
);
check(
  'a highlight taken back by a scroll is recorded',
  /optimistic_active_cancelled/.test(island),
);

// ------------------------------------------------------ the known waterfall

const warmup = read('src/profile/shopperProfileWarmup.ts');
check(
  'the six-request profile fan-out is bounded by marks',
  /profile_fanout_began/.test(warmup) && /profile_fanout_settled/.test(warmup),
);
check(
  'the fan-out names its slowest request, not just its total',
  /slowest=/.test(warmup) && /getMe=/.test(warmup),
);

const persistentCache = read('src/state/persistentScreenCache.ts');
check(
  'the boot warm-cache prime is bounded by marks',
  /warm_cache_prime_began/.test(persistentCache) &&
    /warm_cache_prime_finished/.test(persistentCache),
);

// ---------------------------------------------------------------- capture

const capture = read('scripts/capture-device-logs.js');
check('the log capture can filter the T-timeline', /--perf/.test(capture));
check('the log capture can filter to flow summaries only', /--summary/.test(capture));
check(
  '--nav still captures both instruments',
  /includes\('\[NAV_PERF\]'\) \|\| line\.includes\('\[WIEZ-PERF\]'\)/.test(capture),
);

// ----------------------------------------------------------------- report

if (failures.length > 0) {
  console.error(`Perf instrumentation contract FAILED (${failures.length}/${checks}):`);
  failures.forEach((label) => console.error(`  - ${label}`));
  process.exit(1);
}

console.log(`Perf instrumentation contract checks passed. ${checks}/${checks}`);
