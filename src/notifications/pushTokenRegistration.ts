import { useEffect, useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

import {
  NotificationsApi,
  type PushPlatform,
  type RegisterPushTokenPayload,
} from '@/src/api/NotificationsApi';
import { getActiveApiBaseUrl } from '@/src/api/httpClient';
import { ensureAndroidPushChannels } from '@/src/notifications/pushChannels';

type ExpoNotificationsModule = typeof ExpoNotifications;

export type PushRegistrationRecord = {
  userId: string;
  token: string;
  platform: PushPlatform;
  appVersion?: string | null;
  expoProjectId?: string | null;
  registeredAt?: number | null;
};

/**
 * `skipped`: a gate this device or account closed (permission, preference).
 * `failed`: an attempt that broke, at the phone (`device`, no push token) or at
 * WIEZ (`server`, token not saved). The settings screen shows them apart.
 */
export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; stage: 'device' | 'server'; reason: string };

const PUSH_REGISTRATION_STORAGE_KEY = 'wiez.pushTokenRegistration.v1';
const PUSH_REGISTRATION_REVALIDATION_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];

let inFlightRegistrationKey: string | null = null;
let inFlightRegistrationPromise: Promise<PushRegistrationResult> | null = null;
let lastSuccessfulRegistrationKey: string | null = null;
let lastSuccessfulRegistrationAt = 0;
let registrationEpoch = 0;

export type PushRegistrationState = {
  result: PushRegistrationResult | null;
  attemptedAt: number | null;
};
let registrationState: PushRegistrationState = { result: null, attemptedAt: null };
const registrationStateListeners = new Set<() => void>();

function publishRegistrationState(next: PushRegistrationState) {
  registrationState = next;
  registrationStateListeners.forEach((listener) => listener());
}

export function getPushRegistrationState(): PushRegistrationState {
  return registrationState;
}

export function subscribePushRegistrationState(listener: () => void): () => void {
  registrationStateListeners.add(listener);
  return () => {
    registrationStateListeners.delete(listener);
  };
}

/** The last attempt on this device, for the notification settings screen. */
export function usePushRegistrationState(): PushRegistrationState {
  return useSyncExternalStore(
    subscribePushRegistrationState,
    getPushRegistrationState,
    getPushRegistrationState,
  );
}

/**
 * Why the phone produced no push token. Android needs Firebase Cloud Messaging
 * built into the app (google-services.json); without it every attempt fails the
 * same way, so this is a build to replace, not an attempt to repeat.
 */
export function classifyDeviceRegistrationError(error: unknown): string {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return /firebase|google-services|\bfcm\b|SENDER_ID|MISSING_INSTANCEID/i.test(message)
    ? 'push-service-not-configured'
    : 'device-registration-failed';
}

export type PushDeviceStatus = {
  /** This phone: can it produce a push token? */
  phone: 'ready' | 'needs-app-update' | 'failed' | 'waiting-for-permission' | 'not-checked';
  /** WIEZ: has the server saved this phone for the account? */
  server: 'saved' | 'failed' | 'waiting' | 'not-checked';
  /** Whether trying again now could change the answer. */
  retryable: boolean;
};

/** The phone and server halves of the last attempt, for the settings screen. */
export function describePushDeviceStatus(result: PushRegistrationResult | null): PushDeviceStatus {
  if (!result) return { phone: 'not-checked', server: 'not-checked', retryable: true };
  if (
    result.status === 'registered' ||
    (result.status === 'skipped' && result.reason === 'already-registered')
  ) {
    return { phone: 'ready', server: 'saved', retryable: false };
  }
  if (result.status === 'failed') {
    if (result.stage === 'server') return { phone: 'ready', server: 'failed', retryable: true };
    return result.reason === 'push-service-not-configured'
      ? { phone: 'needs-app-update', server: 'waiting', retryable: false }
      : { phone: 'failed', server: 'waiting', retryable: true };
  }
  if (result.reason === 'permission-denied') {
    return { phone: 'waiting-for-permission', server: 'waiting', retryable: false };
  }
  return { phone: 'not-checked', server: 'not-checked', retryable: true };
}

