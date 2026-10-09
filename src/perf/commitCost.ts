/**
 * Which component spent the thread?
 *
 * `jsThreadMonitor` proves the JavaScript thread was unavailable, and the flow
 * summary proves how much of a flow it was unavailable for. Neither can say
 * WHAT ran, and without that the two candidate fixes for a stall are opposite:
 *
 *   - The destination's own render is expensive. Splitting it, virtualising it
 *     or deferring part of it is the fix.
 *   - The destination is cheap and something ELSE re-rendered on the same
 *     commit — the tab shell, the island, a provider above both. Making the
 *     destination faster would change nothing.
 *
 * The first capture could not distinguish these, and the `--summary` view made
 * it worse: `blockedMs` is accumulated over a flow window, and a flow that
 * never reaches a terminal stage stays open for the full `FLOW_WATCHDOG_MS`.
 * So a `reason=timeout` flow reports every stall from every source in a ten
 * second window as if the press had caused it. Those numbers rank contention.
 * They cannot attribute it. This is the instrument that attributes it.
 *
 * WHAT IS MEASURED, precisely: render-start to layout-effect, for the labelled
 * component. That is INCLUSIVE — it contains the component's own render, every
 * child it renders, and the native commit that follows. It is deliberately not
 * self-time, because the question being asked is "how long did putting this
 * subtree on screen cost", and a parent whose children are the expensive part
 * is still the thing that scheduled them. Nested labels therefore overlap, and
 * a reader must treat an inner label as part of its outer one rather than
 * adding the two together.
 *
 * WHAT IS NOT MEASURED: a render React threw away (an interrupted or suspended
 * render commits nothing, so no layout effect runs and the cost is invisible
 * here), and work that is not a React commit at all — image decode, JSON
 * parsing in a promise continuation, a native module callback. A stall that
 * this ledger cannot account for is itself a finding: it means the cost is not
 * in a React commit, and the `unattributed` figure on a drift sample is what
 * says so rather than leaving the reader to assume.
 *
 * Cost when enabled: one `now()` per render and one subtraction plus a Map
 * write per commit, and only above `MIN_RECORDED_MS`. Fully inert when the
 * debug flag is absent — the hook still runs (hook order must not depend on a
 * flag) but does no timing and records nothing.
 */
import { useLayoutEffect, useRef } from 'react';

import {
  perfEnabled,
  perfRecordCommit,
  perfRecordHandlerMs,
} from '@/src/perf/wiezPerf';

/**
 * Below this a commit is not worth a line in the ledger.
 *
 * One frame at 60Hz is ~16.7ms. A commit under 8ms cannot have cost a visible
 * frame on its own, and recording every cheap commit would bury the expensive
 * ones in a Map with hundreds of entries.
 */
const MIN_RECORDED_MS = 8;

/** Keep the drift report readable; the tail is never the explanation. */
const DEFAULT_REPORT_LIMIT = 3;

type CostEntry = {
  totalMs: number;
  worstMs: number;
  count: number;
};

/**
 * Costs since the last drain, not since process start.
 *
 * The consumer is the drift sampler, which asks "what ran during the stall I
 * just observed". That is a question about one sample window, so the ledger is
 * drained on every read and begins accumulating the next window immediately.
 */
const windowCosts = new Map<string, CostEntry>();

const now: () => number = (() => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
})();

function record(label: string, ms: number): void {
  if (ms < MIN_RECORDED_MS) return;
  const existing = windowCosts.get(label);
  if (existing) {
    existing.totalMs += ms;
    existing.count += 1;
    if (ms > existing.worstMs) existing.worstMs = ms;
  } else {
    windowCosts.set(label, { totalMs: ms, worstMs: ms, count: 1 });
  }
  // Also give the open flow its worst single commit, so the summary line a
  // tester reads carries the attribution instead of only the `--perf` stream.
  perfRecordCommit(label, ms);
}

