/**
 * Is the JavaScript thread blocked, or is something else slow?
 *
 * Without this, a trace cannot separate the two explanations for a late
 * request, and they call for opposite fixes:
 *
 *   - The request left late because the thread was saturated rendering
 *     something else. Fixing the API would change nothing.
 *   - The request left on time and the response was slow. Fixing the render
 *     path would change nothing.
 *
 * The method is interval drift. A timer asked to fire every `SAMPLE_MS` can
 * only be late, and it can only be late because the thread was busy when its
 * turn came. Drift is therefore a direct read of how long the thread was
 * unavailable to application code — including to `requestAnimationFrame`
 * callbacks, `setTimeout` fail-opens and promise continuations, all of which
 * queue behind the same thread.
 *
 * This matters for a specific defect this app has already hit: a deferral
 * written as `requestAnimationFrame(open)` with `setTimeout(open, 48)` as a
 * fail-open cannot fail open past a blocked thread, because both callbacks are
 * queued on it. A 48ms fail-open in front of a 2000ms block still waits 2000ms.
 * Drift samples are what show that.
 *
 * Cost when enabled: one timer per `SAMPLE_MS` doing a subtraction. Nothing is
 * logged unless a sample exceeds `BLOCK_THRESHOLD_MS`, so a healthy session is
 * silent. Fully inert when the debug flag is absent.
 */
import {
  perfAddBlockedMs,
  perfAnnotate,
  perfEnabled,
  perfNote,
} from '@/src/perf/wiezPerf';

const SAMPLE_MS = 100;

/**
 * Below this, drift is scheduler noise rather than a stall.
 *
 * Two frames at 60Hz is ~33ms. A sample under ~80ms cannot have cost a user a
 * visible frame budget worth reporting, and logging it would bury the real
 * stalls in chatter.
 */
const BLOCK_THRESHOLD_MS = 80;

/** Sum of everything over the threshold, so a flow can be given a total. */
let blockedMsTotal = 0;
let worstBlockMs = 0;
let blockEvents = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const now: () => number = (() => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
})();

export function startJsThreadMonitor(): () => void {
  if (!perfEnabled() || timer !== null) return () => undefined;

  let previous = now();
  timer = setInterval(() => {
    const current = now();
    const drift = current - previous - SAMPLE_MS;
    previous = current;
    if (drift < BLOCK_THRESHOLD_MS) return;

    blockedMsTotal += drift;
    blockEvents += 1;
    if (drift > worstBlockMs) worstBlockMs = drift;

    perfNote('RENDER', 'js_thread_blocked', `${drift.toFixed(0)}ms`);
    // So the flow's own summary says the thread stalled during it. A reader
    // comparing T3->T4 across runs needs to know which runs were contended.
    //
    // The boolean alone turned out to distinguish nothing — it appeared on 25
    // of 27 flows in the first capture. The accumulated duration is what ranks
    // them, and it has to be on the summary line, not only in these notes,
    // because the summary is the view a tester reads.
    perfAnnotate('js_thread_blocked');
    perfAddBlockedMs(drift);
  }, SAMPLE_MS);

  return () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Totals since process start, for a capture's closing report. */
export function jsThreadBlockStats(): {
  blockedMsTotal: number;
  worstBlockMs: number;
  blockEvents: number;
} {
  return { blockedMsTotal, worstBlockMs, blockEvents };
}

export function resetJsThreadBlockStats(): void {
  blockedMsTotal = 0;
  worstBlockMs = 0;
  blockEvents = 0;
}
