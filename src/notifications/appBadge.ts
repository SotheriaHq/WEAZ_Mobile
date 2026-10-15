import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

type ExpoNotificationsModule = typeof ExpoNotifications;

function isExpoGoAndroid() {
  return Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android';
}

async function getNotificationsModule(): Promise<ExpoNotificationsModule | null> {
  if (Platform.OS === 'web' || isExpoGoAndroid()) return null;
  try {
    return await Promise.resolve().then(() => require('expo-notifications') as ExpoNotificationsModule);
  } catch {
    return null;
  }
}

/**
 * Keep the app icon badge in lock-step with the backend unread count.
 * The backend stamps the same count on every push (outbox dispatcher), so the
 * badge stays truthful across devices; this covers the in-app side (reading
 * the inbox, marking items read) where no push arrives to refresh it.
 * Best-effort: badge APIs are unavailable on web / Expo Go Android and some
 * launchers ignore badges entirely — failures must never surface to the user.
 */
export async function syncAppBadgeCount(unreadCount: number): Promise<void> {
  const NotificationsModule = await getNotificationsModule();
  if (!NotificationsModule) return;
  try {
    const normalized = Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0;
    await NotificationsModule.setBadgeCountAsync(normalized);
  } catch {
    // Ignore — badge support varies by OS/launcher.
  }
}

export async function clearAppBadge(): Promise<void> {
  await syncAppBadgeCount(0);
}
