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

/** Why a Google sign-in did not produce an ID token. */
export type GoogleSignInFailure =
  /** The user backed out of the Google sheet. Not an error — do not toast it. */
  | 'cancelled'
  /** Anything else: misconfiguration, a failed code exchange, no token back. */
  | 'unavailable';

export class GoogleSignInError extends Error {
  readonly reason: GoogleSignInFailure;

  constructor(reason: GoogleSignInFailure, message: string) {
    super(message);
    this.name = 'GoogleSignInError';
    this.reason = reason;
  }
}

export const googleSignInCancelled = () =>
  new GoogleSignInError('cancelled', 'Google sign-in was cancelled.');

export const googleSignInUnavailable = () =>
  new GoogleSignInError(
    'unavailable',
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
