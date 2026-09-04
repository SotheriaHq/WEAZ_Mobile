import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { resendVerificationEmail } from '@/src/api/AuthApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

function maskEmail(email?: string | null) {
  const value = String(email ?? '').trim();
  if (!value || !value.includes('@')) return 'your inbox';
  const [local, domain] = value.split('@');
  const domainName = domain?.split('.')[0] ?? '';
  const domainSuffix = domain?.split('.').slice(1).join('.') ?? '';
  const maskedLocal =
    local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}***`;
  const maskedDomain =
    domainName.length <= 2
      ? `${domainName.slice(0, 1)}*`
      : `${domainName.slice(0, 2)}***`;

  return `${maskedLocal}@${maskedDomain}${domainSuffix ? `.${domainSuffix}` : ''}`;
}

type EmailVerificationNoticeProps = {
  userId?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  context?: 'profile' | 'catalog';
};

/**
 * Backstop poll for the other-device case.
 *
 * The 15s value this used to carry was written on the assumption that the
 * banner is "on screen" — it is not. The profile tab is PRELOADED at launch, so
 * this component mounts and starts polling whether or not the user ever opens
 * it, for the whole life of the app.
 *
 * Worse, it did not stay lightweight. `validateToken` re-sets the auth user, and
 * `me.tsx` derived its whole loader from that object's identity, so each poll
 * cascaded into an eight-request profile fan-out — ~32 requests a minute for an
 * idle unverified user. That cascade is fixed at the other end, but the poll
 * itself was still far more frequent than the event it watches for: verification
 * happens in a mail client, and the overwhelmingly common path back is the app
 * returning to the foreground, which the AppState listener below catches
 * immediately and for free.
 *
 * So this is now a slow backstop for the genuinely rare case — confirmed on a
 * DIFFERENT device while this one stays open — and it only ticks while the app
 * is actually in the foreground.
 */
const VERIFICATION_POLL_MS = 60_000;

/**
 * ONE watcher for the whole app, however many notices are on screen.
 *
 * This banner renders on the catalog tab AND the me tab, and `(tabs)/_layout`
 * sets `detachInactiveScreens={false}` so both stay mounted — the tab
 * preloader warms them deliberately. Each mounted copy used to own a timer, an
 * AppState listener and its own in-flight guard, and because the guard was per
 * instance the copies could not see each other: every foreground return and
 * every poll produced one `GET /auth/profile` PER MOUNTED BANNER, each with
 * `forceRefresh` so nothing could be served from cache.
 *
 * Refcounted at module scope instead. The timer and the listener exist while at
 * least one banner is watching and are torn down with the last one.
 */
let watcherCount = 0;
let watcherInterval: ReturnType<typeof setInterval> | null = null;
let watcherSubscription: { remove: () => void } | null = null;
let watcherRefresh: (() => void) | null = null;

function subscribeToVerificationWatch(
  validateToken: (options?: { forceRefresh?: boolean }) => Promise<boolean>,
): () => void {
  watcherCount += 1;

  if (watcherCount === 1) {
    // AuthContext coalesces concurrent validations, so a refresh that overlaps
    // an in-flight one costs nothing extra.
    watcherRefresh = () => {
      void validateToken({ forceRefresh: true }).catch(() => false);
    };

    const startPolling = () => {
      if (watcherInterval) return;
      watcherInterval = setInterval(() => watcherRefresh?.(), VERIFICATION_POLL_MS);
    };
    const stopPolling = () => {
      if (!watcherInterval) return;
      clearInterval(watcherInterval);
      watcherInterval = null;
    };

    watcherRefresh();
    if (AppState.currentState === 'active') startPolling();

    watcherSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Returning to the app IS the signal — this is the path a user takes
        // after tapping the link, so check immediately and resume the backstop.
        watcherRefresh?.();
        startPolling();
        return;
      }
      // Backgrounded: nothing can change on this device, and a timer that keeps
      // firing there is pure cost.
      stopPolling();
    });
  }

  return () => {
    watcherCount -= 1;
    if (watcherCount > 0) return;
    watcherSubscription?.remove();
    watcherSubscription = null;
    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = null;
    watcherRefresh = null;
  };
}

export function EmailVerificationNotice({
  userId,
  email,
  emailVerified,
  context = 'profile',
}: EmailVerificationNoticeProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const { validateToken } = useAuth();
  const [sending, setSending] = useState(false);

  /**
   * The banner checks its own premise.
   *
   * `isEmailVerified` comes from the cached auth profile, which is read with a
   * stale time — so a user who confirmed their email in a browser came back to
   * a mobile app still insisting they had not, with no way to correct it from
   * inside the app. Verification happens OUTSIDE this process by definition
   * (a link, in a mail client, possibly on another device), so the app cannot
   * treat its cached copy as authoritative while it is claiming someone is
   * unverified.
   *
   * Three triggers, all forcing past the cache: on mount, whenever the app
   * returns to the foreground (the overwhelmingly common path — leave, tap the
   * link, come back), and on a slow poll for the other-device case. No manual
   * "check status" button, because the user should never have to tell the app
   * to notice something it can see for itself.
   */
  const shouldWatch = Boolean(userId) && emailVerified === false;

  useEffect(() => {
    if (!shouldWatch) return;
    return subscribeToVerificationWatch(validateToken);
  }, [shouldWatch, validateToken]);

  const handleResend = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      const response = await resendVerificationEmail();
      toast.success(
        response.message ||
          'Verification email sent. Check your inbox and spam folder.',
      );
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.data?.message ||
        'Unable to resend verification email right now.';
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [sending, toast]);

  if (!userId || emailVerified !== false) {
    return null;
  }

  const title =
    context === 'catalog'
      ? 'Verify email to publish and create'
      : 'Verify your email';

  /**
   * One row, not a paragraph.
   *
   * This was the loudest object on the profile: a full warning-coloured border
   * around a stacked block, three lines of prose, and a solid brand button on
   * its own row — roughly a fifth of the screen, above the user's own name and
   * every control they came to use. It read as an error the account was in
   * rather than a step in progress.
   *
   * The information is two facts (what to do, where it was sent) and one
   * action. So: a marker, two tight lines, and a small button on the same row.
   * The warning colour survives as a left edge rather than a full box, which
   * is enough to read as "attention" without shouting, and the copy loses the
   * sentence explaining that the notice will disappear — it disappears, which
   * the user will observe without being told.
   */
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          borderLeftColor: theme.colors.warning,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. Sent to ${maskEmail(email)}.`}
    >
      <AppText variant="subtitle" style={styles.marker}>
        ✉️
      </AppText>
      <View style={styles.copy}>
        <AppText variant="captionBold" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          Sent to {maskEmail(email)}
        </AppText>
      </View>
      <Button
        title={sending ? 'Sending' : 'Resend'}
        size="sm"
        variant="secondary"
        onPress={handleResend}
        loading={sending}
        disabled={sending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    // The warning reads as an edge, not a box.
    borderLeftWidth: 3,
    borderRadius: tokens.radius.md,
    paddingLeft: tokens.spacing.md,
    paddingRight: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  marker: {
    // Optical: the envelope glyph sits high in its em box.
    marginTop: 2,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});

export default EmailVerificationNotice;
