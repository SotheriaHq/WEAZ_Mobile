/**
 * Feed the existing `navPerf` marks into the T0–T10 timeline.
 *
 * `navPerf` already fires at every place a stage happens — forty-odd call
 * sites across the island, the tab shell, and every screen — and it is pinned
 * by `scripts/check-perf-regressions.cjs`. Re-plumbing those call sites to add
 * a second instrument would be a large diff whose only product is risk, so the
 * marks are translated here instead, at `navPerf`'s single emit point. One
 * interception, no new call sites, and the two instruments cannot disagree
 * about when something happened because they are reading the same event.
 *
 * ## What deliberately does NOT map to T4
 *
 * `shell_visible` and `first_visible_ui` are the destination's first paint of
 * its own shell — frequently a skeleton. T4 in the brief is the first
 * *meaningful* render. Mapping them to T4 would make every screen look like it
 * produced content in 40ms and would hide the entire problem under
 * investigation, so they are recorded as notes and T4 comes only from a screen
 * declaring real content via `useFirstMeaningfulRender`.
 *
 * `stale_ui_rendered` is different: it fires when a cached snapshot has been
 * painted, which is real content, so it does map to T4.
 */
import {
  perfAnnotate,
  perfBeginFlowIfNew,
  perfMark,
  perfNote,
  perfRecordIndicatorVisible,
  type PerfChannel,
  type PerfStage,
} from '@/src/perf/wiezPerf';

/** navPerf stage -> canonical T-stage. Absent = recorded as a note. */
const STAGE_MAP: Record<string, PerfStage> = {
  // T1 — the router verb is invoked. Several aliases exist for the same moment.
  route_call: 'navigation_initiated',
  route_call_start: 'navigation_initiated',
  // T2 — Expo Router reports the new path.
  path_changed: 'transition_begin',
  // T3 — the destination component mounted.
  screen_mounted: 'screen_mount',
  // T4 — a cached snapshot is on screen. Real content, so it counts.
  stale_ui_rendered: 'first_meaningful_render',
  // T9 — the screen's primary data is in state.
  data_ready: 'data_usable',
  usable_ui: 'data_usable',
};

/** Stages that mean "a tap just happened". */
const TAP_STAGES = new Set(['tap_start', 'tap_press_in']);

/** Which channel a non-canonical note belongs to. */
function channelFor(stage: string): PerfChannel {
  if (stage.startsWith('cache_') || stage.includes('prefetch')) return 'CACHE';
  if (stage.includes('request') || stage.includes('refresh')) return 'API';
  if (
    stage.includes('visible') ||
    stage.includes('render') ||
    stage.includes('skeleton')
  ) {
    return 'RENDER';
  }
  if (stage.includes('screen') || stage.includes('sheet')) return 'SCREEN';
  return 'NAV';
}

/**
 * Translate one `navPerf` emit into the timeline.
 *
 * Never throws: instrumentation that can break the thing it measures is worse
 * than no instrumentation.
 */
export function bridgeNavPerfStage(stage: string, flow: string): void {
  try {
    if (TAP_STAGES.has(stage)) {
      perfBeginFlowIfNew(flow);
      return;
    }

    const mapped = STAGE_MAP[stage];
    if (mapped) {
      perfMark(mapped, { detail: stage });
      return;
    }

    // The cache verdict is not a stage pair on its own, but it is the single
    // most important fact about a flow: whether the screen had anything to
    // show. Record both ends and put the verdict on the summary line.
    // The island's active pill reaching the screen. Not a T-stage, but it is
    // what the user reads as "did my press register", so it earns a place on
    // the summary line rather than only in a note.
    if (stage === 'active_indicator_visible') {
      perfRecordIndicatorVisible();
      perfNote('NAV', stage);
      return;
    }

    if (stage === 'cache_hit' || stage === 'cache_miss') {
      perfMark('cache_lookup_begin', { detail: stage });
      perfMark('cache_result', { detail: stage });
      perfAnnotate(stage);
      return;
    }

    perfNote(channelFor(stage), stage);
  } catch {
    // Swallowed on purpose — see above.
  }
}