/**
 * Report a labelled subtree's commit cost (render-start to layout-effect).
 *
 * Call it FIRST in the component, before any other hook: the start timestamp
 * is taken where the hook is called, so anything above it is outside the
 * measurement. Placing it first is what makes the number mean "this render".
 */
export function useCommitCost(label: string): void {
  const startedAt = useRef(0);
  // Assigned during render on purpose. This is the current render's start, and
  // a ref is the only store that survives to the layout effect without itself
  // causing a render.
  startedAt.current = perfEnabled() ? now() : 0;

  // No dependency array: every commit of this subtree is a measurement.
  useLayoutEffect(() => {
    if (!perfEnabled() || startedAt.current === 0) return;
    record(label, now() - startedAt.current);
  });
}

/**
 * Time a synchronous block that is not a React commit.
 *
 * The island's press handler is the case this exists for. It runs
 * `paintCandidate` and then the navigation dispatch in one turn, and expo
 * Router holds route state in a `useSyncExternalStore`, which React is
 * required to update synchronously to avoid tearing. So the whole navigator
 * re-render happens INSIDE the touch handler, and the handler's duration is
 * therefore the length of the stall the next press has to queue behind. That
 * is the number the "press, then wait" report is actually about, and nothing
 * in the T0-T10 spine measures it: T0 is recorded inside the handler, so the
 * spine cannot see either the queueing delay before it or the block after it.
 */
export function measureSyncBlock<T>(label: string, run: () => T): T {
  if (!perfEnabled()) return run();
  const startedAt = now();
  try {
    return run();
  } finally {
    record(label, now() - startedAt);
  }
}

/**
 * Time the island's press handler and publish it as the flow's `handlerMs`.
 *
 * Reported separately from the commit ledger as well as into it, because it is
 * the one figure that explains the complaint directly: for as long as this
 * runs, a finger landing on another chip cannot be seen at all. `run` is
 * invoked exactly once whether or not tracing is on, and an exception does not
 * lose the measurement.
 */
export function measurePressHandler<T>(run: () => T): T {
  if (!perfEnabled()) return run();
  const startedAt = now();
  try {
    return run();
  } finally {
    const elapsed = now() - startedAt;
    record('PressHandler', elapsed);
    perfRecordHandlerMs(elapsed);
  }
}

/**
 * The heaviest labelled commits since the last call, then reset.
 *
 * `observedMs` is the stall the caller is explaining. Whatever it cannot
 * account for is reported as `unattributed`, because "the thread was busy and
 * none of it was a React commit we instrumented" is a different diagnosis from
 * "the destination render is slow" and must not be allowed to look like one.
 */
export function drainCommitAttribution(
  observedMs: number,
  limit: number = DEFAULT_REPORT_LIMIT,
): string {
  if (windowCosts.size === 0) {
    return `unattributed=${observedMs.toFixed(0)}ms`;
  }

  const ranked = Array.from(windowCosts.entries()).sort(
    (a, b) => b[1].totalMs - a[1].totalMs,
  );
  windowCosts.clear();

  let accounted = 0;
  for (const [, entry] of ranked) accounted += entry.totalMs;

  const top = ranked
    .slice(0, limit)
    .map(([label, entry]) =>
      entry.count > 1
        ? `${label}=${entry.totalMs.toFixed(0)}ms×${entry.count}`
        : `${label}=${entry.totalMs.toFixed(0)}ms`,
    );

  // Nested labels overlap (see the header), so accounted time can exceed the
  // sample. Clamp at zero rather than printing a negative remainder that would
  // read as an instrument fault.
  const unattributed = Math.max(0, observedMs - accounted);
  top.push(`unattributed=${unattributed.toFixed(0)}ms`);
  return top.join(',');
}

/** Drop everything without reporting — used when a capture resets. */
export function resetCommitAttribution(): void {
  windowCosts.clear();
}
