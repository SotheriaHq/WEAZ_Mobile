import { exchangeCodeAsync } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { GoogleAuthParams } from "@/src/api/AuthApi";

const GOOGLE_REDIRECT_RECOVERY_STORAGE_KEY =
  "wiez.auth.googleRedirectRecovery.v1";
const GOOGLE_REDIRECT_RECOVERY_MAX_AGE_MS = 10 * 60 * 1000;

export type GoogleAuthContinuation = Pick<
  GoogleAuthParams,
  "intent" | "type" | "brandFullName"
>;

type PendingGoogleAuthRedirect = {
  version: 1;
  createdAt: number;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
  continuation: GoogleAuthContinuation;
};

export type RecoveredGoogleAuthRedirect = {
  idToken: string;
  continuation: GoogleAuthContinuation;
};

export class GoogleRedirectRecoveryError extends Error {
  constructor(
    public readonly reason:
      "missing_code" | "missing_id_token" | "state_mismatch",
  ) {
    super("Google sign-in could not be completed. Please try again.");
    this.name = "GoogleRedirectRecoveryError";
  }
}

// This flag deliberately stays in memory. A live AuthSession owns its callback
// through expo-web-browser; persistent recovery is for the different case where
// Android has recreated the JavaScript process before that listener can run.
let hasLiveGoogleAuthSession = false;

/**
 * A redirect that reached the app while a live AuthSession still owned the flow.
 *
 * "Owned" turned out to be a promise expo-web-browser does not always keep. On
 * Android it frequently resolves `openAuthSessionAsync` with `dismiss` when the
 * Custom Tab closes, EVEN THOUGH the redirect arrived and is being delivered to
 * the app as a VIEW intent (expo/expo issues 23781 and 29153). The old code dropped that
 * URL on the floor — `recoverGoogleAuthRedirect` returned null whenever a live
 * session existed — and the live session then reported a cancellation, which is
 * deliberately silent. The person came back to the app signed out, with no
 * error, having completed sign-in successfully at Google.
 *
 * So the URL is now kept instead of discarded, and the live session asks for it
 * before concluding that a dismissal was a decision.
 */
let capturedRedirectUrl: string | null = null;

/** How long a dismissed session waits for the redirect it may already have earned. */
const REDIRECT_SALVAGE_TIMEOUT_MS = 1500;
const REDIRECT_SALVAGE_POLL_MS = 50;

function isAndroid(): boolean {
  return Platform.OS === "android";
}

function normalizeContinuation(
  input: GoogleAuthContinuation | undefined,
): GoogleAuthContinuation {
  const intent =
    input?.intent === "LOGIN" || input?.intent === "SIGNUP"
      ? input.intent
      : undefined;
  const type =
    input?.type === "BRAND" || input?.type === "REGULAR"
      ? input.type
      : undefined;
  const brandFullName =
    typeof input?.brandFullName === "string" && input.brandFullName.trim()
      ? input.brandFullName.trim()
      : undefined;

  return {
    ...(intent ? { intent } : null),
    ...(type ? { type } : null),
    ...(brandFullName ? { brandFullName } : null),
  };
}

function isPendingGoogleAuthRedirect(
  value: unknown,
): value is PendingGoogleAuthRedirect {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingGoogleAuthRedirect>;
  return (
    candidate.version === 1 &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.clientId === "string" &&
    typeof candidate.redirectUri === "string" &&
    typeof candidate.codeVerifier === "string" &&
    typeof candidate.state === "string" &&
    candidate.continuation !== null &&
    typeof candidate.continuation === "object"
  );
}

