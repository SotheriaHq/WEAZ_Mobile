import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const dsn = String(extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

export function initMobileSentry(): void {
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: String(extra.sentryEnvironment ?? process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'development'),
    release: String(extra.sentryRelease ?? process.env.EXPO_PUBLIC_SENTRY_RELEASE ?? '').trim() || undefined,
    tracesSampleRate: Number(extra.sentryTracesSampleRate ?? 0.1),
    sendDefaultPii: false,
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