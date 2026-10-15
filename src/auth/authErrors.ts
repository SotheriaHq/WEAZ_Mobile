/**
 * Typed auth failures, so screens can branch on what happened instead of
 * pattern-matching English out of `error.message`.
 *
 * The rule these exist to enforce: nothing an engineer wrote for an engineer
 * reaches a toast. "Google did not return an ID token." told a user nothing they
 * could act on and read like a crash. Only two sources are trusted to speak to
 * the person holding the phone — `GoogleSignInError`, whose copy is written for
 * that screen, and `AuthRequestError`, which carries the API's own human-written
 * message. Everything else gets the generic line.
 */

/**
 * Why a Google sign-in did not produce an ID token.
 *
 * These were once a single `'unavailable'` bucket, and six unrelated faults all
 * surfaced as "We couldn't finish signing you in with Google. Please try again
 * in a moment." — a sentence that invites a retry for three causes where
 * retrying can never work. A build with no client IDs and a token exchange that
 * came back empty are not the same event, and on a release build (no console,
 * no dev banner) the toast is the ONLY thing anyone can see.
 */
export type GoogleSignInFailure =
  /** The user backed out of the Google sheet. Not an error — do not toast it. */
  | 'cancelled'
  /** This build shipped without `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`. Retrying cannot help. */
  | 'not-configured'
  /** The auth request or its PKCE material has not finished loading yet. */
  | 'not-ready'
  /** `expo-auth-session` already has a session open; only one can run at a time. */
  | 'already-running'
  /** Google returned from the browser without an authorization code. */
  | 'no-code'
  /** The code exchanged, but Google's response carried no ID token. */
  | 'no-token'
  /** Anything not covered above. */
  | 'unavailable';

export class GoogleSignInError extends Error {
  readonly reason: GoogleSignInFailure;
  /** Short tag echoed in the toast so a report names the branch, not the symptom. */
  readonly code: string;

  constructor(reason: GoogleSignInFailure, message: string, code: string) {
    super(message);
    this.name = 'GoogleSignInError';
    this.reason = reason;
    this.code = code;
  }
}

/**
 * The tag rides in the visible copy on purpose. Every failure below is one the
 * person holding the phone cannot fix, so the only thing the message can
 * usefully do — beyond telling them to stop retrying — is name the branch for
 * whoever they report it to.
 */
const googleFailure = (
  reason: GoogleSignInFailure,
  code: string,
  message: string,
) => new GoogleSignInError(reason, `${message} (${code})`, code);

export const googleSignInCancelled = () =>
  new GoogleSignInError('cancelled', 'Google sign-in was cancelled.', 'GS-CANCELLED');

export const googleSignInNotConfigured = () =>
  googleFailure(
    'not-configured',
    'GS-CONFIG',
    "Google sign-in isn't available in this version of the app.",
  );

export const googleSignInNotReady = () =>
  googleFailure(
    'not-ready',
    'GS-READY',
    'Google sign-in is still starting up. Give it a moment and try again.',
  );

export const googleSignInAlreadyRunning = () =>
  googleFailure(
    'already-running',
    'GS-BUSY',
    'A Google sign-in is already open. Finish or close that one first.',
  );

export const googleSignInNoCode = () =>
  googleFailure(
    'no-code',
    'GS-NOCODE',
    'Google closed without completing sign-in. Please try again.',
  );

export const googleSignInNoToken = () =>
  googleFailure(
    'no-token',
    'GS-NOTOKEN',
    "Google signed you in, but didn't return a token we could use.",
  );

export const googleSignInUnavailable = () =>
  googleFailure(
    'unavailable',
    'GS-UNKNOWN',
    "We couldn't finish signing you in with Google. Please try again in a moment.",
  );

/**
 * An API auth failure that kept its `code`.
 *
 * The codes are the contract the backend branches the flow on — `GOOGLE_NO_ACCOUNT`
 * means "send them to sign up", `EMAIL_ALREADY_EXISTS` means "send them to log
 * in". Collapsing an axios error into `new Error(message)` threw the code away
 * and left the screen with nothing to route on.
 */
export class AuthRequestError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'AuthRequestError';
    this.code = options.code;
    this.status = options.status;
  }
}

/** Reads the backend's `code` off an axios-shaped error, if it sent one. */
export function extractAuthErrorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' && code.trim() ? code.trim() : undefined;
}

export const GENERIC_AUTH_ERROR_MESSAGE =
  'Something went wrong on our side. Please try again in a moment.';

/**
 * Toast copy for a failed sign-in. Falls back to the generic line rather than
 * surfacing an unvetted `error.message` — see the note at the top of this file.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof GoogleSignInError) return error.message;
  if (error instanceof AuthRequestError && error.message.trim()) return error.message;
  return GENERIC_AUTH_ERROR_MESSAGE;
}