/**
 * The path `makeRedirectUri({ native: `${applicationId}:/oauthredirect` })`
 * produces for Google on native. It is the one fact about a Google callback
 * that is knowable SYNCHRONOUSLY, before any storage read — which is what the
 * app's other URL listeners need.
 *
 * They need it because a Google callback is not a link into a screen, and the
 * notification deep-link router has no route for one: `routeForNotification`
 * falls through every branch and returns its default, `/notifications`. So a
 * completed sign-in was also issuing `router.replace('/notifications')`
 * underneath the flow — landing people in a signed-out shell at the exact
 * moment they had just authenticated successfully.
 */
const GOOGLE_REDIRECT_PATH = "/oauthredirect";

export function isGoogleAuthRedirectUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname === GOOGLE_REDIRECT_PATH;
  } catch {
    return false;
  }
}

function isMatchingRedirect(url: string, redirectUri: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(redirectUri);
    return (
      actual.protocol === expected.protocol &&
      actual.hostname === expected.hostname &&
      actual.port === expected.port &&
      actual.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

async function readPendingGoogleAuthRedirect(): Promise<PendingGoogleAuthRedirect | null> {
  if (!isAndroid()) return null;

  const raw = await SecureStore.getItemAsync(
    GOOGLE_REDIRECT_RECOVERY_STORAGE_KEY,
  ).catch(() => null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isPendingGoogleAuthRedirect(parsed) ||
      Date.now() - parsed.createdAt > GOOGLE_REDIRECT_RECOVERY_MAX_AGE_MS
    ) {
      await clearGoogleAuthRedirectRecovery();
      return null;
    }
    return parsed;
  } catch {
    await clearGoogleAuthRedirectRecovery();
    return null;
  }
}

/**
 * Saves only the short-lived PKCE material needed to finish a callback if
 * Android recreates the app. It never persists an ID token or backend session.
 */
export async function beginGoogleAuthRedirectRecovery(input: {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
  continuation?: GoogleAuthContinuation;
}): Promise<void> {
  if (!isAndroid()) return;

  const clientId = input.clientId.trim();
  const redirectUri = input.redirectUri.trim();
  const codeVerifier = input.codeVerifier.trim();
  const state = input.state.trim();

  if (!clientId || !redirectUri || !codeVerifier || !state) {
    throw new GoogleRedirectRecoveryError("missing_code");
  }

  const pending: PendingGoogleAuthRedirect = {
    version: 1,
    createdAt: Date.now(),
    clientId,
    redirectUri,
    codeVerifier,
    state,
    continuation: normalizeContinuation(input.continuation),
  };

  await SecureStore.setItemAsync(
    GOOGLE_REDIRECT_RECOVERY_STORAGE_KEY,
    JSON.stringify(pending),
  );
  hasLiveGoogleAuthSession = true;
}

/**
 * A live AuthSession calls this after its result has settled. Deletion failures
 * must not turn an already-completed Google response into a client-side error.
 */
export async function clearGoogleAuthRedirectRecovery(): Promise<void> {
  hasLiveGoogleAuthSession = false;
  // A captured URL carries a single-use authorization code. Letting one survive
  // into the next attempt would salvage the wrong sign-in.
  capturedRedirectUrl = null;
  await SecureStore.deleteItemAsync(GOOGLE_REDIRECT_RECOVERY_STORAGE_KEY).catch(
    () => undefined,
  );
}

/**
 * Ends the in-memory session but KEEPS the persisted PKCE record.
 *
 * For the one case the live session cannot tell apart: Android reports
 * `dismiss` both when a person backs out and when the redirect went to a
 * process that no longer exists (a task relaunch, an OEM kill, a dev-client
 * reload). Clearing the record on that guess destroys the only material that
 * could finish the sign-in on the next launch — and the next launch is
 * precisely when the redirect shows up.
 *
 * Keeping it costs a real cancellation nothing: recovery still requires a
 * matching redirect URI, an exact `state`, and an unused `code`, and the record
 * expires in ten minutes. Clearing `hasLiveGoogleAuthSession` is the part that
 * must NOT be skipped — while it is set, every incoming URL is captured for a
 * session that has already ended and `recoverGoogleAuthRedirect` refuses them
 * all.
 */
export function endGoogleAuthSessionKeepingRecovery(): void {
  hasLiveGoogleAuthSession = false;
  capturedRedirectUrl = null;
}

/**
 * Returns null for every unrelated app link and for a callback that belongs to
 * the live AuthSession. A recreated Android process has no live flag, so it
 * safely validates the persisted PKCE state before exchanging the code.
 */
async function exchangeRedirectForIdToken(
  pending: PendingGoogleAuthRedirect,
  url: string,
): Promise<RecoveredGoogleAuthRedirect | null> {
  const callback = new URL(url);
  const returnedState = callback.searchParams.get("state")?.trim() ?? "";
  const code = callback.searchParams.get("code")?.trim() ?? "";

  // Google sends an error callback when a person cancels. There is no code to
  // exchange and no product error to show; the next Google attempt starts fresh.
  if (!code) return null;
  if (!returnedState || returnedState !== pending.state) {
    throw new GoogleRedirectRecoveryError("state_mismatch");
  }

  const tokenResponse = await exchangeCodeAsync(
    {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      code,
      extraParams: { code_verifier: pending.codeVerifier },
    },
    Google.discovery,
  );
  const idToken = tokenResponse.idToken?.trim();
  if (!idToken) {
    throw new GoogleRedirectRecoveryError("missing_id_token");
  }

  return {
    idToken,
    continuation: pending.continuation,
  };
}

/**
 * Called by the app's deep-link listener for EVERY incoming URL, before any
 * other handling.
 *
 * Returns true when a live AuthSession owns the flow, in which case the URL is
 * kept for that session to claim and the caller must not process it further.
 * This has to run ahead of the listener's own gating — the auth-flow lock is
 * held by the screen that started sign-in, so a gate that checks the lock first
 * would return early and throw away the very URL the screen is waiting for.
 */
export function captureGoogleAuthRedirectIfLive(
  url: string | null | undefined,
): boolean {
  if (!url || !hasLiveGoogleAuthSession) return false;
  capturedRedirectUrl = url;
  return true;
}

/**
 * Completes a sign-in whose redirect arrived while the live session was told it
 * had been dismissed. Resolves null when nothing was captured, which is what a
 * real cancellation looks like.
 *
 * It deliberately does NOT clear the recovery record: the caller owns that in
 * its own `finally`, and clearing here would delete the PKCE material a
 * subsequent cold-start recovery might still need.
 */
export async function salvageLiveGoogleAuthRedirect(): Promise<RecoveredGoogleAuthRedirect | null> {
  const deadline = Date.now() + REDIRECT_SALVAGE_TIMEOUT_MS;

  // The intent usually lands before the tab finishes closing, so the common
  // case exits on the first pass; the budget is only a margin for the reverse
  // ordering. A genuine cancel pays it once and in silence.
  let url = capturedRedirectUrl;
  while (!url && Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, REDIRECT_SALVAGE_POLL_MS),
    );
    url = capturedRedirectUrl;
  }

  capturedRedirectUrl = null;
  if (!url) return null;

  const pending = await readPendingGoogleAuthRedirect();
  if (!pending || !isMatchingRedirect(url, pending.redirectUri)) return null;

  return exchangeRedirectForIdToken(pending, url);
}

export async function recoverGoogleAuthRedirect(
  url: string | null | undefined,
): Promise<RecoveredGoogleAuthRedirect | null> {
  if (!url || hasLiveGoogleAuthSession) return null;

  const pending = await readPendingGoogleAuthRedirect();
  if (!pending || !isMatchingRedirect(url, pending.redirectUri)) return null;

  try {
    return await exchangeRedirectForIdToken(pending, url);
  } finally {
    // An authorization code is single-use. Keeping it after any completion or
    // failure would only invite a stale replay on a later app launch.
    await clearGoogleAuthRedirectRecovery();
  }
}
