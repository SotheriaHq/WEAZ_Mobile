import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { analyticsPermitted } from '@/src/privacy/consent';
import { telemetryPath, telemetryUrl } from '@/src/privacy/telemetryUrl';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const dsn = String(extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
const tracesSampleRate = Number(extra.sentryTracesSampleRate ?? 0.1);

type ScrubbableEvent = {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> };
  transaction?: string;
};

/** Reports carry the route, never the tokens, emails or references in its address. */
const scrubEvent = <T extends ScrubbableEvent>(event: T): T => {
  if (event.request) {
    if (event.request.url) event.request.url = telemetryUrl(event.request.url);
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers.Referer;
      delete event.request.headers.referer;
    }
  }
  if (event.transaction?.startsWith('/')) event.transaction = telemetryPath(event.transaction);
  return event;
};

const scrubBreadcrumb = (breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb => {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  for (const key of ['url', 'from', 'to'] as const) {
    if (typeof data[key] === 'string') data[key] = telemetryUrl(data[key] as string);
  }
  return breadcrumb;
};

/**
 * Error reports are essential (no personal data) and start at launch.
 * Performance tracing measures how people use the app, so it samples only
 * while they allow analytics — see `src/privacy/consent`.
 */
export function initMobileSentry(): void {
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: String(extra.sentryEnvironment ?? process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'development'),
    release: String(extra.sentryRelease ?? process.env.EXPO_PUBLIC_SENTRY_RELEASE ?? '').trim() || undefined,
    tracesSampler: () => (analyticsPermitted() ? tracesSampleRate : 0),
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

export function captureMobileException(
  error: unknown,
  context?: Record<string, string>,
): void {
  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureException(error);
  });
}

export { Sentry };