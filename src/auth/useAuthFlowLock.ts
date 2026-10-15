import { useCallback, useMemo, useSyncExternalStore } from 'react';

import {
  getActiveAuthAction,
  isAuthFlowBusy,
  runExclusiveAuthAction,
  subscribeToAuthFlowLock,
  type AuthActionName,
} from '@/src/auth/authFlowLock';

/**
 * Screen-side binding for the app-wide auth lock in `authFlowLock.ts`.
 *
 * `busy` is for rendering — dim the control, mark it busy for assistive tech.
 * `run` and `guard` are for deciding, and they both read the lock at PRESS
 * time rather than trusting `busy`, which is a render-old value. A press that
 * races the re-render still has to get past the synchronous check.
 */
export function useAuthFlowLock() {
  const action = useSyncExternalStore(
    subscribeToAuthFlowLock,
    getActiveAuthAction,
    getActiveAuthAction,
  );

  const run = useCallback(
    (name: AuthActionName, work: () => Promise<void>) =>
      runExclusiveAuthAction(name, work),
    [],
  );

  /**
   * Wraps a navigation (or any other side effect that should not happen
   * mid-flow) so it is inert while an auth action is running.
   *
   * This is the half that the original defect needed: the Google button was
   * already inert while loading, but "Create an account" underneath it was a
   * plain `Pressable` that pushed a route behind the account chooser.
   */
  const guard = useCallback(
    <Args extends unknown[]>(fn: (...args: Args) => void) =>
      (...args: Args) => {
        if (isAuthFlowBusy()) return;
        fn(...args);
      },
    [],
  );

  return useMemo(
    () => ({ action, busy: action !== null, run, guard }),
    [action, run, guard],
  );
}
