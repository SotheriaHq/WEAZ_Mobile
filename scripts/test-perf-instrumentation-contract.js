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
  // Takes the unattributed figure as a second argument now. Matched on the
  // first argument only, so the assertion is about the duration reaching the
  // flow rather than about the call's exact arity.
  /perfAddBlockedMs\(drift[,)]/.test(threadMonitor),
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
  'the pill is driven by a UI-thread shared value, not a React commit',
  /useSharedValue<string \| null>\(null\)/.test(island) &&
    /useAnimatedStyle\(\(\) => \{/.test(island) &&
    /const pressed = pressedKey\.value/.test(island) &&
    !/pressedKey\?\.value/.test(island),
);
// Ordering, not adjacency. The invariant is that the shared value is written
// before anything that needs a React commit — not that the two lines touch.
// Arming the bounded reset between them is allowed and does not weaken it.
const paintCandidateBody = (() => {
  const start = island.indexOf('const paintCandidate');
  if (start < 0) return '';
  const end = island.indexOf('}, [pressedKey]);', start);
  return end < 0 ? '' : island.slice(start, end);
})();
/*
  Named-setter-free on purpose.

  This check used to assert the ordering against `setPressedItemKey` by name,
  and broke the moment that state was removed for being write-only — failing
  on a change that strictly improved the thing it was protecting. The invariant
  was never about that one setter: it is that the shared value is written
  before ANY React state in the press path, because a React write cannot paint
  without a commit and the commit is what the press is waiting for. Asserting
  it against whichever setter comes first survives renames and removals and
  still rejects a reordering.
*/
const firstReactSetterAt = (() => {
  const match = /\bset[A-Z]\w*\(/.exec(paintCandidateBody);
  return match ? match.index : -1;
})();
check(
  'the pressed key is written before any React state in the press path',
  paintCandidateBody.includes('pressedKey.value = item.key;') &&
    firstReactSetterAt > -1 &&
    paintCandidateBody.indexOf('pressedKey.value = item.key;') < firstReactSetterAt,
);
/*
  The pre-handler queue probe.

  Its whole value rests on WHERE the clock is read. Taken after `paintCandidate`
  it would measure nothing, because the queueing has already been paid and the
  work above it would be silently folded into the reading. So the ordering is
  pinned, not trusted: the clock read must come before the paint in both touch
  entry points.
*/
const fixedPressInBody = (() => {
  const start = island.indexOf('const handleFixedPressIn = React.useCallback(');
  if (start < 0) return '';
  const end = island.indexOf('const handleFixedPress =', start);
  return end < 0 ? '' : island.slice(start, end);
})();
const scrollPressInBody = (() => {
  const start = island.indexOf('const beginScrollDockPress = React.useCallback(');
  if (start < 0) return '';
  const end = island.indexOf('const trackScrollDockMove =', start);
  return end < 0 ? '' : island.slice(start, end);
})();
for (const [name, body] of [
  ['the fixed press path', fixedPressInBody],
  ['the scroll-dock press path', scrollPressInBody],
]) {
  const readAt = body.indexOf('perfTouchQueueMs(');
  const paintAt = body.indexOf('paintCandidate(item);');
  check(
    `${name} reads the touch clock before it paints`,
    body.length > 0 && readAt > -1 && paintAt > -1 && readAt < paintAt,
  );
  check(
    `${name} records the queue reading onto the flow`,
    /perfRecordTouchQueue\(queuedMs\)/.test(body),
  );
}
check(
  'the fixed press handler receives the gesture event it needs for the timestamp',
  // The memoized dock button reaches it through a stable handler ref; the
  // invariant is only that the gesture event is still passed through.
  (/\(event\) => handleFixedPressIn\(item, event\)/.test(island) ||
    (/\(event\) => handlersRef\.current\.pressIn\(item, event\)/.test(island) &&
      /pressIn: handleFixedPressIn/.test(island))) &&
    /handleFixedPressIn = React\.useCallback\(\s*\(item: NativeIslandNavItem, event\?: GestureResponderEvent\)/.test(
      island,
    ),
);
/*
  The offset estimator is a relative baseline, and the summary must carry the
  sample count or a reading taken off a one-sample baseline looks as trustworthy
  as a settled one.
*/
check(
  'the touch-queue reading travels with its baseline sample count',
  /touchQueueMs=\$\{/.test(wiezPerf) && /baseN=\$\{touchClockSamples\}/.test(wiezPerf),
);
check(
  'the touch clock keeps the minimum offset seen, not the first or the latest',
  /if \(offset < touchClockOffset\) \{/.test(wiezPerf) &&
    /touchClockOffset = offset;/.test(wiezPerf) &&
    !/touchClockOffset = now\(\)/.test(wiezPerf),
);
check(
  'a flow with no finger touch reports the queue as n/a rather than zero',
  /touchQueueMs: null,/.test(wiezPerf) &&
    /flow\.touchQueueMs === null \? 'n\/a'/.test(wiezPerf),
);
/*
  Asserted on code shape, not on the bare identifier: the note explaining why
  the state was removed names it, and a prose mention is not a reintroduction.
*/
check(
  'the island keeps no write-only React copy of the pressed key',
  !/const \[pressedItemKey/.test(island) &&
    !/setPressedItemKey\(/.test(island) &&
    !/onPressOut=\{clearPressedItem\}/.test(island),
);
check(
  'the glyph and label brighten on the UI thread, not on React focus',
  /const glyphStyle = useAnimatedStyle\(/.test(island) &&
    /const activeLabelStyle = useAnimatedStyle\(/.test(island) &&
    /const inactiveLabelStyle = useAnimatedStyle\(/.test(island) &&
    /<Animated\.View style=\{\[styles\.tabEmojiWrap, glyphStyle\]\}>/.test(island) &&
    /style=\{inactiveLabelStyle\}/.test(island) &&
    /style=\{\[styles\.tabLabelActive, activeLabelStyle\]\}/.test(island),
);
check(
  'no focus cue is left behind on a React-driven opacity',
  !/opacity: focused \?/.test(island),
);
check(
  'the UI-thread pressed key is bounded so it cannot strand a lit chip',
  /PRESSED_KEY_MAX_MS/.test(island) &&
    /pressedKeyResetRef/.test(island) &&
    /const confirmed = items\.some\(\(item\) => item\.key === pressed && item\.active\)/.test(
      island,
    ),
);
check(
  'the pill still honours React-confirmed focus, so untapped routes light up',
  /pressed != null \? pressed === itemKey : focused/.test(island),
);
/*
  The animated element moved, and the invariant moved with it.

  This asserted the CHIP hosted the animated style. The chip is static now: its
  box must never change on focus, and making the one element whose geometry is
  fixed also the one that animates invited exactly that. The frosted fill is a
  separate, absolutely-positioned layer, so it can crossfade without any
  possibility of affecting layout. What still has to hold — and is what this
  check was always really for — is that the pill's appearance is driven by a
  shared value on the UI thread rather than by a React prop.
*/
/*
  Scoped to `pillStyle`'s own body.

  Written file-wide first, and a mutation test caught it: `glyphStyle` also
  reads `pressedKey.value` and also calls `withTiming`, so a file-wide match
  stayed green with the pill reverted to a React prop. The sibling satisfied the
  assertion on the pill's behalf.
*/
const pillStyleBody = (() => {
  const start = island.indexOf('const pillStyle = useAnimatedStyle(');
  if (start < 0) return '';
  const end = island.indexOf('const inactiveGlyphOpacity', start);
  return end < 0 ? '' : island.slice(start, end);
})();
check(
  'the pill is painted by an animated style on the UI thread',
  /<Animated\.View style=\{\[styles\.tabChipFill, pillStyle\]\}/.test(island) &&
    pillStyleBody.length > 0 &&
    // Reading the shared value, not a React prop, or the pill is back to
    // waiting for the navigation commit it was moved off.
    /const pressed = pressedKey\.value;/.test(pillStyleBody) &&
    /opacity: withTiming\(isActive \? 1 : 0, ACTIVE_TRANSITION\)/.test(pillStyleBody),
);
check(
  'the chip box itself no longer animates',
  /const chipStyle = \[styles\.tabChip, compact && styles\.tabChipCompact\];/.test(island) &&
    !/const chipStyle = \[[^\]]*pillStyle\]/.test(island),
);
check(
  'only colour changes on focus (borderWidth toggling re-clips the glyph)',
  !/borderWidth: focused/.test(island) && !/borderWidth: isActive/.test(island),
);
check(
  'the disproven React-transition indirection is gone',
  !/React\.startTransition\(/.test(island),
);
/*
  Ordering, not adjacency.

  This asserted that the paint and the slop timer were textually consecutive,
  which failed the moment a queue reading was recorded between them — a line
  that cannot affect the highlight. Adjacency was never the invariant. The
  invariant is that the highlight is painted on touch-down while only the ROUTE
  waits out the slop, and an index comparison states exactly that: a
  `paintCandidate` that had been moved inside the timer would sort after it.
*/
/*
  Highlight on touch-down, route on RELEASE.

  The dock used to commit on a 90ms timer unless the finger had moved 10px —
  and a gently started swipe has not, so swiping the Studio dock opened the
  chip the finger began on. The invariant is now: touch-down paints, nothing
  in press-in schedules a commit, and the commit is wired to `onPress`, which
  the ScrollView cancels when it takes the gesture.
*/
const scrollPaintAt = scrollPressInBody.indexOf('paintCandidate(item);');
check(
  'the scrolling dock highlights on touch-down and opens the chip only on release',
  scrollPressInBody.length > 0 &&
    scrollPaintAt > -1 &&
    !/setTimeout\(/.test(scrollPressInBody) &&
    !/commitScrollDockTap\(/.test(scrollPressInBody) &&
    /onPress=\{item\.disabled \? undefined : \(\) => commitScrollDockTap\(item\)\}/.test(island),
);
check(
  'a cancelled scroll candidate clears the UI-thread key too',
  /if \(pressedKey\.value === key\) pressedKey\.value = null;/.test(island),
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

// ------------------------------------------------- navigation truthfulness

/*
  These are not timing checks. They are here because the island's active chip
  is the only thing telling the user which account's surface they are on, and
  a device session proved it could say "me" while showing somebody else's
  catalogue in visitor mode. Each check below corresponds to one of the three
  mechanisms that produced that, so none of them can come back quietly.
*/

const brandAccess = read('src/auth/brandAccess.ts');
const catalogScreen = read('app/(tabs)/catalog/index.tsx');
const publicProfile = read('app/profile/[id].tsx');
const islandConfig = read('src/navigation/nativeIslandConfig.ts');
const tabsLayout = read('app/(tabs)/_layout.tsx');
const mobileNav = read('src/utils/mobileNavigation.ts');

check(
  'owner identity accepts every id the account is reachable by',
  /export function getSelfIdentityIds/.test(brandAccess) &&
    /export function isSelfIdentity/.test(brandAccess) &&
    /user\.activeBrandId/.test(brandAccess),
);
check(
  'the catalogue decides owner by identity set, not a single id comparison',
  /isSelfIdentity\(user, routeBrandId\)/.test(catalogScreen) &&
    !/routeBrandId === activeBrandId/.test(catalogScreen),
);
check(
  'your own id on the public profile screen redirects to your own surface',
  /isSelfIdentity\(user, profileId\)/.test(publicProfile) &&
    /<Redirect href=/.test(publicProfile),
);
check(
  'a visited catalogue or profile lights no island chip',
  /isVisitorCatalogPath/.test(islandConfig) &&
    /startsWith\('\/profile\/'\) \|\| isVisitorCatalogPath\(normalized\)\) return null/.test(
      islandConfig,
    ),
);
check(
  'the island key mapping can answer "none"',
  /export function mapPathnameToIslandKey\(pathname: string\): NativeIslandKey \| null/.test(
    islandConfig,
  ),
);
check(
  'a tab jump from a drill-down pops instead of only re-focusing the tab',
  /TAB_ROOT_PATHS/.test(tabsLayout) &&
    /popIslandTabStackToRoot\(tabName\)/.test(tabsLayout) &&
    /const atTabRoot = TAB_ROOT_PATHS\.has\(normCurrent\)/.test(tabsLayout) &&
    /if \(atTabRoot && dispatchTabNavigationAction\('JUMP_TO', tabName\)\)/.test(tabsLayout),
);
check(
  'drill-down pushes are single-flight so queued taps cannot stack screens',
  /singleFlight\?: boolean/.test(mobileNav) &&
    /navigation_ignored_in_flight/.test(mobileNav) &&
    /pushQuietUntil/.test(mobileNav) &&
    // A short cap: long enough to collapse a clump of taps released by a
    // stall, short enough that a deliberate press is never swallowed.
    /PUSH_QUIET_MAX_MS = 1_200/.test(mobileNav) &&
    /noteDrillDownSettled/.test(mobileNav) &&
    /armDrillDownQuiet\(target\)/.test(mobileNav) &&
    /\{ singleFlight: true \}/.test(mobileNav),
);

check(
  'the catalogue never uses brand IDENTITY as the owner PERMISSION',
  // `isBrandAccount` is true for any active membership regardless of role, so
  // using it as the permission hands owner controls to a VIEWER or
  // SUPPORT_AGENT. The fresh-brand gap it was reaching for is covered by the
  // narrow `isUnprovisionedBrandPrincipal` instead. brandAccess.ts states the
  // rule outright: never substitute identity for capability.
  /canManageCatalog\(user\) \|\| isUnprovisionedBrandPrincipal\(user\)/.test(catalogScreen) &&
    !/canManageCatalog\(user\) \|\| isBrandAccount\(user\)/.test(catalogScreen) &&
    /user\?\.type !== 'BRAND'/.test(brandAccess) &&
    /getActiveMemberships\(user\)\.length === 0/.test(brandAccess),
);
check(
  'the long quiet window is only given to screens that can end it',
  // A target that never reports `dataReady` cannot close its own window, so
  // capping it at 8s makes a loaded screen swallow the next press. The cap is
  // conditional on the target, and the catalogue — the most-pushed drill-down,
  // sharing its flow with the owner tab — is in the settle set.
  /const DRILL_DOWN_SETTLE_PREFIXES = \[/.test(mobileNav) &&
    /expectsSettleSignal\(target\) \? PUSH_QUIET_MAX_MS : PUSH_BURST_MS/.test(mobileNav) &&
    /armDrillDownQuiet\(target\)/.test(mobileNav) &&
    /'tabs→catalog',/.test(mobileNav),
);

const islandTabStack = read('src/navigation/islandTabStack.ts');
check(
  'a parked visitor catalogue is replaced, not only popped when it has history',
  /type: 'POP_TO'/.test(islandTabStack) &&
    /payload: \{ name: 'index', merge: false \}/.test(islandTabStack) &&
    !/type: 'POP_TO_TOP'/.test(islandTabStack),
);

const islandNav = read('components/navigation/NativeIslandBottomNav.tsx');
check(
  'the island pill reads the pressed key directly and exclusively',
  /const pressed = pressedKey\.value/.test(islandNav) &&
    /pressed != null \? pressed === itemKey : focused/.test(islandNav) &&
    !/pressedKey\?\.value/.test(islandNav) &&
    !/item\.active \|\| immediateActiveKey/.test(islandNav),
);

const runwayFeed = read('src/features/feed/components/RunwayFeedScreen.tsx');
check(
  'opening your own runway card resets to the owner catalogue',
  /isOwnCatalogueTarget\(user, normalizedBrandId, username\)/.test(runwayFeed) &&
    /popIslandTabStackToRoot\('catalog'\)/.test(runwayFeed) &&
    /topLevelNavigate\('\/catalog'/.test(runwayFeed),
);

// ------------------------------------------------- blocked-time attribution

const commitCost = read('src/perf/commitCost.ts');

/*
  `blockedMs` alone sent the 2026-10-09 reading astray, and these four checks
  are each a guard on the way it did.

  A flow that never reaches a terminal stage stays open for the full
  `FLOW_WATCHDOG_MS`, so its `blockedMs` is every stall from every source in a
  ten second window — presented, on the summary line, as though the press had
  caused it. Figures of 7-9 seconds read as per-press costs and were not. The
  fix is not a smaller window; it is naming the work, so a reader never has to
  infer the cause from a duration again.
*/
check(
  'a stall names the work inside it, not just its duration',
  /drainCommitAttribution\(drift\)/.test(threadMonitor) &&
    /by=\$\{drainCommitAttribution/.test(threadMonitor),
);

check(
  'work the ledger cannot account for is reported, not hidden',
  /unattributed=/.test(commitCost) &&
    /Math\.max\(0, observedMs - accounted\)/.test(commitCost),
);

/*
  Worst, never total. A sum over a flow window is exactly the mistake that
  produced the misleading figures above, so the summary field is a single
  commit that can be checked against a claim.
*/
check(
  'the flow summary keeps the worst single commit rather than a window total',
  /worstCommit=/.test(wiezPerf) &&
    /activeFlow\.worstCommit\.selfMs >= selfMs\) return/.test(wiezPerf) &&
    !/activeFlow\.worstCommit\.selfMs \+=/.test(wiezPerf) &&
    !/activeFlow\.worstCommit\.inclusiveMs \+=/.test(wiezPerf),
);

/*
  The press handler's duration is the only figure that can explain "I pressed
  and nothing happened": there is no gesture-handler in this project, so a
  touch is observable only from JavaScript, and expo-router forces the
  navigation render synchronous inside the handler. The T-spine cannot see it —
  T0 is recorded inside the handler.
*/
check(
  'the synchronous press handler is measured and published as handlerMs',
  /measurePressHandler\(\(\) => \{/.test(islandNav) &&
    /perfRecordHandlerMs\(elapsed\)/.test(commitCost) &&
    /handlerMs=/.test(wiezPerf),
);

check(
  'the attribution probe is inert when tracing is off',
  /if \(!perfEnabled\(\)\) return run\(\)/.test(commitCost) &&
    /startedAt\.current = perfEnabled\(\) \? now\(\) : 0/.test(commitCost),
);

/*
  Catalogue and Inbox report `screenMounted` from a `[]` effect, and
  `freezeOnBlur` with `detachInactiveScreens={false}` keeps the tab mounted —
  so after the first open, T3 could never fire again. Every `tabs→catalog` and
  `tabs→inbox` flow in the capture read `mounted=no` with `requests=0`, which
  looks exactly like a navigation that never happened. It was a missing probe.
  Those are opposite diagnoses and this is what keeps them distinguishable.
*/
check(
  'every island tab destination can report T3 on a revisit, not only a cold mount',
  /useScreenArrival\('tabs→catalog'\)/.test(read('app/(tabs)/catalog/index.tsx')) &&
    /useScreenArrival\('tabs→inbox'\)/.test(read('app/(tabs)/inbox.tsx')) &&
    /useScreenArrival\('tabs→runway'\)/.test(runwayFeed) &&
    /useScreenArrival\('tabs→market'\)/.test(
      read('src/features/market/components/MarketScreen.tsx'),
    ),
);

/*
  The tab shell holds `optimisticActiveKey` AND renders the navigator, so it is
  the prime suspect for T1->T3 and has to be measurable either way. A suspect
  that cannot be cleared gets optimised on faith.
*/
const tabLayoutSrc = read('app/(tabs)/_layout.tsx');
check(
  'the tab shell and the island are both measurable, so neither is convicted on suspicion',
  /useCommitCost\('TabShell'\)/.test(tabLayoutSrc) &&
    /useCommitCost\('Island'\)/.test(islandNav),
);

/*
  Attribution must rank on SELF time.

  The 2026-10-09 capture reported `worstCommit=TabShell` on all fifteen flows,
  which inclusive time was always going to do: an ancestor's figure is >= every
  descendant's by construction. That is a property of nesting, not a finding,
  and it cannot separate a slow shell from a shell dragging a slow child.
*/
check(
  'commit attribution ranks on self time, with inclusive kept alongside',
  /activeFlow\.worstCommit\.selfMs >= selfMs\) return/.test(wiezPerf) &&
    /self=\$\{fmt\(flow\.worstCommit\.selfMs\)\}ms/.test(wiezPerf) &&
    /incl=\$\{fmt\(flow\.worstCommit\.inclusiveMs\)\}ms/.test(wiezPerf),
);

/*
  Self time is inclusive minus the SELF times accumulated beneath it. Summing
  descendants' inclusive values instead would count a grandchild twice and
  over-subtract, which at two levels of nesting reports a parent as free.
*/
check(
  'self time subtracts descendant self totals, not descendant inclusive totals',
  /completedSelfTotal \+= self;/.test(commitCost) &&
    /const descendants = completedSelfTotal - descendantSelfAtStart\.current;/.test(
      commitCost,
    ) &&
    /Math\.max\(0, inclusive - descendants\)/.test(commitCost),
);

/*
  The feed is decomposed three ways, and the row label is the important one.

  `83c6d81` measured `Runway:self=386-624ms` on navigations whose destination
  was Market or Catalogue. Static reading could not go further: every child is
  `React.memo`, `renderItem`'s dependencies are all `useState`/`useMemo`/module
  constants, and `rowRenderVersion` is content-derived, so on paper the rows
  skip. The row label is what can disprove that.
*/
check(
  'the feed screen, its list and its rows are separately attributable',
  /useCommitCost\('Runway'\)/.test(runwayFeed) &&
    /useCommitCost\('RunwayList'\)/.test(
      read('src/features/feed/components/RunwayFeedList.tsx'),
    ) &&
    /useCommitCost\('FeedItem'\)/.test(
      read('src/features/feed/components/RunwayFeedItem.tsx'),
    ),
);

/*
  The measured fix for the feed: an unchanged re-render of the list is free.

  `636fec4` measured `commits=RunwayList=8956.5ms×27` — the list committing
  twenty-seven times in one flow at ~400ms each, which accounted for that
  flow's whole `blockedMs=8358`. `FeedItem` was absent or at ×1-2 on the same
  flows, so the rows were skipping correctly and it was the shell being
  re-rendered by its parent over and over.

  Both halves are asserted, because the memo alone is worthless: `React.memo`
  compares shallowly, so a single inline arrow or inline element among the
  list's ~40 props defeats it completely while leaving the memo plainly
  visible in the source. Those two props are named here by the shape that
  regressed, not just by the existence of a replacement.
*/
const runwayList = read('src/features/feed/components/RunwayFeedList.tsx');
check(
  'the feed list skips a re-render whose props have not changed',
  /React\.memo\(RunwayFeedListInner\)/.test(runwayList),
);
/*
  Scoped to the memoized list's own props.

  The empty-feed branch renders a plain `ScrollView` with an inline
  `RefreshControl`, which is fine — it is not memoized and only mounts when the
  feed has no items. Asserting across the whole file conflated the two.
*/
const runwayListProps = (() => {
  const start = runwayFeed.indexOf('<RunwayFeedList');
  if (start < 0) return '';
  const end = runwayFeed.indexOf('renderItem={renderFeedItem}', start);
  return end < 0 ? '' : runwayFeed.slice(start, end);
})();
check(
  'nothing inline is passed to the memoized feed list',
  runwayListProps.length > 0 &&
    /keyExtractor=\{feedKeyExtractor\}/.test(runwayListProps) &&
    /refreshControl=\{feedRefreshControl\}/.test(runwayListProps) &&
    !/=\{\(/.test(runwayListProps) &&
    !/=\{\s*</.test(runwayListProps),
);

/*
  Counts must reach the summary line.

  Every capture in this investigation has been taken with `--summary`, which
  filters out the RENDER notes where the `by=` breakdown lives. An occurrence
  count is frequently the whole finding — repeated commits of a memoized row
  mean its comparator is being defeated — so the view that is actually read has
  to carry it.
*/
check(
  'the flow summary carries per-label commit counts',
  /commits=\$\{commitBreakdown\(flow\)\}/.test(wiezPerf) &&
    /\$\{label\}=worst\$\{fmt\(entry\.worstMs\)\}ms×\$\{entry\.count\}/.test(wiezPerf) &&
    /running\.count \+= 1;/.test(wiezPerf),
);

/*
  And it reports the WORST commit per label, never a sum.

  The sum refuted itself: `RunwayList=8921.2ms×68` on a flow whose measured
  `blockedMs` was 577.6. Nine seconds of work cannot hide in a ten second
  window the drift sampler found busy for half a second. `useCommitCost` spans
  render-start to layout-effect, which under time-slicing includes work on
  other trees and yields to the event loop — so each figure is an elapsed
  span, not CPU, and adding overlapping spans gives a number with no physical
  meaning. The count is exact and the worst span is a real claim about one
  commit; only the total was fiction.
*/
check(
  'per-label commit time is the worst single span, not an accumulated total',
  /if \(selfMs > running\.worstMs\) running\.worstMs = selfMs;/.test(wiezPerf) &&
    !/running\.selfMs \+=/.test(wiezPerf),
);

/*
  The provider chain is attributable.

  `TabShell`, `Runway`, `RunwayList` and `Market` committed ×68 with identical
  counts in one ten second window. Feed-local state cannot do that — it would
  reach Runway alone — and element memoization cannot stop a CONTEXT update
  from reaching every consumer. The one dependency all of those share is
  `useScreenChrome`, so every provider above them is labelled and the next
  capture names the source instead of it being inferred a third time.
*/
check(
  'every context provider above the tab tree is attributable',
  /useCommitCost\('P:ScreenChrome'\)/.test(read('src/system/ScreenChrome.tsx')) &&
    /useCommitCost\('P:Theme'\)/.test(read('src/theme/ThemeProvider.tsx')) &&
    /useCommitCost\('P:Auth'\)/.test(read('src/auth/AuthContext.tsx')) &&
    /useCommitCost\('P:BagCount'\)/.test(
      read('src/features/bagging/BagCountContext.tsx'),
    ) &&
    /useCommitCost\('P:BagFlow'\)/.test(
      read('src/features/bagging/BagFlowProvider.tsx'),
    ) &&
    /useCommitCost\('P:Toast'\)/.test(read('src/toast/ToastContext.tsx')),
);

/*
  The widest-reaching context must not be bustable by a parent re-render.

  `ScreenChromeProvider`'s value memo listed `insets` — an object from
  `useSafeAreaInsets()`, so only as stable as that hook, on a provider that
  re-renders whenever anything above it does. A fresh reference with unchanged
  contents is enough to publish a new context value and re-render the shell,
  the island, Runway, Market, Catalogue and Inbox at once. Depending on the
  four numbers makes that impossible.
*/
check(
  'the screen-chrome context depends on inset numbers, not the insets object',
  /\[insetBottom, insetLeft, insetRight, insetTop, windowHeight, windowWidth\]/.test(
    read('src/system/ScreenChrome.tsx'),
  ) &&
    !/\[bottomSystemInset, insets, windowHeight, windowWidth\]/.test(
      read('src/system/ScreenChrome.tsx'),
    ),
);

/*
  The measured fix: the navigator subtree must not be rebuilt by a re-render of
  its parent. `TabShell` subscribes to `usePathname` and
  `useGlobalSearchParams` (which Expo Router re-runs on every url change
  anywhere) and holds `optimisticActiveKey`, which every island press sets.
  None of those change which screens the navigator has, but recreating the
  element forced React to reconcile all ten of them — and `freezeOnBlur` keeps
  every visited tab mounted, so that reached every screen the session opened.

  The dep list is the assertion that matters. A per-press or per-route value
  reappearing in it silently restores the whole cost, so those are named here
  rather than only the presence of the memo.
*/
const tabTreeDeps = (() => {
  const start = tabLayoutSrc.indexOf('const tabNavigatorTree = useMemo(');
  if (start < 0) return null;
  const end = tabLayoutSrc.indexOf('</Tabs>', start);
  if (end < 0) return null;
  const after = tabLayoutSrc.slice(end, end + 400);
  const match = after.match(/\[([^\]]*)\]/);
  return match ? match[1] : null;
})();
check(
  'the navigator subtree keeps a stable element identity across shell re-renders',
  tabTreeDeps !== null &&
    /\{tabNavigatorTree\}/.test(tabLayoutSrc) &&
    !/\bpathname\b/.test(tabTreeDeps) &&
    !/optimisticActiveKey/.test(tabTreeDeps) &&
    !/displayedActiveKey/.test(tabTreeDeps) &&
    !/islandItems/.test(tabTreeDeps) &&
    !/globalParams/.test(tabTreeDeps) &&
    !/studioRouteKeyParam/.test(tabTreeDeps),
);

// ------------------------------------------- the render loop, and its amplifier
/*
  All three of these were measured, not reasoned about. The 2026-10-12 capture
  on `93cfac7` reported, for one ten second flow window:

    causes=P:Auth:user+value+sessionValue×6, TabShell:user×3
    commits=Runway×6 TabShell×6 P:RootStack×6 P:Auth×6 P:RootBootstrap×6

  The auth user's identity changed six times, rebuilt both context values each
  time, and re-rendered every consumer plus the entire routed tree. Each of the
  three links below can close that loop on its own, so each is pinned on its
  own.
*/
const authContext = read('src/auth/AuthContext.tsx');
const catalogIndex = read('app/(tabs)/catalog/index.tsx');

/*
  Scoped to `updateUser`'s body: `setActiveBrandId` sits directly below it and
  also calls `setUser` with a spread, so a file-wide assertion would be
  satisfied by the wrong setter.
*/
const updateUserBody = (() => {
  const start = authContext.indexOf('const updateUser = useCallback(');
  if (start < 0) return '';
  const end = authContext.indexOf('const setActiveBrandId = useCallback(', start);
  return end < 0 ? '' : authContext.slice(start, end);
})();
/*
  Matched on the guard, not on the whole statement.

  These pinned `if (!changesSomething) return current;` as one line, and the
  mutation probe turned it into a block so the bailout could report itself. The
  invariant never moved — bail before the spread, and return `current` itself —
  so the assertions are rebuilt around the guard and the `return` that follows
  it, which holds for either shape.
*/
const bailoutAt = updateUserBody.indexOf('if (!changesSomething) {');
const spreadAt = updateUserBody.indexOf('const nextUser: AuthUser = { ...current };');
const bailoutReturn =
  bailoutAt > -1
    ? updateUserBody.slice(bailoutAt, updateUserBody.indexOf('}', bailoutAt) + 1)
    : '';
check(
  'a no-op patch does not replace the auth user',
  updateUserBody.length > 0 &&
    bailoutAt > -1 &&
    spreadAt > -1 &&
    // Before the spread, or the fresh object is already built and the bailout
    // is decoration.
    bailoutAt < spreadAt &&
    /Object\.is\(\(current as Record<string, unknown>\)\[key\], value\)/.test(updateUserBody),
);
check(
  'the bailout returns the EXISTING user, never a copy of it',
  // `return { ...current }` would defeat the entire point: React bails out on
  // Object.is, so a copy is still a new context value for every consumer.
  // Scoped to the guard's own body so a `return current` elsewhere in
  // `updateUser` cannot satisfy this on its behalf.
  bailoutReturn.includes('return current;') && !/return \{ \.\.\.current \}/.test(bailoutReturn),
);
check(
  'the routed tree is held stable across root re-renders',
  /const routedApp = useMemo\(\(\) => <RootStack \/>, \[\]\);/.test(rootLayout) &&
    /\{routedApp\}/.test(rootLayout) &&
    // The inline form is what forced whole-tree reconciliation on every auth
    // change; it must not come back alongside the memo.
    !/^\s*<RootStack \/>\s*$/m.test(rootLayout),
);
check(
  'the catalogue profile fetch cannot be rebuilt by the user it updates',
  // The loop needs BOTH halves: `user` out of the dependency list, and the
  // identity check reading the ref instead.
  /isSelfIdentity\(userRef\.current, data\.id\)/.test(catalogIndex) &&
    /\}, \[isOwner, profileQuery\.data, queryClient, targetBrandId, updateUser\]\);/.test(
      catalogIndex,
    ) &&
    /const userRef = useRef\(user\);/.test(catalogIndex),
);

/*
  The request tally.

  `requests=45` in one ten second window, against one to nine on every other
  flow in the same capture, is a loop — and a bare count cannot name the
  endpoint looping, which is the same gap `commitTotals` closed on the render
  side. The path is already handed to `perfMark` as its detail, so this is a
  Map write.
*/
check(
  'a request count that looks like a loop can name the endpoint',
  /requestPaths: Map<string, number>;/.test(wiezPerf) &&
    /stage === 'request_begin' && meta\?\.detail/.test(wiezPerf) &&
    /paths=\$\{pathBreakdown\(flow\)\}/.test(wiezPerf),
);
/*
  Scoped to `pathBreakdown`'s body. Written file-wide first and a mutation test
  caught it: `causeBreakdown` sorts with an identical expression, so removing
  the sort from `pathBreakdown` left the assertion green on its sibling's
  behalf. Third time this exact shape has slipped through today.
*/
const pathBreakdownBody = (() => {
  const start = wiezPerf.indexOf('function pathBreakdown(');
  if (start < 0) return '';
  const end = wiezPerf.indexOf('function causeBreakdown(', start);
  return end < 0 ? '' : wiezPerf.slice(start, end);
})();
check(
  'the request tally is bounded and ordered by frequency',
  // Unbounded, a flow hitting many distinct paths would grow this without
  // limit; unordered, the loop would not be the first thing read.
  /flow\.requestPaths\.size < 24/.test(wiezPerf) &&
    pathBreakdownBody.length > 0 &&
    /\.sort\(\(a, b\) => b\[1\] - a\[1\] \|\| a\[0\]\.localeCompare\(b\[0\]\)\)/.test(
      pathBreakdownBody,
    ),
);

/*
  Every `setUser` site reports itself.

  A capture put the auth user at 55 replacements with zero network requests, so
  the request tally could not explain it and neither could reading the code —
  three attempts to answer a question of this shape by inspection have been
  wrong. The point of labelling is completeness: ONE unlabelled site and the
  next capture blames whichever labelled site happens to fire, which is worse
  than no label at all.
*/
/*
  Per site, not a count.

  This was `labelledCount >= setUserCount`, and a mutation test walked straight
  through it: `updateUser` contributes TWO labels for one `setUser`, so the
  totals carry slack and dropping a label from any other site still satisfied
  the inequality. A count cannot express "each one of them", which is the
  actual requirement — one unlabelled site and the next capture blames
  whichever labelled site happens to fire, which is worse than no label at all.

  So each `setUser` is located and checked individually. The two functional
  forms report from inside their updater, because only the updater knows
  whether a new object was produced; the bare forms report on the line above.
*/
const setUserSites = (() => {
  const out = [];
  const re = /^([ \t]*)setUser\((null|selectedUser|\(current\))/gm;
  let m;
  while ((m = re.exec(authContext)) !== null) {
    out.push({ at: m.index, updater: m[2] === '(current)' });
  }
  return out;
})();
const unlabelledSites = setUserSites.filter(({ at, updater }) => {
  if (updater) {
    // The label lives inside the updater body, below this line. Bounded by
    // the enclosing `useCallback`'s dependency list rather than a fixed
    // window: a fixed one was tried at 1400 characters and reported
    // `updateUser` unlabelled, because its body carries a long comment and
    // the label sits 2038 characters in. A window wide enough today is a
    // window that silently narrows the next time a comment is added.
    const bodyEnd = authContext.indexOf('  }, [', at);
    const body = bodyEnd < 0 ? authContext.slice(at) : authContext.slice(at, bodyEnd);
    return !body.includes('perfRecordUserMutation(');
  }
  // The label is the statement immediately above.
  return !authContext.slice(Math.max(0, at - 90), at).includes('perfRecordUserMutation(');
});
check(
  'every setUser site in AuthContext is labelled',
  setUserSites.length >= 8 && unlabelledSites.length === 0,
);

check(
  'the updateUser bailout is distinguishable from an applied patch',
  // Without all three, a capture cannot tell "the bailout works and something
  // else is the culprit" from "the bailout never fires" — which is exactly the
  // confusion the 10-14 capture resolved, where `patched` appeared 24 times and
  // `nochange` never once.
  //
  // THREE outcomes now, not two: `nochange` is the cheap reference check,
  // `equivalent` is the structural check on the produced user, and only
  // `equivalent` can catch the normalisation-minted identities that made the
  // reference check useless. Each carries its caller as a suffix.
  /perfRecordUserMutation\('updateUser:nochange:' \+ source\)/.test(authContext) &&
    /perfRecordUserMutation\('updateUser:equivalent:' \+ source\)/.test(authContext) &&
    /perfRecordUserMutation\('updateUser:patched:' \+ source\)/.test(authContext),
);
check(
  'no setUser site is labelled unknown',
  !/perfRecordUserMutation\('unknown'\)/.test(authContext),
);
const userSetBody = (() => {
  const start = wiezPerf.indexOf('function userSetBreakdown(');
  if (start < 0) return '';
  const end = wiezPerf.indexOf('function pathBreakdown(', start);
  return end < 0 ? '' : wiezPerf.slice(start, end);
})();
check(
  'the mutation tally is bounded, ordered, and on the summary line',
  /userMutations: Map<string, number>;/.test(wiezPerf) &&
    // Bounded at SOME figure, not at one specific figure. Pinning the literal
    // 12 made this fail when the cap was legitimately raised to 24 for the
    // larger `:source` key space, which is a check obstructing a correct
    // change rather than guarding anything.
    /activeFlow\.userMutations\.size >= \d+/.test(wiezPerf) &&
    wiezPerf.includes('userSet=${userSetBreakdown(flow)}') &&
    userSetBody.length > 0 &&
    userSetBody.includes('.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))'),
);

const jsThreadMonitor = read('src/perf/jsThreadMonitor.ts');

/*
  One capture has to answer the question now, not narrow it.

  Four builds were spent narrowing this by one step each: `causes=` said the
  auth user changed, `userSet=` said `updateUser` did it, and neither could say
  which caller. Every gap cost a build and a device download. These fields close
  the ones that are left.
*/
check(
  'a stall says whether it was one long block or many short ones',
  // `blockedMs=9246` has been read five times without anyone being able to say
  // whether that was one nine second commit or ninety hundred-millisecond ones.
  // Opposite fixes: split one piece of work, or stop a loop.
  /worstBlockMs: number;/.test(wiezPerf) &&
    /if \(ms > activeFlow\.worstBlockMs\) activeFlow\.worstBlockMs = ms;/.test(wiezPerf) &&
    wiezPerf.includes('worstBlock=${fmt(flow.worstBlockMs)}ms×${flow.blockEvents}'),
);
check(
  'a stall says how much of it was NOT a React commit',
  // The last category this instrument is blind to: image decode, GC, native
  // callbacks. It was already computed for the RENDER notes and discarded,
  // because `--summary` drops those.
  /unattributedMs: number;/.test(wiezPerf) &&
    wiezPerf.includes('unattribMs=${fmt(flow.unattributedMs)}') &&
    /export function lastDrainUnattributedMs\(\): number/.test(commitCost) &&
    /lastUnattributedMs = unattributed;/.test(commitCost) &&
    /perfAddBlockedMs\(drift, lastDrainUnattributedMs\(\)\)/.test(jsThreadMonitor),
);
check(
  'a timed-out flow says where it stopped',
  // A row of `n/a` cannot distinguish a routing failure from a render that
  // never finished.
  /function furthestStage\(flow: Flow\): string/.test(wiezPerf) &&
    wiezPerf.includes('lastStage=${furthestStage(flow)}'),
);
check(
  'every updateUser call site identifies itself',
  // An untagged call reports `untagged`, which would send the next capture
  // looking in the wrong file — the exact failure mode this is here to end.
  /const updateUser = useCallback\(\(patch: Partial<AuthUser>, source = 'untagged'\)/.test(
    authContext,
  ) &&
    /perfRecordUserMutation\('updateUser:patched:' \+ source\)/.test(authContext) &&
    /perfRecordUserMutation\('updateUser:equivalent:' \+ source\)/.test(authContext),
);
check(
  'no updateUser caller outside AuthContext is left untagged',
  (() => {
    const callers = [
      'app/(auth)/verify-email.tsx',
      'app/(tabs)/catalog/edit-profile.tsx',
      'app/(tabs)/catalog/index.tsx',
      'app/(tabs)/me-edit.tsx',
      'app/(tabs)/me.tsx',
      'app/settings/account-security.tsx',
      'app/settings/sizing.tsx',
      'components/auth/AuthLinkGate.tsx',
      'components/catalog/EditBrandProfileSheet.tsx',
      'components/catalog/OwnerCatalogMediaHeader.tsx',
      'components/profile/GenderPromptSheet.tsx',
    ];
    return callers.every((file) => {
      const body = read(file);
      // Every `updateUser({...})` must close with `}, '<label>')`.
      const calls = body.split('updateUser(').length - 1;
      const tagged = (body.match(/\}, '[^']+'\)/g) || []).length;
      return calls === 0 || tagged >= 1;
    });
  })(),
);
check(
  'the auth-user comparator is a separately testable module',
  // It lives outside AuthContext so a test can execute it rather than a
  // reviewer reasoning about it. The behavioural test is
  // scripts/test-auth-user-equality.js and it is in ci:phase8.
  /from '@\/src\/auth\/authUserEquality'/.test(authContext) &&
    /isEquivalentAuthUser\(current, selectedUser\)/.test(authContext) &&
    read('package.json').includes('test:auth-user-equality'),
);

// ----------------------------------------------------------------- report

if (failures.length > 0) {
  console.error(`Perf instrumentation contract FAILED (${failures.length}/${checks}):`);
  failures.forEach((label) => console.error(`  - ${label}`));
  process.exit(1);
}

console.log(`Perf instrumentation contract checks passed. ${checks}/${checks}`);
