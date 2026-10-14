/**
 * T0–T10 navigation latency timeline.
 *
 * This exists to answer one question with evidence: when a tap feels slow, is
 * the time going into getting to the screen, or into getting the screen's
 * content? Those are different defects with different fixes, and "it feels
 * slow after I tap" cannot tell them apart.
 *
 * The stage names are the brief's, so a trace can be read against it directly:
 *
 *   T0  tap                       user interaction
 *   T1  navigation_initiated      router verb invoked
 *   T2  transition_begin          router reports the new path
 *   T3  screen_mount              destination component mounted
 *   T4  first_meaningful_render   destination painted something real
 *   T5  cache_lookup_begin        a cache read started
 *   T6  cache_result              that read answered (hit or miss)
 *   T7  request_begin             first request left for this flow
 *   T8  response_available        first response arrived
 *   T9  data_usable               primary data in state
 *   T10 skeleton_removed          the loading flag went false
 *
 * Not every screen has every stage. A stage that never fires prints `n/a` in
 * the summary rather than being inferred from a neighbour — an invented number
 * is worse than a gap, because it reads as evidence.
 *
 * ## Why this is separate from `navPerf`
 *
 * `navPerf` already has marks at the right call sites and is pinned by
 * `scripts/check-perf-regressions.cjs`, so it is not worth re-plumbing forty
 * call sites to change a clock. `navPerf` forwards into this module instead, so
 * every existing mark feeds this timeline and the two cannot disagree.
 *
 * ## Clock
 *
 * `performance.now()` — monotonic, sub-millisecond, unaffected by NTP steps.
 * `navPerf` measured in `Date.now()`, which is wall-clock: a clock correction
 * mid-flow silently shifts or negates a delta. React Native 0.85 ships the Web
 * Performance API, so this needs no polyfill; the `Date.now()` fallback is for
 * the node contract tests, which import this file outside a RN runtime.
 *
 * ## Visibility in the build that matters
 *
 * A preview/release bundle strips `console.log` (babel `transform-remove-console`
 * keeps only `warn` and `error`), so a timeline logged with `console.log` is
 * invisible in exactly the build worth measuring. Lines go out on `console.warn`
 * outside `__DEV__`, which survives into logcat under `ReactNativeJS`.
 *
 * Console IO is buffered off the mark path. Writing a line costs a bridge hop,
 * and paying it inside the tap handler would put the measurement into the thing
 * being measured.
 */
import { isWiezDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';

export type PerfChannel = 'NAV' | 'SCREEN' | 'CACHE' | 'API' | 'RENDER' | 'BOOT';

/** Canonical stages, in the brief's numbering. */
export const PERF_STAGE_T = {
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
} as const;

export type PerfStage = keyof typeof PERF_STAGE_T;

const CHANNEL_BY_STAGE: Record<PerfStage, PerfChannel> = {
  tap: 'NAV',
  navigation_initiated: 'NAV',
  transition_begin: 'NAV',
  screen_mount: 'SCREEN',
  first_meaningful_render: 'RENDER',
  cache_lookup_begin: 'CACHE',
  cache_result: 'CACHE',
  request_begin: 'API',
  response_available: 'API',
  data_usable: 'SCREEN',
  skeleton_removed: 'RENDER',
};

const ENABLED = isWiezDebugEnabled('nav');

/**
 * How long a flow may stay open before its partial summary is emitted anyway.
 *
 * A flow that never reaches `skeleton_removed` is the most interesting case
 * there is — it is the bug being hunted. Waiting for a completion that never
 * comes would throw away its trace, so the watchdog publishes what it has and
 * labels it `timeout`.
 */
const FLOW_WATCHDOG_MS = 10_000;

/** A long session must not grow the ring buffer without bound. */
const MAX_BUFFERED_LINES = 600;

/** Monotonic milliseconds. Never wall-clock — see the header. */
const now: () => number = (() => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
})();

type StageRecord = {
  /** First occurrence, ms since flow start. */
  firstAt: number;
  /** Most recent occurrence, ms since flow start. */
  lastAt: number;
  count: number;
};

