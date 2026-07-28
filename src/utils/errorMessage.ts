import { isAxiosError } from 'axios';

/**
 * Transforms technical API errors into clean, human-readable error messages for end users.
 * Never exposes raw internal engineering messages such as "timeout of 15000ms exceeded",
 * "Network Error", "ECONNABORTED", etc.
 */
export function getFriendlyErrorMessage(
  error: unknown,
  fallback: string = 'An unexpected error occurred. Please try again.',
): string {
  if (!error) return fallback;

  if (isAxiosError(error)) {
    // 1. Network / Timeout / Connection abort errors (no response from server)
    if (
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.toLowerCase().includes('timeout')
    ) {
      return 'Connection timed out. Please check your internet connection and try again.';
    }

    if (
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.message === 'Network Error'
    ) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }

    // 2. HTTP Status Code specific mappings
    const status = error.response.status;
    if (status === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (status >= 500) {
      return 'Something went wrong on our server. Please try again in a few moments.';
    }

    // 3. Backend custom error messages from payload
    const data = error.response.data as Record<string, unknown> | undefined;
    const candidates = [
      data?.message,
      (data?.data as Record<string, unknown> | undefined)?.message,
      data?.error,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        const msg = candidate.trim();
        const lower = msg.toLowerCase();

        if (msg.includes('ThrottlerException') || lower.includes('too many requests')) {
          return 'Too many requests. Please try again later.';
        }
        if (
          lower.includes('invalid') ||
          lower.includes('unauthorized') ||
          lower.includes('not found') ||
          lower.includes('incorrect')
        ) {
          return 'Invalid credentials';
        }
        if (lower.includes('timeout') || lower.includes('econnaborted')) {
          return 'Connection timed out. Please check your internet connection and try again.';
        }

        return msg;
      }
    }
  }

  // Handle standard JS Error objects or string errors
  const rawMsg =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message.trim()
      : String(error);

  const lowerRaw = rawMsg.toLowerCase();
  if (lowerRaw.includes('timeout') || lowerRaw.includes('econnaborted')) {
    return 'Connection timed out. Please check your internet connection and try again.';
  }
  if (
    lowerRaw.includes('network error') ||
    lowerRaw.includes('failed to fetch') ||
    lowerRaw.includes('err_network')
  ) {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
  if (lowerRaw.includes('throttlerexception') || lowerRaw.includes('too many requests')) {
    return 'Too many requests. Please try again later.';
  }
  if (
    lowerRaw.includes('invalid') ||
    lowerRaw.includes('unauthorized') ||
    lowerRaw.includes('incorrect')
  ) {
    return 'Invalid credentials';
  }

  // Fall back if message is an ugly technical string or stack artifact
  if (
    rawMsg.startsWith('AxiosError') ||
    rawMsg.startsWith('TypeError') ||
    rawMsg.startsWith('ReferenceError') ||
    rawMsg.includes('ms exceeded') ||
    rawMsg.includes('[object Object]')
  ) {
    return fallback;
  }

  return rawMsg || fallback;
}
