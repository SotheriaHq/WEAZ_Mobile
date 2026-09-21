import * as SecureStore from 'expo-secure-store';

import {
  verifyEmailTokenOnce,
  type EmailVerificationOutcome,
} from '@/src/auth/emailVerificationLink';

/**
 * A verification link the app received but has not managed to spend yet.
 *
 * `verifyEmailTokenOnce` keeps its attempts in memory, which is exactly as long
 * as the process lives — and the process is the least reliable thing in this
 * flow. The link is tapped in a mail client, which means the app is either cold
 * starting (no network yet, hosts still failing over, Android may kill it again
 * on the way back) or being revived from Recents. Every one of those ends the
 * same way today: the request is lost, nothing retries it, and the account sits
 * unverified with no evidence that anything was ever attempted. The only way
 * out was to request a fresh email.
 *
 * So the link survives the process. Whoever sees it first writes it down; the
 * attempt can then be retried by anything that later notices the account is
 * still unverified — the app returning to the foreground, the slow backstop
 * poll, or the person pulling down on their own profile.
 *
 * The record is deleted as soon as the answer is final, in either direction: a
 * verified account has nothing left to spend, and a link the server has
 * rejected outright will be rejected the same way forever. Only a request that
 * never reached the server is worth keeping.
 *
 * SecureStore rather than AsyncStorage, and unlike `launchLinkLedger` this
 * cannot store a hash: retrying means re-sending the real value. A link is a
 * credential — spending it proves control of the inbox — so it is kept where
 * the session token is kept, not in plain application storage.
 */
const PENDING_KEY = 'wiez.auth.pending-email-verification.v1';

/**
 * Past this, a stored link is not worth retrying: the person has long since
 * asked for another one, and the server reuses `emailVerificationCode` across
 * resends anyway, so the newest link is usually the same value.
 */
const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type PendingVerification = { token: string; at: number };

let inFlightDrain: Promise<EmailVerificationOutcome | null> | null = null;

async function readPending(): Promise<PendingVerification | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingVerification>;
    const token = String(parsed.token ?? '').trim();
    const at = Number(parsed.at ?? 0);
    if (!token || !Number.isFinite(at) || at <= 0) return null;
    if (Date.now() - at > PENDING_MAX_AGE_MS) {
      await clearPendingEmailVerification();
      return null;
    }
    return { token, at };
  } catch {
    return null;
  }
}

/** Write down a link the moment it arrives, before anything tries to use it. */
export async function rememberPendingEmailVerification(
  rawToken: string | null | undefined,
): Promise<void> {
  const token = String(rawToken ?? '').trim();
  if (!token) return;
  try {
    await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    // Losing the record costs the retry, never the first attempt.
  }
}

export async function clearPendingEmailVerification(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_KEY);
  } catch {
    // Nothing to do; a stale record is retried and then discarded on its answer.
  }
}

/**
 * Forget this link only if it is still the one on file. A newer link may have
 * arrived while this attempt was in flight, and finishing with an old answer
 * must not throw the new one away.
 */
async function clearIfStillPending(token: string): Promise<void> {
  const pending = await readPending();
  if (pending && pending.token !== token) return;
  await clearPendingEmailVerification();
}

/**
 * Spend a link, and keep it only for as long as it is still worth retrying.
 *
 * Callers get the same single-spend guarantee `verifyEmailTokenOnce` gives:
 * however many doors this link came through, the server is asked once.
 */
export async function spendEmailVerificationToken(
  rawToken: string | null | undefined,
): Promise<EmailVerificationOutcome | null> {
  const token = String(rawToken ?? '').trim();
  if (!token) return null;

  await rememberPendingEmailVerification(token);
  const outcome = await verifyEmailTokenOnce(token);
  if (outcome.status === 'verified' || !outcome.retryable) {
    await clearIfStillPending(token);
  }
  return outcome;
}

/**
 * Retry the stored link, if there is one. `null` means there was nothing to do,
 * which is the normal case and not a failure.
 *
 * Concurrent callers share one attempt: the foreground listener, the backstop
 * poll and a pull-to-refresh can all land within the same moment.
 */
export function drainPendingEmailVerification(): Promise<EmailVerificationOutcome | null> {
  if (inFlightDrain) return inFlightDrain;

  const drain = (async () => {
    const pending = await readPending();
    if (!pending) return null;
    return spendEmailVerificationToken(pending.token);
  })().finally(() => {
    inFlightDrain = null;
  });

  inFlightDrain = drain;
  return drain;
}