type Flow = {
  id: number;
  label: string;
  startedAt: number;
  stages: Map<string, StageRecord>;
  /** Free-form notes that belong in the summary (cache hit/miss, urls, counts). */
  notes: string[];
  /**
   * Total JS-thread stall observed during this flow.
   *
   * The first capture annotated flows with a bare `js_thread_blocked` boolean,
   * which showed up on 25 of 27 flows and so distinguished nothing. The
   * durations existed, but only in the RENDER note lines — which the
   * `--summary` filter drops, so the one number that would have ranked the
   * stalls was invisible in the view a tester actually reads. It belongs here.
   */
  blockedMs: number;
  /**
   * When the island's active pill actually committed to screen, since T0.
   *
   * Not one of the eleven stages, but it is the thing a user judges a tap by:
   * the pill is the app's acknowledgement that the press registered at all. It
   * was already marked (`active_indicator_visible`) and already only in a note
   * line, which the `--summary` filter drops — so the most visible latency in
   * the app was the one number absent from the view a tester reads.
   */
  indicatorAt: number | null;
  /**
   * The most expensive single labelled commit observed during this flow.
   *
   * `blockedMs` says the thread was unavailable; this says what was on it.
   * Without the pair, a stall ranks but does not attribute, and the two fixes
   * it points at are opposite — see the header of `commitCost.ts`.
   */
  worstCommit: { label: string; selfMs: number; inclusiveMs: number } | null;
  /**
   * Self time per label for this flow, with occurrence counts.
   *
   * `worstCommit` names one commit; this names the shape of the whole flow,
   * and the COUNT is often the finding rather than the duration — eight
   * `FeedItem` commits on a navigation away from the feed says the row
   * memoization is being defeated, which no single worst-commit figure can
   * show. It lives on the summary line because that is the view actually being
   * read: the `by=` breakdown in the RENDER notes carries the same information
   * and has been filtered out of every capture so far by `--summary`.
   */
  commitTotals: Map<string, { worstMs: number; count: number }>;
  /**
   * The longest synchronous block measured inside a press handler.
   *
   * Separate from `worstCommit` because it is not a commit: it is the whole
   * handler turn, navigation dispatch included. It is the stall the NEXT press
   * queues behind, and it is the only number in this instrument that can
   * explain "I pressed and nothing happened for a second" — the T-spine starts
   * at T0, which is recorded inside the handler and therefore after the
   * queueing delay has already been paid.
   */
  handlerMs: number;
  /**
   * How long the touch waited between the OS dispatching it and JS running the
   * handler. The worst of the flow, as `handlerMs` is.
   *
   * This is the one window the T0-T10 spine was built blind to, and the
   * arithmetic says it is where the complaint lives: from handler entry to the
   * pill painting measures ~2ms end to end (`handlerMs` 0.4-1.7, `T0->T1`
   * 0.1-1.3, `indicatorMs` 0.1-0.4), while a press on a Galaxy A17 visibly
   * waits hundreds of ms. Everything after the handler starts is fast, so the
   * wait is before it starts, and nothing in the instrument could see that.
   *
   * Null when no touch in the flow carried a usable native timestamp, which is
   * the honest reading for a flow that began from an accessibility activate or
   * a programmatic navigation rather than a finger.
   */
  touchQueueMs: number | null;
  /**
   * Why each labelled component rendered, counted per distinct cause.
   *
   * `commitTotals` counts renders; this names what scheduled them. The value
   * `parent` means nothing the component reads had changed, so the render was
   * forced from above — see `useRenderCause`.
   */
  renderCauses: Map<string, number>;
  /**
   * Which endpoints the flow's requests went to, counted per path.
   *
   * `requests=` has always carried the VOLUME, and the 2026-10-14 capture put
   * it at 45 in a single ten second window where every other flow managed one
   * to nine. A count that size is a loop, and the count alone cannot say which
   * endpoint is looping — the same unanswerable shape `commitTotals` was added
   * for on the render side. The path is already passed to `perfMark` as its
   * detail, so it costs a Map write to keep it.
   */
  requestPaths: Map<string, number>;
  /**
   * Which setter replaced the auth user, counted per call site.
   *
   * MEASURED, 2026-10-14 on `c959521`: one flow reported
   * `causes=P:Auth:user+value+sessionValue×55` with `requests=0 responses=0`
   * and `paths=none`. Fifty-five replacements of the auth user and not one
   * network request, which rules out the refetch loop the request tally was
   * added to find, and rules out anything that needs data to arrive.
   *
   * `AuthContext` has eight `setUser` sites. The cause field says the user
   * changed; it cannot say which of the eight did it, and the three previous
   * attempts to answer a question of that shape by reading the code were wrong.
   * So each site reports itself, and `updateUser` distinguishes a patch it
   * applied from one it bailed out of — if the bailout added in `3259c6f` is
   * firing and the user is STILL being replaced, the caller is not `updateUser`
   * and the search moves on with that settled.
   */
  userMutations: Map<string, number>;
  /**
   * The longest SINGLE stall in this flow, against `blockedMs`'s accumulation.
   *
   * `blockedMs=9246` has been read five times without anyone being able to say
   * whether that is one unbroken nine second commit or ninety separate hundred
   * millisecond ones. Those are opposite problems: the first is a single piece
   * of work to split, the second is a loop to stop. `blockEvents` gives the
   * divisor, so the two readings can finally be told apart.
   */
  worstBlockMs: number;
  /** How many drift samples crossed the threshold during this flow. */
  blockEvents: number;
  /**
   * Stall time that no instrumented React commit accounts for.
   *
   * The one remaining category of cost this whole instrument is blind to:
   * image decode, JSON parsing in a promise continuation, a native module
   * callback, garbage collection — on a 4GB device with ten tab screens kept
   * mounted, that last one is not hypothetical. A high `blockedMs` with a high
   * `unattribMs` means the render ledger is looking in the wrong place
   * entirely, and no amount of memoisation would help.
   */
  unattributedMs: number;
  closed: boolean;
  watchdog: ReturnType<typeof setTimeout> | null;
};

