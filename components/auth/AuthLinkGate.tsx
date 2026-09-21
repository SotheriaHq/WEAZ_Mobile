import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { router, useRootNavigationState } from 'expo-router';

import { useAuth } from '@/src/auth/AuthContext';
import {
  drainPendingEmailVerification,
  spendEmailVerificationToken,
} from '@/src/auth/pendingEmailVerification';
import { isReplayedLaunchUrl, markLaunchUrlHandled } from '@/src/navigation/launchLinkLedger';
import { useToast } from '@/src/toast/ToastContext';
import { resolveMobileAuthRoute, type MobileAuthRoute } from '@/src/utils/authLinkRouting';

const VERIFY_EMAIL_ROUTE = '/(auth)/verify-email';

/**
 * The single owner of email-verification and password-reset links.
 *
 * "Tapped the verify link, the app opened, the email was still unverified" had
 * one cause with two halves, both confirmed against SIT: the link opened the
 * app (`GET /auth/app-link/verify-email`), the app cold-started (Android had
 * killed it while the person was in Gmail), and `GET /auth/verify-email` was
 * never called.
 *
 *  - Expo Router reads the Android launch URL racing a 150 ms timeout. A cold
 *    start on a real device loses, so the link was dropped and the app opened
 *    on the Runway.
 *  - The root deep-link fallback scheduled its navigation on a 100 ms timer
 *    inside an effect that re-ran whenever the auth user object changed — which
 *    it does several times during boot — clearing the timer each time.
 *
 * So the token now does not depend on navigation at all:
 *  1. The URL is read WITHOUT a timeout (launch) or from the `url` event.
 *  2. A verify token is spent immediately and exactly once
 *     (`spendEmailVerificationToken`), before any screen exists.
 *  3. The account is refreshed as soon as a session is known, so the "verify
 *     your email" banner clears even if the person never sees the screen.
 *  4. The screen is opened once the root navigator is actually mounted.
 *
 * What that still did not cover: the request itself failing. Step 2 held its
 * attempt in memory, so a cold start with no network yet, or Android killing
 * the process on the way back from the mail client, lost the link with nothing
 * left to retry — the account stayed unverified and the only way forward was a
 * fresh email. The link is now written down before it is spent, and step 5
 * picks up whatever is left over, here and on every later return to the app.
 *
 *  5. Anything still unspent is retried once the session is known.
 *
 * Mounted outside the boot gate on purpose: it must be listening before the app
 * has finished starting.
 */
export function AuthLinkGate() {
  const { localSessionReady, status, updateUser, validateToken } = useAuth();
  const toast = useToast();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const [pendingRoute, setPendingRoute] = useState<MobileAuthRoute | null>(null);
  const [verified, setVerified] = useState<{ announce: boolean } | null>(null);

  useEffect(() => {
    let mounted = true;

    const accept = (route: MobileAuthRoute, { navigate }: { navigate: boolean }) => {
      const token = route.params?.token;
      if (route.pathname === VERIFY_EMAIL_ROUTE && token) {
        void spendEmailVerificationToken(token).then((outcome) => {
          // The API is idempotent ("Email already verified"), so a replay also
          // succeeds — it refreshes the account but must not announce anything.
          if (mounted && outcome?.status === 'verified') setVerified({ announce: navigate });
        });
      }
      if (navigate) setPendingRoute(route);
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = resolveMobileAuthRoute(url);
      if (route) accept(route, { navigate: true });
    });

    void (async () => {
      const url = await Linking.getInitialURL();
      const route = resolveMobileAuthRoute(url);
      if (!mounted || !route) return;

      /*
        A replay (Android reviving a killed app with the Intent that first
        started it) must not drag the person back to a verify screen they left.
        A verify token is still sent: if the first attempt never reached the
        server this finishes it, and an already-verified token just succeeds
        again (the API is idempotent) without announcing anything.
      */
      const replayed = await isReplayedLaunchUrl(url);
      if (!replayed) void markLaunchUrlHandled(url);
      if (mounted) accept(route, { navigate: !replayed });
    })();

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingRoute || !localSessionReady || !navigationReady) return;
    setPendingRoute(null);
    router.push(pendingRoute as never);
  }, [localSessionReady, navigationReady, pendingRoute]);

  /**
   * Finish a link an earlier run of the app could not.
   *
   * Two cases reach here and nothing else catches either. A link Expo Router
   * saw and recorded but that never reached `Linking` — Android delivers the
   * same Intent through more than one path and they do not always agree. And a
   * link whose request died with the process: no network yet at cold start, or
   * the OS reclaiming the app while the person was still in their mail client.
   *
   * Silent by design. The person tapped that link some time ago and has since
   * moved on; the banner clearing is the whole confirmation, and a toast about
   * something they did earlier would arrive as a non sequitur.
   */
  useEffect(() => {
    if (!localSessionReady) return;
    let active = true;
    void drainPendingEmailVerification()
      .then((outcome) => {
        if (active && outcome?.status === 'verified') setVerified({ announce: false });
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [localSessionReady]);

  useEffect(() => {
    // A guest has no cached account to correct; the verify screen sends them
    // to log in, and the server copy is already verified.
    if (!verified || status !== 'authenticated') return;
    setVerified(null);
    updateUser({ isEmailVerified: true });
    void validateToken({ forceRefresh: true }).catch(() => false);
    if (verified.announce) toast.success('Email verified.');
  }, [status, toast, updateUser, validateToken, verified]);

  return null;
}
