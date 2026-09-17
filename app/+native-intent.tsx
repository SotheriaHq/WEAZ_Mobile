import { resolveMobileAuthRoute } from '@/src/utils/authLinkRouting';
import { claimFreshLaunchUrl } from '@/src/navigation/launchLinkLedger';

/**
 * Expo Router's hook for every system URL, before it becomes navigation.
 *
 * 1. Auth links (verify-email, reset-password) are NOT routed here. On Android
 *    Expo Router reads the launch URL through a race against a 150 ms timeout;
 *    a cold start on a real phone loses that race, the link is dropped, and the
 *    app opens on the Runway. So it sometimes routed these and sometimes not,
 *    and the app's own fallback navigated again on top. `AuthLinkGate` owns them
 *    now: it reads the URL without a timeout, spends the token once, and
 *    navigates when the navigator is actually mounted.
 *
 * 2. A launch URL Android is REPLAYING (the app was killed in the background and
 *    revived from Recents with the Intent that first started it) opens the root
 *    instead of re-running a link the person finished with. See
 *    `launchLinkLedger.ts`; `RouteRestorationGate` then returns them to where
 *    they actually were.
 */
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (resolveMobileAuthRoute(path)) {
      return initial ? '/' : '';
    }
    if (initial) {
      return (await claimFreshLaunchUrl(path)) ?? '/';
    }
    return path;
  } catch {
    return path;
  }
}