/**
 * How long to wait before trying again on its own, or null when waiting cannot
 * help. `failures` counts the failed automatic attempts before this one. The
 * schedule is short and finite, so a broken phone or server is never polled.
 */
export function nextRegistrationRetryDelay(
  result: PushRegistrationResult,
  failures: number,
): number | null {
  const retryable =
    (result.status === 'failed' && result.reason !== 'push-service-not-configured') ||
    (result.status === 'skipped' && result.reason === 'push-settings-unavailable');
  return retryable ? (REGISTRATION_RETRY_DELAYS_MS[failures] ?? null) : null;
}

export function mapPlatformToPushPlatform(os: string | null | undefined): PushPlatform {
  if (os === 'ios') return 'IOS';
  if (os === 'android') return 'ANDROID';
  if (os === 'web') return 'WEB';
  return 'UNKNOWN';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function resolveExpoProjectId(
  constants: unknown = Constants,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const source = constants as {
    expoConfig?: { extra?: { eas?: { projectId?: unknown } } };
    easConfig?: { projectId?: unknown };
    manifest?: { extra?: { eas?: { projectId?: unknown } } };
    manifest2?: { extra?: { eas?: { projectId?: unknown } } };
  };

  return (
    readString(source.expoConfig?.extra?.eas?.projectId) ??
    readString(source.easConfig?.projectId) ??
    readString(source.manifest2?.extra?.eas?.projectId) ??
    readString(source.manifest?.extra?.eas?.projectId) ??
    readString(env.EXPO_PUBLIC_EAS_PROJECT_ID)
  );
}

function getAppVersion(constants: unknown = Constants): string | null {
  const source = constants as {
    expoConfig?: { version?: unknown };
    nativeApplicationVersion?: unknown;
  };

  return readString(source.nativeApplicationVersion) ?? readString(source.expoConfig?.version);
}

function isExpoGoAndroid() {
  return Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android';
}

async function getNotificationsModule() {
  if (Platform.OS === 'web' || isExpoGoAndroid()) return null;
  try {
    return await Promise.resolve().then(() => require('expo-notifications') as ExpoNotificationsModule);
  } catch (error) {
    console.warn('[Notifications] Native module expo-notifications is unavailable.', error);
    return null;
  }
}

async function ensureNotificationPermission(NotificationsModule: ExpoNotificationsModule) {
  const existingSettings = await NotificationsModule.getPermissionsAsync();
  let finalStatus = existingSettings.status;

  if (finalStatus !== NotificationsModule.PermissionStatus.GRANTED) {
    const { status } = await NotificationsModule.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
      android: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowVibrate: true,
        importance: NotificationsModule.AndroidImportance.DEFAULT,
        vibrationPattern: [200, 270, 270, 270],
      },
    });
    finalStatus = status;
  }

  return finalStatus === NotificationsModule.PermissionStatus.GRANTED;
}

async function ensureAndroidNotificationChannel(NotificationsModule: ExpoNotificationsModule) {
  if (Platform.OS !== 'android') return;
  await ensureAndroidPushChannels(NotificationsModule);
}

export function buildPushRegistrationKey(record: PushRegistrationRecord): string {
  return [
    record.userId,
    record.token,
    record.platform,
    record.appVersion ?? '',
    record.expoProjectId ?? '',
  ].join('|');
}

export function shouldRegisterPushToken(
  previous: PushRegistrationRecord | null | undefined,
  next: PushRegistrationRecord,
): boolean {
  return !previous || buildPushRegistrationKey(previous) !== buildPushRegistrationKey(next);
}

export function shouldRevalidatePushRegistration(
  record: PushRegistrationRecord | null | undefined,
  now = Date.now(),
): boolean {
  const registeredAt = Number(record?.registeredAt);
  return !Number.isFinite(registeredAt) || now - registeredAt >= PUSH_REGISTRATION_REVALIDATION_MS;
}

async function readStoredPushRegistration(): Promise<PushRegistrationRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(PUSH_REGISTRATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PushRegistrationRecord>;
    if (!parsed.userId || !parsed.token || !parsed.platform) return null;
    return {
      userId: String(parsed.userId),
      token: String(parsed.token),
      platform: parsed.platform,
      appVersion: parsed.appVersion ?? null,
      expoProjectId: parsed.expoProjectId ?? null,
      registeredAt:
        typeof parsed.registeredAt === 'number' && Number.isFinite(parsed.registeredAt)
          ? parsed.registeredAt
          : null,
    };
  } catch {
    return null;
  }
}

