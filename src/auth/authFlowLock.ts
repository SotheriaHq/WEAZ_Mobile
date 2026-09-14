/**
 * One auth action at a time, app-wide.
 *
 * The auth screens hand work to systems that take over the whole device: the
 * Google account chooser opens a Custom Tab in front of everything, and the
 * screen underneath stays live while it is up. Pressing "Create an account"
 * behind the chooser really did push the signup route, so dismissing Google
 * revealed a screen the person never chose to be on — with a Google sign-in
 * still resolving against the screen they had left.
 *
 * Two rules follow from that:
 *
 *   1. Acquisition is SYNCHRONOUS. `setSubmitting(true)` does not take effect
 *      until React re-renders, so two presses in the same tick both pass a
 *      state-based guard. A module-level flag flipped before the first `await`
 *      cannot be raced that way.
 *   2. The lock blocks NAVIGATION as well as other submissions. A disabled
 *      button is not enough when the way to start a second flow is a link.
 *
 * It is module state rather than React context on purpose: the flow outlives
 * the screen that started it. `GoogleAuthRedirectRecoveryGate` finishes a
 * callback that can arrive after Android has recreated the process, so
 * ownership cannot belong to one component's tree.
 *
 * What must NOT take this lock: asynchronous work that is not an auth
 * decision — loading legal copy, syncing a theme, fetching login options for
 * display. This gates the actions that can create or enter a session, not
 * every promise on the screen.
 *
 * Zero imports is also deliberate: `scripts/test-auth-flow-lock-contract.js`
 * loads this module into a bare VM sandbox and exercises the real state
 * machine rather than asserting on its source text.
 */

export type AuthActionName =
  | 'google'
  | 'email-continue'
  | 'password-login'
  | 'login-code-send'
  | 'login-code-confirm'
  | 'password-setup-request'
  | 'password-setup-confirm'
  | 'password-setup-submit'
  | 'signup';

let activeAction: AuthActionName | null = null;

/**
 * Bumped on every acquisition so a release handed out by an earlier holder can
 * be recognised as stale. Without it, a late `finally` from an abandoned flow
 * would unlock the screen in the middle of the flow that replaced it — which
 * is the same open door this module exists to close.
 */
let activeToken = 0;

const listeners = new Set<() => void>();

function notify(): void {
  // Copied before iterating: a listener is free to unsubscribe while running.
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function subscribeToAuthFlowLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The action holding the lock, or null. Stable identity — safe as a snapshot. */
export function getActiveAuthAction(): AuthActionName | null {
  return activeAction;
}

export function isAuthFlowBusy(): boolean {
  return activeAction !== null;
}

/**
 * Takes the lock, or returns null when another action already holds it.
 *
 * Returns the release function rather than a boolean so a caller cannot
 * release a lock it never acquired.
 */
export function acquireAuthFlowLock(action: AuthActionName): (() => void) | null {
  if (activeAction !== null) return null;

  activeAction = action;
  const token = ++activeToken;
  notify();

  let released = false;
  return () => {
    if (released || token !== activeToken || activeAction === null) return;
    released = true;
    activeAction = null;
    notify();
  };
}

/**
 * Runs `work` under the lock, or does nothing at all if another auth action is
 * already running.
 *
 * Refusal is silent by design. The person pressed a second control while the
 * first was still working; the honest response is for nothing to happen, not
 * for an error to appear about a thing they did not do wrong. The controls are
 * dimmed and marked busy for assistive tech while the lock is held, so the
 * refusal is visible before the press, which is where it belongs.
 *
 * Errors propagate untouched — every call site already owns its own reporting.
 */
export async function runExclusiveAuthAction(
  action: AuthActionName,
  work: () => Promise<void>,
): Promise<void> {
  const release = acquireAuthFlowLock(action);
  if (!release) return;

  try {
    await work();
  } finally {
    release();
  }
}
