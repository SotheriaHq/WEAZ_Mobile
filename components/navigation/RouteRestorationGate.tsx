import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useGlobalSearchParams, usePathname, useRootNavigationState } from 'expo-router';

import { useAuthSession } from '@/src/auth/AuthContext';
import { isNonDestinationUrl, isReplayedLaunchUrl } from '@/src/navigation/launchLinkLedger';
import {
  ROUTE_RESTORE_MAX_AGE_MS,
  buildRestorableHref,
  clearRouteSnapshot,
  saveRouteSnapshot,
  takeRouteSnapshot,
} from '@/src/navigation/routeRestoration';
import { handleInitialNotification } from '@/src/utils/notificationRouting';

/**
 * Survive the app being killed in the background.
 *
 * Reported as "I minimised the app to verify my email, came back, it showed the
 * loader and dropped me on the Runway". The SIT request log shows a full
 * cold-start fan-out on every one of those returns: Android had killed the
 * process while the person was in Gmail. Nothing the app does can stop the OS
 * from doing that, so the app has to come back to the same place instead.
 *
 * - SAVE: when the app goes to the background, remember the current route.
 * - RESTORE: on the next cold start, if that was recent, for the same account,
 *   and this launch was not itself a fresh link or notification tap, go back.
 *
 * Rendered next to the root navigator; renders nothing.
 */
export function RouteRestorationGate() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { localSessionReady, status, userId } = useAuthSession();
  const navigationReady = Boolean(useRootNavigationState()?.key);

  const latestRef = useRef({ pathname, params, userId });
  latestRef.current = { pathname, params, userId };

  const restoreAttemptedRef = useRef(false);
  // Until the restore decision is made the app is sitting on its cold-start
  // route; backgrounding during that window must not overwrite the snapshot we
  // are about to restore with "/".
  const restoreSettledRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' || !restoreSettledRef.current) return;
      const current = latestRef.current;
      const href = buildRestorableHref(current.pathname, current.params);
      if (href) {
        void saveRouteSnapshot({ href, userId: current.userId, savedAt: Date.now() });
      } else {
        void clearRouteSnapshot();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (!navigationReady || !localSessionReady || status === 'loading') return;
    restoreAttemptedRef.current = true;

    void (async () => {
      try {
        const snapshot = await takeRouteSnapshot();
        if (!snapshot) return;
        if (Date.now() - snapshot.savedAt > ROUTE_RESTORE_MAX_AGE_MS) return;
        // Signed out, or a different account, since: their old screen is not theirs.
        if (snapshot.userId !== latestRef.current.userId) return;

        // A fresh link or notification tap is a destination the person just
        // chose; it wins over where they used to be. A REPLAYED launch link is
        // Android reviving the task, which is exactly the case to restore.
        const launchUrl = await Linking.getInitialURL();
        if (
          launchUrl &&
          !isNonDestinationUrl(launchUrl) &&
          !(await isReplayedLaunchUrl(launchUrl))
        ) {
          return;
        }
        const { notification } = await handleInitialNotification();
        if (notification) return;

        // Something already moved the app off its cold-start route.
        if (latestRef.current.pathname !== '/') return;
        if (snapshot.href === latestRef.current.pathname) return;

        router.navigate(snapshot.href as never);
      } catch {
        // Restoration is a convenience; failing to restore is today's behaviour.
      } finally {
        restoreSettledRef.current = true;
      }
    })();
  }, [localSessionReady, navigationReady, status]);

  return null;
}
