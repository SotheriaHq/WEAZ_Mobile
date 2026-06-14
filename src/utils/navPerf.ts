import { isThreadlyDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';

/**
 * Dev-only navigation timing instrumentation.
 *
 * Emits `[NAV_PERF]` breadcrumbs for a single in-flight navigation so the
 * tap -> route shell -> first paint -> data ready timeline can be measured on a
 * device/emulator. Output is gated by `isThreadlyDebugEnabled('nav')`, which is
 * itself `__DEV__`-only and opt-in via `EXPO_PUBLIC_DEBUG_NAV=1`. It produces no
 * output in production builds and stays silent in dev unless the flag is set, so
 * there is never user-visible log spam.
 *
 * Navigation is sequential (the user taps one thing at a time), so a single
 * module-level "active flow" timer is sufficient. Call `tap(flow)` from the
 * press handler, then `screenMounted()/firstVisibleUi()/dataReady()` from the
 * destination screen (no flow arg needed — they reuse the active flow).
 */
type NavStage =
  | 'tap'
  | 'navigation_called'
  | 'screen_mounted'
  | 'first_visible_ui'
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

const enabled = () => isThreadlyDebugEnabled('nav');

const emit = (stage: string, flow: string) => {
  const sinceTap = tapAt ? Date.now() - tapAt : null;
  console.log(`[NAV_PERF] ${stage} ${flow}${sinceTap == null ? '' : ` +${sinceTap}ms`}`);
};

export const navPerf = {
  /** Record the moment the user taps a navigation control. */
  tap(flow: string) {
    if (!enabled()) return;
    activeFlow = flow;
    tapAt = Date.now();
    emit('tap', flow);
  },
  /** Record the moment `router.push/replace` (or equivalent) is invoked. */
  navigationCalled(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('navigation_called', f);
  },
  /** Record when the destination screen component mounts. */
  screenMounted(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('screen_mounted', f);
  },
  /** Record when the destination paints its first visible shell/skeleton. */
  firstVisibleUi(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('first_visible_ui', f);
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
  },
};