async function writeStoredPushRegistration(record: PushRegistrationRecord) {
  await SecureStore.setItemAsync(PUSH_REGISTRATION_STORAGE_KEY, JSON.stringify(record));
}

export async function clearStoredPushRegistration() {
  registrationEpoch += 1;
  lastSuccessfulRegistrationKey = null;
  lastSuccessfulRegistrationAt = 0;
  publishRegistrationState({ result: null, attemptedAt: null });
  await SecureStore.deleteItemAsync(PUSH_REGISTRATION_STORAGE_KEY).catch(() => undefined);
}

/**
 * Registers this device for the signed-in account, and records the outcome for
 * the settings screen. Never throws: a phone that cannot produce a token and a
 * server that cannot save it are both reported as `failed`, with the stage.
 *
 * `force` skips the "already registered" shortcut: a person pressing Retry, or
 * the OS rotating the push token, must reach the server.
 */
export async function registerAuthenticatedPushToken(params: {
  userId: string | null | undefined;
  authToken: string | null | undefined;
  requirePushEnabled?: boolean;
  force?: boolean;
}): Promise<PushRegistrationResult> {
  const result = await attemptPushRegistration(params);
  publishRegistrationState({ result, attemptedAt: Date.now() });
  return result;
}

async function attemptPushRegistration(params: {
  userId: string | null | undefined;
  authToken: string | null | undefined;
  requirePushEnabled?: boolean;
  force?: boolean;
}): Promise<PushRegistrationResult> {
  const userId = readString(params.userId);
  const authToken = readString(params.authToken);
  const apiBaseUrl = readString(getActiveApiBaseUrl());

  if (!userId || !authToken) return { status: 'skipped', reason: 'unauthenticated' };
  if (!apiBaseUrl) return { status: 'skipped', reason: 'api-base-url-missing' };
  if (isExpoGoAndroid()) return { status: 'skipped', reason: 'expo-go-android-unsupported' };
  // A sign-out anywhere below (it bumps the epoch) cancels this attempt.
  const registrationEpochAtStart = registrationEpoch;

  if (params.requirePushEnabled) {
    try {
      const settings = await NotificationsApi.getSettings();
      if (settings?.push?.enabled !== true) {
        return { status: 'skipped', reason: 'push-disabled' };
      }
    } catch {
      return { status: 'skipped', reason: 'push-settings-unavailable' };
    }
  }

  const expoProjectId = resolveExpoProjectId();
  if (!expoProjectId) {
    if (__DEV__) {
      console.warn(
        'Skipping push token registration: missing Expo EAS project ID. Set extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID.',
      );
    }
    return { status: 'skipped', reason: 'expo-project-id-missing' };
  }

  const NotificationsModule = await getNotificationsModule();
  if (!NotificationsModule) return { status: 'skipped', reason: 'notifications-unavailable' };

  const hasPermission = await ensureNotificationPermission(NotificationsModule);
  if (!hasPermission) return { status: 'skipped', reason: 'permission-denied' };

  let token: string | null;
  try {
    await ensureAndroidNotificationChannel(NotificationsModule);
    const { data } = await NotificationsModule.getExpoPushTokenAsync({ projectId: expoProjectId });
    token = readString(data);
  } catch (error) {
    if (__DEV__) console.warn('[Push] This phone could not produce a push token:', error);
    return { status: 'failed', stage: 'device', reason: classifyDeviceRegistrationError(error) };
  }
  if (!token) return { status: 'skipped', reason: 'expo-token-missing' };

  const platform = mapPlatformToPushPlatform(Platform.OS);
  const appVersion = getAppVersion();
  const nextRecord: PushRegistrationRecord = {
    userId,
    token,
    platform,
    appVersion,
    expoProjectId,
    registeredAt: Date.now(),
  };
  const nextKey = buildPushRegistrationKey(nextRecord);

  if (
    !params.force &&
    lastSuccessfulRegistrationKey === nextKey &&
    Date.now() - lastSuccessfulRegistrationAt < PUSH_REGISTRATION_REVALIDATION_MS
  ) {
    return { status: 'skipped', reason: 'already-registered' };
  }

  const previousRecord = await readStoredPushRegistration();
  if (
    !params.force &&
    !shouldRegisterPushToken(previousRecord, nextRecord) &&
    !shouldRevalidatePushRegistration(previousRecord)
  ) {
    lastSuccessfulRegistrationKey = nextKey;
    lastSuccessfulRegistrationAt = Number(previousRecord?.registeredAt) || Date.now();
    return { status: 'skipped', reason: 'already-registered' };
  }

  if (inFlightRegistrationKey === nextKey && inFlightRegistrationPromise) {
    return inFlightRegistrationPromise;
  }
  // One write at a time. The server gives the device token to whichever
  // account registers it last, so another account's write must land first.
  if (inFlightRegistrationPromise) {
    await inFlightRegistrationPromise.catch(() => undefined);
  }

  const payload: RegisterPushTokenPayload = {
    token,
    provider: 'EXPO',
    platform,
    appVersion: appVersion ?? undefined,
    expoProjectId,
  };

  if (registrationEpochAtStart !== registrationEpoch) {
    return { status: 'skipped', reason: 'registration-cancelled' };
  }

  // Sent as the account that started it (`asAccount`), never as whoever is
  // signed in by the time it leaves.
  inFlightRegistrationKey = nextKey;
  const write: Promise<PushRegistrationResult> = NotificationsApi.registerPushToken(payload, {
    asAccount: authToken,
  })
    .then(async (): Promise<PushRegistrationResult> => {
      if (registrationEpochAtStart !== registrationEpoch) {
        // That account signed out while this was in flight: undo it as itself.
        await NotificationsApi.deactivateCurrentPushToken(token, { asAccount: authToken }).catch(
          () => undefined,
        );
        return { status: 'skipped', reason: 'registration-cancelled' };
      }

      await writeStoredPushRegistration(nextRecord);
      lastSuccessfulRegistrationKey = nextKey;
      lastSuccessfulRegistrationAt = nextRecord.registeredAt ?? Date.now();
      return { status: 'registered', token };
    })
    .catch((error): PushRegistrationResult => {
      if (__DEV__) console.warn('[Push] WIEZ could not save this device:', error);
      return { status: 'failed', stage: 'server', reason: 'server-registration-failed' };
    })
    .finally(() => {
      if (inFlightRegistrationPromise === write) {
        inFlightRegistrationKey = null;
        inFlightRegistrationPromise = null;
      }
    });
  inFlightRegistrationPromise = write;

  return write;
}