let flowSequence = 0;
let activeFlow: Flow | null = null;

let pendingLines: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function ringBuffer(): string[] | null {
  const g = globalThis as { __WIEZ_PERF_LOGS?: string[] };
  return Array.isArray(g.__WIEZ_PERF_LOGS) ? g.__WIEZ_PERF_LOGS : null;
}

function write(line: string) {
  pendingLines.push(line);

  const buffer = ringBuffer();
  if (buffer) {
    buffer.push(line);
    if (buffer.length > MAX_BUFFERED_LINES) {
      buffer.splice(0, buffer.length - MAX_BUFFERED_LINES);
    }
  }

  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, 900);
}

function flush() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingLines.length === 0) return;

  const lines = pendingLines;
  pendingLines = [];
  for (const line of lines) {
    // `warn` is the only level that survives a release bundle. In dev it also
    // goes through LogBox, which is why dev gets the cheaper `log`.
    if (__DEV__) console.log(line);
    else console.warn(line);
  }
}

function fmt(value: number): string {
  return value.toFixed(1);
}

/** `a → b` elapsed, or null when either end never happened. */
function interval(
  flow: Flow,
  from: PerfStage,
  to: PerfStage,
  opts: { fromEnd?: 'first' | 'last'; toEnd?: 'first' | 'last' } = {},
): number | null {
  const start = flow.stages.get(from);
  const end = flow.stages.get(to);
  if (!start || !end) return null;
  const a = opts.fromEnd === 'last' ? start.lastAt : start.firstAt;
  const b = opts.toEnd === 'last' ? end.lastAt : end.firstAt;
  return b - a;
}

function intervalText(value: number | null): string {
  return value === null ? 'n/a' : `${fmt(value)}ms`;
}

/**
 * Top labels for one flow: worst single commit, and how many commits.
 *
 * Worst, NOT the sum. The sum was wrong and it said so itself — the
 * 2026-10-09 14:21 capture reported `RunwayList=8921.2ms×68` on a flow whose
 * measured `blockedMs` was 577.6. Nine seconds of work cannot hide inside a
 * ten second window that the drift sampler found busy for half a second.
 *
 * The cause is what a commit measurement actually spans. `useCommitCost` runs
 * from render-start to layout-effect, and under React's time-slicing that
 * window contains work on other trees and yields back to the event loop. Each
 * figure is an elapsed span, not CPU, so overlapping spans double-count and
 * adding them up produces a total with no physical meaning.
 *
 * A single worst span is still a real claim about one commit, and the COUNT is
 * exact — one layout effect per commit, with nothing to overlap. Those two are
 * what the capture is read for: sixty-eight commits of a list in ten seconds
 * is the finding, whatever each one cost.
 */
