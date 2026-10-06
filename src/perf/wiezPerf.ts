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
    // A tab kept alive by `freezeOnBlur` does not remount, so its mount effect
    // never re-runs and T3 cannot fire from a mount. Without this field a
    // revisit's `T1->T3=n/a` is ambiguous between "already mounted" and "never
    // arrived", and those are opposite diagnoses.
    `mounted=${flow.stages.has('screen_mount') ? 'yes' : 'no'}`,
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

/** Add an observed JS-thread stall to the open flow's total. */
export function perfAddBlockedMs(ms: number): void {
  if (!ENABLED) return;
  if (!activeFlow || activeFlow.closed) return;
  activeFlow.blockedMs += ms;
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