/**
 * Stops pushes to this device for the account signing out.
 *
 * `asAccount` is that account's access token, captured before sign-out clears
 * the session: by the time this runs the API client has no token, and a
 * deactivation sent without one is refused, which left the phone receiving the
 * previous account's notifications. A registration still in flight lands first
 * so it cannot re-register the device afterwards.
 */
export async function deactivateRegisteredPushTokenForLogout(
  options: { asAccount?: string | null } = {},
): Promise<void> {
  if (inFlightRegistrationPromise) {
    await inFlightRegistrationPromise.catch(() => undefined);
  }
  const previousRecord = await readStoredPushRegistration();
  if (!previousRecord?.token) {
    await clearStoredPushRegistration();
    return;
  }

  try {
    await NotificationsApi.deactivateCurrentPushToken(previousRecord.token, {
      asAccount: readString(options.asAccount),
    });
  } catch {
    // Logout must not be blocked by a best-effort token cleanup call.
  } finally {
    await clearStoredPushRegistration();
  }
}

/**
 * Plain-English, actionable text for every reason registration can bail out.
 *
 * `registerAuthenticatedPushToken` has eight `skipped` paths and NONE of them
 * used to be surfaced anywhere: the hook below only caught thrown errors, and a
 * skip is a resolved promise. So a device that never registered a token looked
 * exactly like a device that did — no token on the server, no push, and nothing
 * on screen or in the logs saying which gate closed. "Push doesn't work" was
 * unanswerable without reading the source.
 *
 * Note there is NO environment gate in this file or in the backend's
 * `push-notifications.service.ts` — push is not disabled in dev. If it is not
 * arriving, it is one of these.
 */