/**
 * The furthest stage this flow actually reached.
 *
 * A `reason=timeout` flow prints `n/a` for most of the spine, and the reader is
 * left to work out from a row of `n/a`s where it stopped. This names it
 * directly: a flow that dies at `route_call` is a routing failure, one that
 * dies at `screen_mount` is a render that never finished, and those have
 * nothing to do with each other.
 */
function furthestStage(flow: Flow): string {
  let furthest: string | null = null;
  let furthestAt = -1;
  for (const [stage, record] of flow.stages.entries()) {
    if (record.lastAt <= furthestAt) continue;
    furthestAt = record.lastAt;
    furthest = stage;
  }
  if (furthest === null) return 'none';
  return `${furthest}@${fmt(furthestAt)}ms`;
}

/**
 * Auth-user mutations, most frequent first — the call site driving the churn.
 */
function userSetBreakdown(flow: Flow, limit = 5): string {
  if (flow.userMutations.size === 0) return 'none';
  return Array.from(flow.userMutations.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([source, count]) => `${source}×${count}`)
    .join(',');
}

/**
 * Request paths, most frequent first — the endpoint driving the volume.
 */
function pathBreakdown(flow: Flow, limit = 5): string {
  if (flow.requestPaths.size === 0) return 'none';
  return Array.from(flow.requestPaths.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, count]) => `${path}×${count}`)
    .join(',');
}

/**
 * Render causes, most frequent first. Ordered by count because the question is
 * what is driving the volume, not what is unusual.
 */
function causeBreakdown(flow: Flow, limit = 6): string {
  if (flow.renderCauses.size === 0) return 'none';
  return Array.from(flow.renderCauses.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => `${key}×${count}`)
    .join(',');
}

function commitBreakdown(flow: Flow, limit = 6): string {
  if (flow.commitTotals.size === 0) return 'none';
  return Array.from(flow.commitTotals.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].worstMs - a[1].worstMs)
    .slice(0, limit)
    .map(([label, entry]) => `${label}=worst${fmt(entry.worstMs)}ms×${entry.count}`)
    .join(',');
}

