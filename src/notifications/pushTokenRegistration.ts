import { useEffect } from 'react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

import {
  NotificationsApi,
  type PushPlatform,
  type RegisterPushTokenPayload,
} from '@/src/api/NotificationsApi';
import { getActiveApiBaseUrl } from '@/src/api/httpClient';

type ExpoNotificationsModule = typeof ExpoNotifications;

export type PushRegistrationRecord = {
  userId: string;
  token: string;
  platform: PushPlatform;
  appVersion?: string | null;
  expoProjectId?: string | null;
};

type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'skipped'; reason: string };

const PUSH_REGISTRATION_STORAGE_KEY = 'threadly.pushTokenRegistration.v1';

let inFlightRegistrationKey: string | null = null;
let inFlightRegistrationPromise: Promise<PushRegistrationResult> | null = null;
let lastSuccessfulRegistrationKey: string | null = null;
let registrationEpoch = 0;

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

  await NotificationsModule.setNotificationChannelAsync('default', {
    name: 'default',
    importance: NotificationsModule.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
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
  await SecureStore.deleteItemAsync(PUSH_REGISTRATION_STORAGE_KEY).catch(() => undefined);
}

export async function registerAuthenticatedPushToken(params: {
  userId: string | null | undefined;
  authToken: string | null | undefined;
  requirePushEnabled?: boolean;
}): Promise<PushRegistrationResult> {
  const userId = readString(params.userId);
  const authToken = readString(params.authToken);
  const apiBaseUrl = readString(getActiveApiBaseUrl());

  if (!userId || !authToken) return { status: 'skipped', reason: 'unauthenticated' };
  if (!apiBaseUrl) return { status: 'skipped', reason: 'api-base-url-missing' };
  if (isExpoGoAndroid()) return { status: 'skipped', reason: 'expo-go-android-unsupported' };

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

  await ensureAndroidNotificationChannel(NotificationsModule);

  const { data } = await NotificationsModule.getExpoPushTokenAsync({ projectId: expoProjectId });
  const token = readString(data);
  if (!token) return { status: 'skipped', reason: 'expo-token-missing' };

  const platform = mapPlatformToPushPlatform(Platform.OS);
  const appVersion = getAppVersion();
  const nextRecord: PushRegistrationRecord = {
    userId,
    token,
    platform,
    appVersion,
    expoProjectId,
  };
  const nextKey = buildPushRegistrationKey(nextRecord);

  if (lastSuccessfulRegistrationKey === nextKey) {
    return { status: 'skipped', reason: 'already-registered' };
  }

  const previousRecord = await readStoredPushRegistration();
  if (!shouldRegisterPushToken(previousRecord, nextRecord)) {
    lastSuccessfulRegistrationKey = nextKey;
    return { status: 'skipped', reason: 'already-registered' };
  }

  if (inFlightRegistrationKey === nextKey && inFlightRegistrationPromise) {
    return inFlightRegistrationPromise;
  }

  const payload: RegisterPushTokenPayload = {
    token,
    provider: 'EXPO',
    platform,
    appVersion: appVersion ?? undefined,
    expoProjectId,
  };
  const registrationEpochAtStart = registrationEpoch;

  inFlightRegistrationKey = nextKey;
  inFlightRegistrationPromise = NotificationsApi.registerPushToken(payload)
    .then(async () => {
      if (registrationEpochAtStart !== registrationEpoch) {
        await NotificationsApi.deactivateCurrentPushToken(token).catch(() => undefined);
        return { status: 'skipped', reason: 'registration-cancelled' } as const;
      }

      await writeStoredPushRegistration(nextRecord);
      lastSuccessfulRegistrationKey = nextKey;
      return { status: 'registered', token } as const;
    })
    .finally(() => {
      inFlightRegistrationKey = null;
      inFlightRegistrationPromise = null;
    });

  return inFlightRegistrationPromise;
}

export async function deactivateRegisteredPushTokenForLogout(): Promise<void> {
  const previousRecord = await readStoredPushRegistration();
  if (!previousRecord?.token) {
    await clearStoredPushRegistration();
    return;
  }

  try {
    await NotificationsApi.deactivateCurrentPushToken(previousRecord.token);
  } catch {
    // Logout must not be blocked by a best-effort token cleanup call.
  } finally {
    await clearStoredPushRegistration();
  }
}

export function useAuthenticatedPushTokenRegistration(params: {
  authenticated: boolean;
  userId: string | null | undefined;
  authToken: string | null | undefined;
}) {
  const { authenticated, userId, authToken } = params;

  useEffect(() => {
    if (!authenticated || !userId || !authToken) return;

    void registerAuthenticatedPushToken({
      userId,
      authToken,
      requirePushEnabled: true,
    }).catch((error) => {
      if (__DEV__) {
        console.warn('Push token registration failed:', error);
      }
    });
  }, [authenticated, userId, authToken]);
}
