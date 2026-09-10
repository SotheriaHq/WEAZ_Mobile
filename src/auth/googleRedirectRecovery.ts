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
  await SecureStore.deleteItemAsync(GOOGLE_REDIRECT_RECOVERY_STORAGE_KEY).catch(
    () => undefined,
  );
}

/**
 * Returns null for every unrelated app link and for a callback that belongs to
 * the live AuthSession. A recreated Android process has no live flag, so it
 * safely validates the persisted PKCE state before exchanging the code.
 */
export async function recoverGoogleAuthRedirect(
  url: string | null | undefined,
): Promise<RecoveredGoogleAuthRedirect | null> {
  if (!url || hasLiveGoogleAuthSession) return null;

  const pending = await readPendingGoogleAuthRedirect();
  if (!pending || !isMatchingRedirect(url, pending.redirectUri)) return null;

  try {
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
  } finally {
    // An authorization code is single-use. Keeping it after any completion or
    // failure would only invite a stale replay on a later app launch.
    await clearGoogleAuthRedirectRecovery();
  }
}