function closeFlow(flow: Flow, reason: 'complete' | 'abandoned' | 'timeout') {
  if (flow.closed) return;
  flow.closed = true;
  if (flow.watchdog) {
    clearTimeout(flow.watchdog);
    flow.watchdog = null;
  }
  if (activeFlow === flow) activeFlow = null;

  const t0t4 = interval(flow, 'tap', 'first_meaningful_render');
  const parts = [
    `[WIEZ-PERF][SUMMARY] flow=${flow.label}`,
    /*
      Which build produced this line.

      The 2026-10-13 capture was read as evidence that a fix had not worked,
      and it turned out to have been taken on the build BEFORE the fix — the
      APK had been queued but never delivered. That cost a full round trip to
      establish, and it was only settled by noticing that one label's counts
      were inconsistent with the fix being present. A log that names its own
      build cannot be misattributed that way.

      `build` separates a release bundle from a debug one, which matters more
      than provenance: a debug build runs unminified with dev-only checks
      active, so its latency figures are not comparable to a release build's
      and must never be read as if they were.

      `sha` is injected at build time. `unknown` means the APK was not built by
      the workflow — a local or EAS build — which is itself worth knowing.
    */
    `build=${__DEV__ ? 'DEBUG-numbers-not-comparable' : 'release'}`,
    `sha=${process.env.EXPO_PUBLIC_BUILD_SHA || 'unknown'}`,
    `id=${flow.id}`,
    `reason=${reason}`,
    // The brief's four intervals, in its order.
    `T0->T1=${intervalText(interval(flow, 'tap', 'navigation_initiated'))}`,
    `T1->T3=${intervalText(interval(flow, 'navigation_initiated', 'screen_mount'))}`,
    `T3->T4=${intervalText(interval(flow, 'screen_mount', 'first_meaningful_render'))}`,
    `T4->T10=${intervalText(interval(flow, 'first_meaningful_render', 'skeleton_removed'))}`,
    // The headline number.
    `T0->T4=${intervalText(t0t4)}`,
    `T0->T10=${intervalText(interval(flow, 'tap', 'skeleton_removed'))}`,
    // Supporting detail, so a diagnosis does not rest on the spine alone.
    `T5->T6=${intervalText(interval(flow, 'cache_lookup_begin', 'cache_result'))}`,
    `T7->T8=${intervalText(interval(flow, 'request_begin', 'response_available'))}`,
    `apiWindow=${intervalText(
      interval(flow, 'request_begin', 'response_available', { toEnd: 'last' }),
    )}`,
    `requests=${flow.stages.get('request_begin')?.count ?? 0}`,
    `responses=${flow.stages.get('response_available')?.count ?? 0}`,
    `T9=${intervalText(flow.stages.get('data_usable')?.firstAt ?? null)}`,
    // How much of this flow the thread spent unavailable. The first capture
    // showed `apiWindow` an order of magnitude above `T7->T8` on nearly every
    // flow — nine requests spread over 6.8s with 350ms round trips — which
    // means the gaps were not network. This is the number that says so
    // directly instead of by inference.
    `blockedMs=${fmt(flow.blockedMs)}`,
    // One long stall or many short ones? Opposite fixes, and `blockedMs` alone
    // could never say which.
    `worstBlock=${fmt(flow.worstBlockMs)}ms×${flow.blockEvents}`,
    // How much of it was NOT a React commit: image decode, GC, native work.
    // High here means the render ledger is looking in the wrong place.
    `unattribMs=${fmt(flow.unattributedMs)}`,
    // The furthest stage this flow reached. Every `reason=timeout` flow so far
    // has been unreadable past `T1->T3` without this.
    `lastStage=${furthestStage(flow)}`,
    // A tab kept alive by `freezeOnBlur` does not remount, so its mount effect
    // never re-runs and T3 cannot fire from a mount. Without this field a
    // revisit's `T1->T3=n/a` is ambiguous between "already mounted" and "never
    // arrived", and those are opposite diagnoses.
    `mounted=${flow.stages.has('screen_mount') ? 'yes' : 'no'}`,
    // Press -> the active pill on screen. Reported as very obviously late.
    `indicatorMs=${flow.indicatorAt === null ? 'n/a' : fmt(flow.indicatorAt)}`,
    // What the thread was actually doing. `blockedMs` without this ranks
    // stalls; it cannot attribute them, and a flow left open by a missing
    // terminal stage reports ten seconds of unrelated work as its own.
    // `self` attributes, `incl` shows what the subtree cost in total. Printing
    // only one of them has already misled a reading of this instrument.
    `worstCommit=${
      flow.worstCommit === null
        ? 'n/a'
        : `${flow.worstCommit.label}:self=${fmt(flow.worstCommit.selfMs)}ms` +
          `/incl=${fmt(flow.worstCommit.inclusiveMs)}ms`
    }`,
    // How long the press handler itself held the thread. The next press cannot
    // be seen until this returns, so it is the queueing delay a user feels as
    // "I pressed and nothing happened".
    `handlerMs=${flow.handlerMs === 0 ? 'n/a' : fmt(flow.handlerMs)}`,
    // How long the touch waited BEFORE the handler ran. `handlerMs` is the
    // block this press causes the next one; this is the block this press paid
    // for the last one. Relative to the session's best touch — see
    // `perfTouchQueueMs` — hence the baseline sample count travelling with it.
    `touchQueueMs=${flow.touchQueueMs === null ? 'n/a' : fmt(flow.touchQueueMs)}`,
    `baseN=${touchClockSamples}`,
    // The flow's render shape, counts included. A count is frequently the
    // finding: repeated commits of a memoized row mean its comparator is being
    // defeated, and no single `worstCommit` figure can say that.
    `commits=${commitBreakdown(flow)}`,
    // What SCHEDULED those commits. `X:parent` means nothing X reads changed,
    // so the render was forced from above and the cause is one level up.
    `causes=${causeBreakdown(flow)}`,
    // WHICH endpoints, not just how many. A high `requests=` with one path
    // dominating is a refetch loop; spread evenly it is a fan-out.
    `paths=${pathBreakdown(flow)}`,
    // WHICH setter replaced the auth user. `causes=P:Auth:user` says it
    // happened; this says who did it.
    `userSet=${userSetBreakdown(flow)}`,
  ];
  if (flow.notes.length > 0) parts.push(`notes=${flow.notes.join(',')}`);

  write(parts.join(' '));
  // Publish immediately: a summary the tester is waiting to read should not sit
  // in the buffer behind a timer.
  flush();
}

