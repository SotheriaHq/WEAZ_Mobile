import { useCallback, useEffect, useRef, useState } from 'react';
import type * as ExpoNotificationsType from 'expo-notifications';
import { AppState, Linking, Platform } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import { getApiSecurityIdentity, getApiSessionScope } from '@/src/api/httpClient';
import {
  describePushDeviceStatus,
  describePushSkipReason,
  registerAuthenticatedPushToken,
  usePushRegistrationState,
  type PushDeviceStatus,
} from '@/src/notifications/pushTokenRegistration';

export type DevicePermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

async function readDevicePermissionStatus(): Promise<DevicePermissionStatus> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const ExpoNotifications = await Promise.resolve().then(
      () => require('expo-notifications') as typeof ExpoNotificationsType,
    );
    const permissions = await ExpoNotifications.getPermissionsAsync();
    if (permissions.status === ExpoNotifications.PermissionStatus.GRANTED) return 'granted';
    if (permissions.status === ExpoNotifications.PermissionStatus.DENIED) return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/*
  One registration attempt at a time, app-wide.

  The overview and a section screen are mounted together and both watch this
  phone. Without a shared attempt, each would start its own registration on
  first sight and on every return from the phone's settings.
*/
let attemptInFlight: { key: string; promise: Promise<unknown> } | null = null;
let firstSightCheckedFor: string | null = null;

export type NotificationDeviceController = {
  permission: DevicePermissionStatus;
  status: PushDeviceStatus;
  /** A sentence explaining a failed or skipped registration, or null. */
  detail: string | null;
  retrying: boolean;
  /** Try registering this phone again (the "Try again" button). */
  retry: () => void;
  openPhoneSettings: () => Promise<boolean>;
};

/**
 * This phone's side of push: the OS permission and whether WIEZ holds a token.
 *
 * Device recovery: coming back from the phone's settings re-reads the
 * permission, and if it has just been allowed while push is on in WIEZ, the
 * phone registers again by itself — the user should not have to find a retry
 * button after doing what the warning asked.
 */
export function useNotificationDevice(pushEnabled: boolean): NotificationDeviceController {
  const { status: authStatus, token, user } = useAuth();
  const userId = authStatus === 'authenticated' ? user?.id ?? null : null;
  const registration = usePushRegistrationState();
  const sessionIdentity = getApiSecurityIdentity();
  const sessionScope = getApiSessionScope();
  const attemptKey = `${userId}:${sessionScope}`;
  const [permission, setPermissionState] = useState<DevicePermissionStatus>('unavailable');
  const permissionRef = useRef<DevicePermissionStatus>('unavailable');
  const setPermission = useCallback((next: DevicePermissionStatus) => {
    permissionRef.current = next;
    setPermissionState(next);
  }, []);
  const [retrying, setRetrying] = useState(false);

  const register = useCallback(
    (force: boolean) => {
      if (!userId || !pushEnabled || sessionIdentity?.split(':')[0] !== userId ||
        getApiSessionScope() !== sessionScope) return Promise.resolve();
      if (attemptInFlight?.key === attemptKey) return attemptInFlight.promise;
      setRetrying(true);
      const attempt = registerAuthenticatedPushToken({ userId, authToken: token, force })
        .then(async (result) => {
          if (result.status === 'skipped' && result.reason === 'permission-denied') {
            setPermission('denied');
            return;
          }
          setPermission(await readDevicePermissionStatus());
        })
        .catch(() => undefined)
        .finally(() => {
          if (attemptInFlight?.promise === attempt) attemptInFlight = null;
          setRetrying(false);
        });
      attemptInFlight = { key: attemptKey, promise: attempt };
      return attempt;
    },
    [attemptKey, pushEnabled, sessionIdentity, sessionScope, setPermission, token, userId],
  );

  useEffect(() => {
    let active = true;
    void readDevicePermissionStatus().then((next) => {
      if (active) setPermission(next);
    });
    return () => {
      active = false;
    };
  }, [setPermission]);

  // First sight of push being on with no outcome yet: check once per account.
  useEffect(() => {
    if (!userId) return;
    if (!pushEnabled) {
      if (firstSightCheckedFor === attemptKey) firstSightCheckedFor = null;
      return;
    }
    if (registration.result?.status === 'registered' ||
      (registration.result?.status === 'skipped' && registration.result.reason === 'already-registered')) return;
    if (firstSightCheckedFor === attemptKey) return;
    firstSightCheckedFor = attemptKey;
    void register(false);
  }, [attemptKey, pushEnabled, register, registration.result, userId]);

  // Back from the phone's settings.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void readDevicePermissionStatus().then((latest) => {
        const previous = permissionRef.current;
        setPermission(latest);
        if (latest === 'granted' && previous !== 'granted' && pushEnabled) {
          void register(true);
        }
      });
    });
    return () => subscription.remove();
  }, [pushEnabled, register, setPermission]);

  const result = registration.result;
  const detail =
    result &&
    (result.status === 'failed' ||
      (result.status === 'skipped' &&
        result.reason !== 'already-registered' &&
        result.reason !== 'permission-denied'))
      ? describePushSkipReason(result.reason)
      : null;

  const openPhoneSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    permission,
    status: describePushDeviceStatus(result),
    detail,
    retrying,
    retry: () => {
      void register(true);
    },
    openPhoneSettings,
  };
}

/** Tests only. */
export function resetNotificationDeviceAttempts() {
  attemptInFlight = null;
  firstSightCheckedFor = null;
}
