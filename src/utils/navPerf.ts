import { isWiezDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';

/**
 * Opt-in navigation timing instrumentation.
 *
 * Emits `[NAV_PERF]` breadcrumbs for a single in-flight navigation so the
 * tap -> route shell -> first paint -> data ready timeline can be measured on a
 * device/emulator. ON only when `EXPO_PUBLIC_DEBUG_NAV=1` is present at BUNDLE
 * time — in every build type:
 *   - dev / `start:perf`: set it in `.env.local`.
 *   - EAS preview: `eas.json` sets it on the `preview` profile, so a preview APK
 *     reports timings to logcat (`npm run logs:device -- --nav`).
 *   - EAS production / store: not set, so this is fully inert.
 *
 * It used to force itself ON whenever `!__DEV__` (to make `start:perf` work
 * without the flag), which also meant every STORE build built a log line,
 * pushed it into an unbounded global array and `console.warn`ed it on every
 * navigation — while this comment claimed production was silent. Logs are
 * buffered off the tap path so console IO is not part of the timing measured.
 *
 * Navigation is sequential (the user taps one thing at a time), so a single
 * module-level "active flow" timer is sufficient. Call `tap(flow)` from the
 * press handler, then `screenMounted()/firstVisibleUi()/dataReady()` from the
 * destination screen (no flow arg needed — they reuse the active flow).
 */
type NavStage =
  | 'tap'
  | 'tap_start'
  | 'pressed_feedback_visible'
  | 'active_indicator_intent'
  | 'active_indicator_visible'
  | 'frame_yield_before_route'
  | 'navigation_called'
  | 'route_call'
  | 'path_changed'
  | 'screen_mounted'
  | 'shell_visible'
  | 'first_visible_ui'
  | 'bag_sheet_opened'
  // usable_ui = the user can actually act (footer/actions reachable, form
  // interactive) — distinct from first_visible_ui (something merely appeared).
  | 'usable_ui'
  | 'footer_actions_visible'
  | 'options_sheet_opened'
  | 'profile_image_loaded'
  | 'data_ready'
  // background_data_ready = non-critical data (counts/signals/diagnostics)
  // settled; it must never gate usable_ui.
  | 'background_data_ready';

let activeFlow: string | null = null;
let tapAt = 0;
let pendingLogFlush: ReturnType<typeof setTimeout> | null = null;
let pendingLogLines: string[] = [];

/**
 * Resolved once. `process.env.EXPO_PUBLIC_DEBUG_NAV` is inlined to a literal at
 * bundle time, so the answer cannot change while the app runs.
 */
const NAV_PERF_ENABLED = isWiezDebugEnabled('nav');

/** A long preview session must not grow the buffer without bound. */
const MAX_BUFFERED_LOG_LINES = 400;

// Collect all NAV_PERF events into a global so they can be inspected
// even if Metro terminal doesn't forward console in --no-dev mode.
// Access in JS debugger console with:  __NAV_PERF_LOGS
// To clear between tests:   __NAV_PERF_LOGS.length = 0
if (NAV_PERF_ENABLED && typeof globalThis !== 'undefined') {
  (globalThis as any).__NAV_PERF_LOGS = (globalThis as any).__NAV_PERF_LOGS || [];
  (global as any).__NAV_PERF_LOGS = (globalThis as any).__NAV_PERF_LOGS;
}

// Convenience helpers for the debugger console (attached to multiple globals for reliability)
function attachNavPerfHelpers() {
  const g = (typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {})) as any;
  if (g.__NAV_PERF_LOGS) {
    if (!g.__navClear) {
      g.__navClear = () => { g.__NAV_PERF_LOGS.length = 0; console.log('[NAV_PERF] logs cleared'); };
    }
    g.__navLast = (n = 20) => g.__NAV_PERF_LOGS.slice(-n);
    g.__navTable = (n = 25) => {
      const s = g.__NAV_PERF_LOGS.slice(-n);
      console.table(s);
      return s;
    };

    // Always attach a raw sequence helper that works even if others are missing
    g.__NAV_PERF_LOGS.sequence = (n = 25) => {
      return g.__NAV_PERF_LOGS.slice(-n).map((l: string) => {
        const ev = (l.match(/event=([^ ]+)/) || [])[1] || '';
        const d = (l.match(/deltaMs=([^ ]+)/) || [])[1] || '';
        return ev + ' +' + d + 'ms';
      }).join('\n');
    };

    // Also attach directly on the array for convenience
    if (!g.__NAV_PERF_LOGS.clear) g.__NAV_PERF_LOGS.clear = g.__navClear;
    g.__NAV_PERF_LOGS.last = g.__navLast;
    g.__NAV_PERF_LOGS.table = g.__navTable;

    // Extra: .show(n) returns the actual data (best for debugger consoles)
    g.__NAV_PERF_LOGS.show = (n = 20) => g.__NAV_PERF_LOGS.slice(-n);

    // .dump(n) prints the lines one per line and returns the slice
    g.__NAV_PERF_LOGS.dump = (n = 20) => {
      const slice = g.__NAV_PERF_LOGS.slice(-n);
      console.log(slice.join('\n'));
      return slice;
    };

    // .capture(label) — use this for easy labeled captures
    g.__NAV_PERF_LOGS.capture = (label = '') => {
      const slice = g.__NAV_PERF_LOGS.slice(-25);
      console.log(`\n=== CAPTURE${label ? ' ' + label : ''} ===`);
      console.table(slice);
      return slice;
    };

    // .seq() — prints a short sequence of just the event names + deltas for the last capture
    g.__NAV_PERF_LOGS.seq = (n = 25) => {
      const s = g.__NAV_PERF_LOGS.slice(-n);
      const lines = s.map((l: string) => {
        const ev = (l.match(/event=([^ ]+)/) || [])[1] || '';
        const d = (l.match(/deltaMs=(\d+)/) || [])[1] || '';
        return `${ev} +${d}ms`;
      });
      console.log(lines.join('  →  '));
      return lines;
    };

    // .fullTrace(n) — prints a clean event list with absolute-ish deltas for analysis
    g.__NAV_PERF_LOGS.fullTrace = (n = 30) => {
      const s = g.__NAV_PERF_LOGS.slice(-n);
      const out = s.map((l: string) => {
        const ev = (l.match(/event=([^ ]+)/) || [])[1] || '';
        const d = (l.match(/deltaMs=([^ ]+)/) || [])[1] || '';
        const r = (l.match(/route=([^ ]+)/) || [])[1] || '';
        return `${r} | ${ev} | +${d}ms`;
      });
      console.log(out.join('\n'));
      return out;
    };

    // .seqStr(n) — one-liner string you can copy
    g.__NAV_PERF_LOGS.seqStr = (n = 25) => {
      return g.__NAV_PERF_LOGS.slice(-n).map((l: string) => {
        const ev = (l.match(/event=([^ ]+)/) || [])[1] || '';
        const d = (l.match(/deltaMs=([^ ]+)/) || [])[1] || '';
        return ev + ' +' + d + 'ms';
      }).join('\n');
    };

    // .summary(n) — shows key timing milestones for the last capture
    g.__NAV_PERF_LOGS.summary = (n = 30) => {
      const s = g.__NAV_PERF_LOGS.slice(-n);
      const get = (needle: string) => {
        const line = s.find((l: string) => l.includes(needle));
        return line ? line.match(/deltaMs=(\d+)/)?.[1] || 'n/a' : 'n/a';
      };
      console.log({
        tap_to_route_call: get('route_call_start'),
        route_call_to_path_changed: get('path_changed'),
        path_to_shell: get('shell_visible'),
        shell_to_first_ui: get('first_visible_ui'),
        total_to_data_ready: get('data_ready')
      });
    };

    // .reset() for convenience
    g.__NAV_PERF_LOGS.reset = () => { g.__NAV_PERF_LOGS.length = 0; console.log('[NAV_PERF] cleared'); };

    // Make sure the array itself has these for direct use
    g.__NAV_PERF_LOGS.show = g.__NAV_PERF_LOGS.show;
    g.__NAV_PERF_LOGS.dump = g.__NAV_PERF_LOGS.dump;

    // One-time confirmation (only once per load)
    if (!g.__navHelpersLogged) {
      g.__navHelpersLogged = true;
      // console.log('[NAV_PERF] helpers ready: use __NAV_PERF_LOGS.table(20) or __navTable(20)');
    }
  }
}
if (NAV_PERF_ENABLED) {
  attachNavPerfHelpers();

  // Re-attach on next ticks (helps in some debugger / minified contexts)
  setTimeout(attachNavPerfHelpers, 0);
  setTimeout(attachNavPerfHelpers, 300);
  setTimeout(attachNavPerfHelpers, 1000);
  setTimeout(attachNavPerfHelpers, 2000);
}