/**
 * Begin a flow. Any flow still open is closed as `abandoned` first.
 *
 * The previous implementation kept one module-level `tapAt` and, on one of its
 * two entry points, only set it when no flow was active. A navigation that
 * never reached its terminal stage therefore held the clock open, and every
 * later tap was measured from that stale tap — so the numbers grew without
 * bound and the obvious reading of them ("navigation is getting slower") was
 * an artefact of the instrument. Starting a flow now always starts its clock.
 */
export function perfBeginFlow(label: string): void {
  if (!ENABLED) return;
  if (activeFlow) closeFlow(activeFlow, 'abandoned');

  const flow: Flow = {
    id: ++flowSequence,
    label,
    startedAt: now(),
    stages: new Map(),
    notes: [],
    blockedMs: 0,
    indicatorAt: null,
    worstCommit: null,
    commitTotals: new Map(),
    handlerMs: 0,
    touchQueueMs: null,
    renderCauses: new Map(),
    requestPaths: new Map(),
    userMutations: new Map(),
    worstBlockMs: 0,
    blockEvents: 0,
    unattributedMs: 0,
    closed: false,
    watchdog: null,
  };
  flow.watchdog = setTimeout(() => closeFlow(flow, 'timeout'), FLOW_WATCHDOG_MS);
  activeFlow = flow;

  perfMark('tap', { flow: label });
}

/**
 * Begin a flow unless one with this label is already open.
 *
 * The island emits a press-in mark and then a tap mark for the same gesture.
 * Both mean T0, and treating the second as a new flow would close the first as
 * abandoned and lose the tap it was measuring.
 */
export function perfBeginFlowIfNew(label: string): void {
  if (!ENABLED) return;
  if (activeFlow && !activeFlow.closed && activeFlow.label === label) return;
  perfBeginFlow(label);
}

/** Record a canonical stage against the open flow. */
export function perfMark(
  stage: PerfStage,
  meta?: { flow?: string; detail?: string },
): void {
  if (!ENABLED) return;
  const flow = activeFlow;
  if (!flow || flow.closed) return;

  // Tally the endpoint behind a request, so a request count that looks like a
  // loop can name the endpoint that is looping.
  if (stage === 'request_begin' && meta?.detail) {
    const path = meta.detail;
    const seen = flow.requestPaths.get(path);
    if (seen !== undefined) {
      flow.requestPaths.set(path, seen + 1);
    } else if (flow.requestPaths.size < 24) {
      flow.requestPaths.set(path, 1);
    }
  }

  const at = now() - flow.startedAt;
  const existing = flow.stages.get(stage);
  if (existing) {
    existing.lastAt = at;
    existing.count += 1;
  } else {
    flow.stages.set(stage, { firstAt: at, lastAt: at, count: 1 });
  }

  const channel = CHANNEL_BY_STAGE[stage];
  const detail = meta?.detail ? ` detail=${meta.detail}` : '';
  write(
    `[WIEZ-PERF][${channel}] ${PERF_STAGE_T[stage]} stage=${stage} flow=${flow.label}` +
      ` id=${flow.id} atMs=${fmt(at)} tMono=${fmt(now())}${detail}`,
  );

  if (stage === 'skeleton_removed') closeFlow(flow, 'complete');
}

/**
 * Record something that is not one of the eleven stages.
 *
 * Kept separate so the numbered spine stays exactly the brief's and cannot be
 * diluted by the dozens of app-specific breadcrumbs that already exist.
 */
export function perfNote(
  channel: PerfChannel,
  event: string,
  detail?: string,
): void {
  if (!ENABLED) return;
  const flow = activeFlow;
  const at = flow && !flow.closed ? now() - flow.startedAt : null;
  const scope = flow && !flow.closed ? ` flow=${flow.label} id=${flow.id}` : '';
  const offset = at === null ? '' : ` atMs=${fmt(at)}`;
  write(
    `[WIEZ-PERF][${channel}] event=${event}${scope}${offset}` +
      ` tMono=${fmt(now())}${detail ? ` detail=${detail}` : ''}`,
  );
}

