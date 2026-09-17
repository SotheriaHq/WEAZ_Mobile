import { isAxiosError } from 'axios';

import { verifyEmail } from '@/src/api/AuthApi';

export type EmailVerificationOutcome =
  | { status: 'verified'; message: string }
  | { status: 'failed'; message: string; retryable: boolean };

/**
 * One verification per token, shared by everything that sees the link.
 *
 * The link reaches the app through more than one door (the launch URL, a `url`
 * event, the verify-email screen itself) and the screen can mount more than
 * once. Each used to be able to spend the token; the token is single-use, so the
 * second spend reports "invalid or expired" for an email that was just verified.
 * Keyed by token: every caller awaits the same request.
 *
 * A network failure (no response) is dropped from the map once it settles so the
 * next attempt really retries; a server answer is kept, because asking again
 * cannot change it.
 */
const attempts = new Map<string, Promise<EmailVerificationOutcome>>();

export function getVerifyEmailErrorMessage(error: unknown): string {
  const responseData = (error as any)?.response?.data;
  const candidates = [
    responseData?.message,
    responseData?.data?.message,
    responseData?.error,
    (error as any)?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return 'Unable to verify email. The link may be invalid or expired.';
}

export function verifyEmailTokenOnce(rawToken: string): Promise<EmailVerificationOutcome> {
  const token = String(rawToken ?? '').trim();
  const existing = attempts.get(token);
  if (existing) return existing;

  const attempt: Promise<EmailVerificationOutcome> = verifyEmail(token).then(
    (response) => ({
      status: 'verified',
      message: response?.message || 'Your email has been verified.',
    }),
    (error: unknown) => ({
      status: 'failed',
      message: getVerifyEmailErrorMessage(error),
      retryable: isAxiosError(error) && !error.response,
    }),
  );

  attempts.set(token, attempt);
  void attempt.then((outcome) => {
    if (outcome.status === 'failed' && outcome.retryable) {
      attempts.delete(token);
    }
  });
  return attempt;
}