/*
  The old "raw fallback" read `(process as any)?.env?.EXPO_PUBLIC_DEBUG_NAV`.
  Expo only inlines the literal `process.env.EXPO_PUBLIC_X` shape, so that read
  was always undefined in a bundle — the "env loader drops DEBUG_NAV" it worked
  around was this, not the loader. `isWiezDebugEnabled` uses the inlinable shape.
*/
const enabled = () => NAV_PERF_ENABLED;

let currentSource: string | null = null;
let currentTarget: string | null = null;
let currentPathname: string | null = null;

function buildPerfLine(stage: string, flow: string, extra?: { source?: string | null; target?: string | null; pathname?: string | null }) {
  const sinceTap = tapAt ? Date.now() - tapAt : null;
  const route = flow || 'unknown';
  const source = extra?.source ?? currentSource ?? '';
  const target = extra?.target ?? currentTarget ?? route;
  const pathname = extra?.pathname ?? currentPathname ?? '';
  const t = Date.now();
  const deltaPart = sinceTap != null ? ` deltaMs=${sinceTap}` : '';
  return `[NAV_PERF] route=${route} source=${source} target=${target} event=${stage} t=${t}${deltaPart} pathname=${pathname}`;
}

const emit = (stage: string, flow: string, extra?: { source?: string | null; target?: string | null; pathname?: string | null }) => {
  if (!enabled()) return;
  const line = buildPerfLine(stage, flow, extra);

  pendingLogLines.push(line);
  const buffer = typeof globalThis !== 'undefined' ? (globalThis as any).__NAV_PERF_LOGS : null;
  if (Array.isArray(buffer)) {
    buffer.push(line);
    if (buffer.length > MAX_BUFFERED_LOG_LINES) {
      buffer.splice(0, buffer.length - MAX_BUFFERED_LOG_LINES);
    }
  }
  if (pendingLogFlush !== null) return;

  pendingLogFlush = setTimeout(() => {
    pendingLogFlush = null;
    const lines = pendingLogLines;
    pendingLogLines = [];
    lines.forEach((nextLine) => {
      console.log(nextLine);
      // The duplicate `console.warn` exists because in --no-dev perf builds
      // console.log is not reliably surfaced. In a DEV build it is pure cost:
      // every warn goes through LogBox, which symbolicates and renders it, and
      // boot emits dozens of these — visible as a long "Reloading…" stall.
      // Keep the duplicate only where it was actually needed.
      if (!__DEV__) {
        console.warn(nextLine);
      }
    });
  }, 1200);
};