/**
 * Record that the island's active pill has committed to screen.
 *
 * First write wins: the pill paints once per tap, and a later confirming
 * render must not overwrite the moment the user actually saw it.
 */
export function perfRecordIndicatorVisible(): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  if (activeFlow.indicatorAt !== null) return;
  activeFlow.indicatorAt = now() - activeFlow.startedAt;
}

/** Add an observed JS-thread stall to the open flow's total. */
export function perfAddBlockedMs(ms: number, unattributedMs = 0): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  activeFlow.blockedMs += ms;
  if (ms > activeFlow.worstBlockMs) activeFlow.worstBlockMs = ms;
  activeFlow.unattributedMs += unattributedMs;
  activeFlow.blockEvents += 1;
}

/**
 * Offer a labelled commit cost to the open flow; the worst one is kept.
 *
 * Worst rather than total on purpose. Totals across a flow window have already
 * misled one capture: a flow left open by a missing terminal stage accumulates
 * ten seconds of unrelated work, and a sum presents that as the press's cost.
 * A single worst commit is a claim that can be checked — some one render took
 * this long — and it is the one that cost a visible frame.
 */
export function perfRecordCommit(
  label: string,
  selfMs: number,
  inclusiveMs: number,
): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  // Ranked on SELF time. Ranking on inclusive makes the outermost measured
  // component win by construction, which is how the first capture with this
  // instrument named the tab shell on all fifteen flows without yet having
  // shown the work was the shell's own.
  const running = activeFlow.commitTotals.get(label);
  if (running) {
    // Worst, not accumulated — see `commitBreakdown`. Summing elapsed spans
    // that overlap produced a figure fifteen times the measured stall.
    if (selfMs > running.worstMs) running.worstMs = selfMs;
    running.count += 1;
  } else {
    activeFlow.commitTotals.set(label, { worstMs: selfMs, count: 1 });
  }

  if (activeFlow.worstCommit !== null && activeFlow.worstCommit.selfMs >= selfMs) return;
  activeFlow.worstCommit = { label, selfMs, inclusiveMs };
}

/** Offer a synchronous press-handler duration; the longest one is kept. */
export function perfRecordHandlerMs(ms: number): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  if (ms > activeFlow.handlerMs) activeFlow.handlerMs = ms;
}

/*
  The pre-handler queue.

  Android stamps `nativeEvent.timestamp` from `SystemClock.uptimeMillis()`.
  `performance.now()` has a different origin, so the raw difference between them
  carries an unknown constant offset and only the CHANGE in that difference
  means anything. The smallest difference seen in the process is kept as the
  offset estimate — the least-delayed touch of the session is the closest thing
  to zero queueing this process has observed — and every reading is reported
  relative to it.

  So these are LOWER BOUNDS against the session's best case, not absolute
  queueing times, and the first touch of a session necessarily reads 0 because
  it defines the baseline. `baseN=` on the summary line carries the sample count
  so a reading taken off a one-sample baseline is identifiable rather than
  trusted. Known failure mode: `uptimeMillis()` excludes deep sleep while the
  JS clock does not, so suspending the device mid-capture inflates every
  subsequent reading. Capture in one sitting.

  That is a weaker claim than the rest of the instrument makes, and it is stated
  here rather than discovered later. It is still enough to settle the only
  question being asked of it — whether the wait before the handler runs is 5ms
  or 500ms.
*/
let touchClockOffset = Number.POSITIVE_INFINITY;
let touchClockSamples = 0;

/**
 * Milliseconds this touch waited before JS could run, relative to the best
 * touch of the session. Call FIRST in the handler, before any other work: the
 * reading is taken at call time, so anything above it is counted as queueing.
 *
 * Returns null when the event carries no usable timestamp. Recording is a
 * separate call because this must run before the flow exists — see
 * `perfRecordTouchQueue`.
 */
export function perfTouchQueueMs(nativeTimestamp: number | undefined): number | null {
  if (!ENABLED) return null;
  if (typeof nativeTimestamp !== 'number') return null;
  if (!Number.isFinite(nativeTimestamp) || nativeTimestamp <= 0) return null;
  const offset = now() - nativeTimestamp;
  if (!Number.isFinite(offset)) return null;
  touchClockSamples += 1;
  if (offset < touchClockOffset) {
    touchClockOffset = offset;
    return 0;
  }
  return offset - touchClockOffset;
}

