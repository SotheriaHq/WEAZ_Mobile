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
import { AppState } from 'react-native';

import { drainCommitAttribution, lastDrainUnattributedMs } from '@/src/perf/commitCost';
import {
  hermesStats,
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
  /*
    Time in the background is not a stall.

    Android pauses JS timers while another activity is in front — the system
    photo picker and camera are exactly that. The first sample after coming
    back then measured the whole visit as drift: the 2026-10-16 capture booked
    create_design as worstBlock=7762ms x3, which was the time spent choosing
    photos, not a frozen app. Samples are skipped while not active, and the
    clock restarts on return.
  */
  let foreground = AppState.currentState === 'active';
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    foreground = state === 'active';
    previous = now();
  });
  // Hermes' cumulative GC seconds at the previous sample; the delta over a
  // stalled sample is how much of that stall the collector took.
  let previousGcSeconds = hermesStats()?.js_gcTime ?? 0;
  timer = setInterval(() => {
    const current = now();
    const drift = current - previous - SAMPLE_MS;
    previous = current;
    const gcSeconds = hermesStats()?.js_gcTime ?? previousGcSeconds;
    const gcMs = Math.max(0, (gcSeconds - previousGcSeconds) * 1000);
    previousGcSeconds = gcSeconds;
    if (!foreground) return;
    if (drift < BLOCK_THRESHOLD_MS) return;

    blockedMsTotal += drift;
    blockEvents += 1;
    if (drift > worstBlockMs) worstBlockMs = drift;

    // Name the work inside the stall. A bare duration says the thread was
    // gone; it does not say whether the destination's own render took it or
    // something else re-rendered on the same commit, and those call for
    // opposite fixes. `unattributed` in this string is itself a finding: it
    // means the cost was not in any React commit we instrument.
    perfNote(
      'RENDER',
      'js_thread_blocked',
      `${drift.toFixed(0)}ms gc=${gcMs.toFixed(0)}ms by=${drainCommitAttribution(drift)}`,
    );
    // So the flow's own summary says the thread stalled during it. A reader
    // comparing T3->T4 across runs needs to know which runs were contended.
    //
    // The boolean alone turned out to distinguish nothing — it appeared on 25
    // of 27 flows in the first capture. The accumulated duration is what ranks
    // them, and it has to be on the summary line, not only in these notes,
    // because the summary is the view a tester reads.
    perfAnnotate('js_thread_blocked');
    // The drain above has just computed how much of this sample no React commit
    // explains. The flow gets all three figures: the accumulated stall, the
    // worst SINGLE stall, and the part that is not React at all. One number
    // could not distinguish "lost in one long commit" from "lost to a thousand
    // small ones" from "lost to something outside React entirely", and those
    // are three different fixes.
    perfAddBlockedMs(drift, lastDrainUnattributedMs(), gcMs);
  }, SAMPLE_MS);

  return () => {
    appStateSubscription.remove();
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