function setNavContext(source?: string | null, target?: string | null, pathname?: string | null) {
  if (source) currentSource = source;
  if (target) currentTarget = target;
  if (pathname) currentPathname = pathname;
}

export const navPerf = {
  /** Record the moment the user taps a navigation control. */
  tap(flow: string) {
    if (!enabled()) return;
    activeFlow = flow;
    tapAt = Date.now();
    emit('tap_start', flow);
  },
  /** Record when the native pressed state should be visible. */
  pressedFeedbackVisible(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('pressed_feedback_visible', f);
  },
  /** Record when the nav item has requested immediate local active feedback. */
  activeIndicatorIntent(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('active_indicator_intent', f);
  },
  /** Record when the active island indicator has committed visually. */
  activeIndicatorVisible(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('active_indicator_visible', f);
  },
  /** Record that the route call yielded one frame for touch-down UI to paint. */
  frameYieldBeforeRoute(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('frame_yield_before_route', f);
  },
  /** Record the moment `router.push/replace` (or equivalent) is invoked. */
  navigationCalled(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('route_call', f);
  },
  /** Record when Expo Router reports a new pathname. */
  pathChanged(pathname: string, flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('path_changed', `${f} ${pathname}`);
  },
  /** Record when the destination screen component mounts. */
  screenMounted(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('screen_mounted', f);
  },
  /** Record when the destination shell is visible, before non-critical data. */
  shellVisible(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('shell_visible', f);
  },
  /** Record when the destination paints its first visible shell/skeleton. */
  firstVisibleUi(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('first_visible_ui', f);
  },
  bagSheetOpened(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('bag_sheet_opened', f);
  },
  /**
   * Generic marker for the usability-focused stages that aren't part of the
   * fixed tap→data_ready spine (usable_ui, footer_actions_visible,
   * options_sheet_opened, profile_image_loaded, background_data_ready, etc.).
   * Reuses the active flow + tap timestamp so the `+ms` offset stays comparable.
   */
  mark(stage: string, flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit(stage, f);
  },
  /** Record when the destination's primary data is ready; ends the flow. */
  dataReady(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('data_ready', f);
    activeFlow = null;
    tapAt = 0;
    currentSource = null;
    currentTarget = null;
    currentPathname = null;
  },

  // --- Phase 1 granular island + link markers (added without changing behavior) ---

  /** Tap on island item (pressIn) */
  tapPressIn(flow: string, meta?: { source?: string; target?: string; pathname?: string }) {
    if (!enabled()) return;
    setNavContext(meta?.source, meta?.target, meta?.pathname);
    if (!activeFlow) {
      activeFlow = flow;
      tapAt = Date.now();
    }
    emit('tap_press_in', flow, meta);
  },

  /** Island immediately set optimistic active state */
  optimisticActiveSet(flow?: string, meta?: { source?: string; target?: string; pathname?: string }) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('optimistic_active_set', f, meta);
  },

  /** Route navigation was scheduled (e.g. inside RAF) */
  routeScheduled(flow?: string, meta?: { source?: string; target?: string; pathname?: string }) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('route_scheduled', f, meta);
  },

  /** Right before calling router.push / navigate / replace */
  routeCallStart(flow?: string, meta?: { source?: string; target?: string; pathname?: string }) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('route_call_start', f, meta);
  },

  /** Immediately after router call returns (sync) */
  routeCallEnd(flow?: string, meta?: { source?: string; target?: string; pathname?: string }) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('route_call_end', f, meta);
  },

  /** Update current navigation context (source/target/path) for richer logs */
  setContext(source?: string | null, target?: string | null, pathname?: string | null) {
    setNavContext(source, target, pathname);
  },

  /**
   * Record that an in-flight navigation lock was released (path match or
   * timeout). Phase 2 guard instrumentation: lets a trace show that a lock did
   * not leak past its navigation.
   */
  navigation_lock_released(target?: string | null, _reason?: string) {
    if (!enabled()) return;
    emit('navigation_lock_released', activeFlow ?? 'nav', { target });
  },
};

// Phase 1 helper: Print a one-time confirmation the moment the navPerf module is loaded.
// This makes it obvious in the Metro terminal (for both dev and --no-dev --minify perf runs)
// whether EXPO_PUBLIC_DEBUG_NAV is active.
const rawDebugNav = process.env.EXPO_PUBLIC_DEBUG_NAV;
console.log('[NAV_PERF DEBUG] raw EXPO_PUBLIC_DEBUG_NAV =', JSON.stringify(rawDebugNav), 'enabled()=', enabled());

if (enabled()) {
  console.log('[NAV_PERF] NAV PERF INSTRUMENTATION ACTIVE (forced in perf builds)');
} else {
  console.log('[NAV_PERF DEBUG] nav perf is DISABLED (flag not truthy)');
}