/**
 * Attach a queue reading to the open flow. Split from `perfTouchQueueMs`
 * because the flow does not exist yet when the reading has to be taken: the
 * press handler opens the flow, so the measurement precedes its own home.
 */
export function perfRecordTouchQueue(ms: number | null): void {
  if (!ENABLED) return;
  if (ms === null) return;
  if (!activeFlow || activeFlow.closed) return;
  if (activeFlow.touchQueueMs === null || ms > activeFlow.touchQueueMs) {
    activeFlow.touchQueueMs = ms;
  }
}

/**
 * Record that a named call site replaced (or declined to replace) the auth user.
 *
 * Called from inside React state updaters, which is deliberate — the question
 * is which site produced a NEW object, and only the updater knows that. The
 * cost is that an updater React runs twice (StrictMode in development, or a
 * re-entrant update) double counts. Preview builds do not run StrictMode, and
 * the figure being read is "which site, by an order of magnitude" rather than
 * an exact tally, so that is an acceptable trade and not a silent one.
 */
export function perfRecordUserMutation(source: string): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  const seen = activeFlow.userMutations.get(source);
  if (seen !== undefined) {
    activeFlow.userMutations.set(source, seen + 1);
    return;
  }
  // Raised from 12 when the labels gained a `:source` suffix: three outcomes
  // across sixteen call sites is a much larger key space, and a cap that fills
  // with noise would evict the dominant entry the breakdown exists to show.
  if (activeFlow.userMutations.size >= 24) return;
  activeFlow.userMutations.set(source, 1);
}

/**
 * Record why a labelled component rendered. Cheap enough to call on every
 * render: one Map read and one increment, and the key space is bounded by the
 * number of labels times the number of distinct input combinations.
 */
export function perfRecordRenderCause(label: string, cause: string): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  const key = `${label}:${cause}`;
  const running = activeFlow.renderCauses.get(key);
  if (running === undefined) {
    // A pathological cause set (many inputs churning in different
    // combinations) must not grow this without bound.
    if (activeFlow.renderCauses.size >= 24) return;
    activeFlow.renderCauses.set(key, 1);
    return;
  }
  activeFlow.renderCauses.set(key, running + 1);
}

/** Attach a short fact to the open flow's summary line. */
export function perfAnnotate(note: string): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  if (activeFlow.notes.length >= 8) return;
  if (!activeFlow.notes.includes(note)) activeFlow.notes.push(note);
}

/** The open flow's label, for callers that need to tag a request with it. */
export function perfActiveFlowLabel(): string | null {
  if (!ENABLED) return null;
  return activeFlow && !activeFlow.closed ? activeFlow.label : null;
}

export function perfEnabled(): boolean {
  return ENABLED;
}

/** Force out whatever is buffered. For a tester finishing a capture. */
export function perfFlush(): void {
  if (!ENABLED) return;
  flush();
}

if (ENABLED) {
  const g = globalThis as {
    __WIEZ_PERF_LOGS?: string[];
    __WIEZ_PERF?: Record<string, unknown>;
  };
  g.__WIEZ_PERF_LOGS = g.__WIEZ_PERF_LOGS ?? [];
  g.__WIEZ_PERF = {
    /** Every buffered line. */
    all: () => ringBuffer()?.slice() ?? [],
    /** Just the per-flow summaries — the table the brief asks for. */
    summaries: () =>
      (ringBuffer() ?? []).filter((line) => line.includes('[SUMMARY]')),
    /** The most recent flow's lines, in order. */
    last: () => {
      const buffer = ringBuffer() ?? [];
      const ids = buffer
        .map((line) => /\bid=(\d+)/.exec(line)?.[1])
        .filter((value): value is string => Boolean(value));
      const lastId = ids[ids.length - 1];
      return lastId ? buffer.filter((line) => line.includes(`id=${lastId}`)) : [];
    },
    clear: () => {
      const buffer = ringBuffer();
      if (buffer) buffer.length = 0;
    },
    flush: perfFlush,
  };
  // `warn`, not `log`: this line's job is to prove in a release capture that
  // the instrumentation is actually live in the bundle under test.
  console.warn('[WIEZ-PERF][BOOT] instrumentation active (monotonic clock)');
}