export const PUSH_SKIP_EXPLANATIONS: Record<string, string> = {
  'expo-go-android-unsupported':
    'Expo Go on Android cannot receive push notifications (removed in SDK 53+). Test on a development build or a real release build.',
  'expo-project-id-missing':
    'No EAS project ID. Set extra.eas.projectId in app.json or EXPO_PUBLIC_EAS_PROJECT_ID, then restart Metro.',
  'notifications-unavailable':
    'expo-notifications is not available in this runtime. A development build is required.',
  'permission-denied':
    'Notification permission was denied for this device. Enable it in system settings.',
  'push-disabled': 'Push is turned off in this account’s notification settings.',
  'push-settings-unavailable':
    'Could not read notification settings from the API. Check the backend is reachable.',
  'expo-token-missing': 'Expo returned no push token for this device.',
  unauthenticated: 'Not signed in yet.',
  'api-base-url-missing': 'No API base URL configured for this build.',
  'push-service-not-configured':
    'This version of the app cannot receive notifications on this phone yet. An app update will fix it.',
  'device-registration-failed':
    'Your phone could not set up notifications just now. Check your connection and try again.',
  'server-registration-failed':
    'WIEZ could not save this phone for notifications just now. Check your connection and try again.',
  'registration-cancelled': 'Signed out before this phone finished registering.',
  'already-registered': 'This phone is already set up for notifications.',
};

export function describePushSkipReason(reason: string): string {
  return PUSH_SKIP_EXPLANATIONS[reason] ?? `Push registration skipped: ${reason}.`;
}

export function useAuthenticatedPushTokenRegistration(params: {
  authenticated: boolean;
  userId: string | null | undefined;
  authToken: string | null | undefined;
}) {
  const { authenticated, userId, authToken } = params;

  useEffect(() => {
    if (!authenticated || !userId || !authToken) return;

    let cancelled = false;
    let running = false;
    // A token rotation during an attempt: run once more afterwards, forced.
    let rerunForced = false;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tokenSubscription: { remove(): void } | null = null;

    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    // One attempt at a time per session. A failure schedules the next from a
    // short finite list; success, sign-out or this effect ending stops it.
    const attempt = (force = false) => {
      if (cancelled) return;
      if (running) {
        rerunForced = rerunForced || force;
        return;
      }
      running = true;
      clearRetry();
      void registerAuthenticatedPushToken({ userId, authToken, requirePushEnabled: true, force })
        .then((result) => {
          running = false;
          if (cancelled) return;
          if (rerunForced) {
            rerunForced = false;
            attempt(true);
            return;
          }
          if (__DEV__ && result.status !== 'registered') {
            // The single most useful line in the log when push "doesn't work".
            console.warn(
              `[Push] Not registered (${result.reason}). ${describePushSkipReason(result.reason)}`,
            );
          } else if (__DEV__) {
            console.log('[Push] Device token registered with the API.');
          }
          if (result.status === 'registered') {
            failures = 0;
            return;
          }
          const delay = nextRegistrationRetryDelay(result, failures);
          if (delay === null) return;
          failures += 1;
          retryTimer = setTimeout(() => attempt(), delay);
        });
    };

    attempt();

    // Coming back to the app is when a restored connection, a permission
    // granted in system settings or a fixed server shows up. Retry then, once,
    // unless this device is already registered; leaving pauses the schedule.
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        clearRetry();
        return;
      }
      if (getPushRegistrationState().result?.status === 'registered') return;
      failures = 0;
      attempt();
    });

    // The OS can replace the push token at any time; the server must get the
    // new one or pushes go to a token that no longer exists.
    void getNotificationsModule().then((NotificationsModule) => {
      if (cancelled || !NotificationsModule) return;
      tokenSubscription = NotificationsModule.addPushTokenListener(() => attempt(true));
    });

    return () => {
      cancelled = true;
      clearRetry();
      appStateSubscription.remove();
      tokenSubscription?.remove();
    };
  }, [authenticated, userId, authToken]);
}
