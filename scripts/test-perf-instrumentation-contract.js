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
check(
  'the pill element can host an animated style',
  /<Animated\.View style=\{chipStyle\}>/.test(island),
);
check(
  'only colour changes on focus (borderWidth toggling re-clips the glyph)',
  !/borderWidth: focused/.test(island) && !/borderWidth: isActive/.test(island),
);
check(
  'the disproven React-transition indirection is gone',
  !/React\.startTransition\(/.test(island),
);
check(
  'the scrolling dock highlights on touch-down instead of after the slop timer',
  /paintCandidate\(item\);\s*\n\s*const timer = setTimeout\(\(\) => \{\s*\n\s*commitScrollDockTap\(item\);\s*\n\s*\}, SCROLL_DOCK_COMMIT_DELAY_MS\);/.test(
    island,
  ),
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
    /PUSH_QUIET_MAX_MS = 8_000/.test(mobileNav) &&
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
  'the flow summary carries per-label self time WITH occurrence counts',
  /commits=\$\{commitBreakdown\(flow\)\}/.test(wiezPerf) &&
    /\$\{label\}=\$\{fmt\(entry\.selfMs\)\}ms×\$\{entry\.count\}/.test(wiezPerf) &&
    /running\.count \+= 1;/.test(wiezPerf),
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

// ----------------------------------------------------------------- report

if (failures.length > 0) {
  console.error(`Perf instrumentation contract FAILED (${failures.length}/${checks}):`);
  failures.forEach((label) => console.error(`  - ${label}`));
  process.exit(1);
}

console.log(`Perf instrumentation contract checks passed. ${checks}/${checks}`);
