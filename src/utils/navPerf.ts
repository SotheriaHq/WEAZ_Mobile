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
  | 'data_ready';

let activeFlow: string | null = null;
let tapAt = 0;

const enabled = () => isThreadlyDebugEnabled('nav');

const emit = (stage: NavStage, flow: string) => {
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
  /** Record when the destination's primary data is ready; ends the flow. */
  dataReady(flow?: string) {
    if (!enabled()) return;
    const f = flow ?? activeFlow;
    if (f) emit('data_ready', f);
    activeFlow = null;
    tapAt = 0;
  },
};
