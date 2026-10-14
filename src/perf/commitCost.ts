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
 * component, reported BOTH ways.
 *
 *   inclusive — the component's own render plus every measured child plus the
 *     native commit. Answers "what did putting this subtree on screen cost".
 *   self — inclusive minus the self time of everything measured beneath it.
 *     Answers "whose work was it".
 *
 * Both are needed, and self is what attributes. The first capture with this
 * instrument reported `worstCommit=TabShell` on all fifteen flows, which is
 * what inclusive time must report: an ancestor's figure is greater than or
 * equal to every descendant's by construction, so "the outermost label won" is
 * a property of nesting rather than a finding. It cannot tell a slow shell
 * apart from a shell dragging a slow child behind it, and those need different
 * fixes. Ranking by self time can.
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
  perfRecordRenderCause,
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
 * Running sum of SELF times completed so far, for subtracting descendants.
 *
 * The first capture with this instrument reported `worstCommit=TabShell` on
 * every single flow — which it was always going to, because inclusive time
 * makes an ancestor's number greater than or equal to every descendant's by
 * construction. "The outermost label is the worst" is a property of nesting,
 * not a finding, and it cannot distinguish a slow shell from a shell dragging
 * a slow child behind it.
 *
 * Self time fixes that: since an inclusive measurement equals its own self
 * time plus the self times of everything beneath it, subtracting the self time
 * accumulated during a component's own window leaves exactly its own work.
 * Accumulating SELF rather than inclusive is what makes this correct at more
 * than one level of nesting — adding inclusive values would count a
 * grandchild twice and over-subtract.
 */
let completedSelfTotal = 0;

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

function record(label: string, selfMs: number, inclusiveMs: number): void {
  if (selfMs < MIN_RECORDED_MS && inclusiveMs < MIN_RECORDED_MS) return;
  const existing = windowCosts.get(label);
  if (existing) {
    existing.totalMs += selfMs;
    existing.count += 1;
    if (selfMs > existing.worstMs) existing.worstMs = selfMs;
  } else {
    windowCosts.set(label, { totalMs: selfMs, worstMs: selfMs, count: 1 });
  }
  // Also give the open flow its worst single commit, so the summary line a
  // tester reads carries the attribution instead of only the `--perf` stream.
  perfRecordCommit(label, selfMs, inclusiveMs);
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
  const descendantSelfAtStart = useRef(0);
  // Assigned during render on purpose. This is the current render's start, and
  // a ref is the only store that survives to the layout effect without itself
  // causing a render.
  startedAt.current = perfEnabled() ? now() : 0;
  descendantSelfAtStart.current = completedSelfTotal;

  // No dependency array: every commit of this subtree is a measurement.
  //
  // Layout effects run child-first, so by the time this fires every measured
  // descendant has already added its self time to `completedSelfTotal`. The
  // difference is therefore exactly the work done beneath this component.
  useLayoutEffect(() => {
    if (!perfEnabled() || startedAt.current === 0) return;
    const inclusive = now() - startedAt.current;
    const descendants = completedSelfTotal - descendantSelfAtStart.current;
    const self = Math.max(0, inclusive - descendants);
    completedSelfTotal += self;
    record(label, self, inclusive);
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
    const elapsed = now() - startedAt;
    record(label, elapsed, elapsed);
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
    record('PressHandler', elapsed, elapsed);
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
/**
 * How much of a drift sample no React commit can account for.
 *
 * Set as a side effect of draining, because the drain is destructive and
 * computing it a second time would report zero. Read immediately after.
 *
 * This is the figure that separates "React is slow" from "something that is not
 * React is slow" — image decode, JSON parsing in a promise continuation, a
 * native module callback, garbage collection. Four captures have had it
 * available and thrown it away, because it only ever appeared in a RENDER note
 * and `--summary` drops those.
 */
let lastUnattributedMs = 0;

export function lastDrainUnattributedMs(): number {
  return lastUnattributedMs;
}

export function drainCommitAttribution(
  observedMs: number,
  limit: number = DEFAULT_REPORT_LIMIT,
): string {
  if (windowCosts.size === 0) {
    lastUnattributedMs = observedMs;
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
  lastUnattributedMs = unattributed;
  top.push(`unattributed=${unattributed.toFixed(0)}ms`);
  return top.join(',');
}

/** Drop everything without reporting — used when a capture resets. */
export function resetCommitAttribution(): void {
  windowCosts.clear();
}

/**
 * WHY did this component render?
 *
 * `useCommitCost` says what a commit cost and `commitTotals` says how many
 * commits there were. Neither can say what scheduled them, and three successive
 * captures have been read by ELIMINATION instead — a context broadcast was
 * inferred twice from identical per-label counts, and the provider labels added
 * to confirm it then recorded nothing at all, which disproved it without
 * naming a replacement.
 *
 * Elimination keeps failing because it cannot distinguish the one case that
 * matters: a component that re-rendered because something it reads changed,
 * versus a component that re-rendered because an ANCESTOR did. Those have
 * opposite fixes — memoize the input, or stop the parent — and the existing
 * ledger looks identical in both.
 *
 * So this compares every input a component reads against the previous render
 * and reports the ones that differ. A render where NOTHING a component reads
 * changed is reported as `parent`, and that is the decisive reading: it means
 * the work was forced from above, and the search moves up one level on evidence
 * rather than on another inference.
 *
 * HONEST LIMITS. The comparison is `Object.is` on whatever the caller passes,
 * so an unstable object identity reads as a change even when the contents are
 * equal — which is usually the finding, but it is a finding about identity, not
 * about values. The previous-input snapshot is written during render, so a
 * render React discards (interrupted, suspended, or the second pass of StrictMode)
 * still advances the baseline and can misattribute the NEXT render's cause. That
 * is the same tradeoff `useCommitCost` already makes by timing from render start,
 * and it is acceptable for a diagnostic that is absent from release builds. It
 * would not be acceptable in anything behaviour depends on.
 */
export function useRenderCause(label: string, inputs: Record<string, unknown>): void {
  const previous = useRef<Record<string, unknown> | null>(null);

  if (perfEnabled()) {
    const prior = previous.current;
    if (prior === null) {
      perfRecordRenderCause(label, 'mount');
    } else {
      let changed = '';
      for (const key in inputs) {
        if (Object.is(inputs[key], prior[key])) continue;
        changed = changed === '' ? key : `${changed}+${key}`;
      }
      // Nothing this component reads moved, so the render came from above.
      perfRecordRenderCause(label, changed === '' ? 'parent' : changed);
    }
    previous.current = { ...inputs };
  }
}
