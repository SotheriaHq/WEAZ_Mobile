import { useCallback, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import { resolveExpoProjectId } from '@/src/notifications/pushTokenRegistration';
import { ensureAndroidPushChannels } from '@/src/notifications/pushChannels';
import { shouldPresentMessageForegroundPushNotification } from '@/src/realtime/messaging';

/**
 * Check if running in Expo Go on Android
 */
const isExpoGo = (): boolean => Constants.executionEnvironment === 'storeClient';
const isExpoGoAndroid = (): boolean => isExpoGo() && Platform.OS === 'android';

type ExpoNotificationsModule = typeof ExpoNotifications;
let pushConfigurationPromise: Promise<{
  token?: string;
  error?: string;
  unsupported?: boolean;
}> | null = null;

function getForegroundNotificationBehavior(notification?: ExpoNotifications.Notification | null) {
  const shouldPresent = shouldPresentMessageForegroundPushNotification(
    notification?.request?.content?.data ?? null,
  );

  return {
    shouldShowAlert: shouldPresent,
    shouldPlaySound: shouldPresent,
    shouldSetBadge: true,
    shouldShowBanner: shouldPresent,
    shouldShowList: shouldPresent,
  };
}

async function getNotificationsModule(): Promise<ExpoNotificationsModule | null> {
  if (isExpoGoAndroid()) return null;
  try {
    return await Promise.resolve().then(() => require('expo-notifications'));
  } catch (error) {
    console.warn('[Notifications] Native module expo-notifications is unavailable.', error);
    return null;
  }
}

import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';

import {
  buildNotificationFromPushData,
  getMessageNotificationTarget,
  routeForNotification,
} from './mobileRouting';
import { drillDownPush } from './mobileNavigation';
import { resolveMobileAuthRoute } from './authLinkRouting';

function resolvePaymentReturnRoute(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || `/${parsed.hostname}`;
    const isPaymentReturn =
      path === '/payment' ||
      path === '/bag/payment-return' ||
      path.endsWith('/bag/payment-return');
    if (!isPaymentReturn) {
      return null;
    }

    const reference = parsed.searchParams.get('reference')?.trim();
    if (!reference) {
      return null;
    }

    return {
      pathname: '/payment',
      params: {
        reference,
        gateway: parsed.searchParams.get('gateway')?.trim() || 'PAYSTACK',
        status: parsed.searchParams.get('status')?.trim() || undefined,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Notification routing handler for ALL notification types.
 *
 * A tapped push (foreground, background, or cold start) and an in-app deep link
 * are both adapted into the canonical `MobileNotification` shape and routed
 * through the SAME comprehensive `routeForNotification` map used by the in-app
 * notification inbox. This guarantees every notification type — messages,
 * orders, custom orders, comments, follows, patches, products, designs,
 * collections, posts, reviews, verification, size/fit, wishlist, etc. — opens
 * the exact content it references, not just messages.
 */
export function useNotificationRouting() {
  const { status, user } = useAuth();
  const toast = useToast();

  // Track the last handled notification to prevent duplicate navigation when the
  // cold-start resolver and the response listener both observe the same tap.
  const lastHandledKeyRef = useRef<string | null>(null);
  // Preserve a tapped-while-logged-out intent and flush it once auth is ready.
  const pendingNotificationRef = useRef<MobileNotification | null>(null);

  const navigateToNotification = useCallback(
    (notification: MobileNotification) => {
      if (status !== 'authenticated') {
        pendingNotificationRef.current = notification;
        return;
      }

      const navKey =
        notification.id ||
        JSON.stringify({
          type: notification.type,
          target: notification.target,
          targetUrl: notification.targetUrl,
        });
      if (lastHandledKeyRef.current === navKey) {
        return;
      }
      lastHandledKeyRef.current = navKey;

      // Surface the "not supported yet" hint for design/product-scoped message
      // threads (the resolver still falls back to the inbox for these).
      const upperType = String(notification.type || '').toUpperCase();
      if (upperType.includes('MESSAGE')) {
        const messageTarget = getMessageNotificationTarget({
          ...(notification.payload ?? {}),
          ...(notification.targetUrl ? { targetUrl: notification.targetUrl } : null),
        });
        if (messageTarget?.type === 'unsupported') {
          toast.info('Design/product-specific messages are not supported yet.');
        }
      }

      try {
        // Same as the in-app list: account-lifecycle notifications resolve to the
        // viewer's own home, which differs for brands and shoppers.
        const route = routeForNotification(notification, user);
        // Navigation lock (drillDownPush) dedupes same-target taps and rapid
        // double taps, and `push` keeps a coherent back stack from the launch tab.
        drillDownPush(route);
      } catch (error) {
        console.error('Notification routing error:', error);
        toast.error('Unable to open notification');
        return;
      }

      // Keep the unread badge + inbox consistent after a tap.
      if (notification.id && !notification.isRead) {
        void NotificationsApi.markAsRead(notification.id).catch(() => undefined);
      }
    },
    [status, toast, user],
  );

  // Flush any intent captured while unauthenticated once auth is ready.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const pending = pendingNotificationRef.current;
    if (!pending) return;
    pendingNotificationRef.current = null;
    navigateToNotification(pending);
  }, [navigateToNotification, status]);

  /**
   * Handle a notification tap (foreground/background/cold start).
   */
  const handleNotification = useCallback(
    (notification: ExpoNotifications.Notification | null) => {
      if (!notification) return;
      const data = notification.request?.content?.data ?? {};
      const built = buildNotificationFromPushData(data as Record<string, unknown>);
      if (built) {
        navigateToNotification(built);
      }
    },
    [navigateToNotification],
  );

  /**
   * Handle URL deep linking (auth + payment-return keep dedicated handling; all
   * other links route through the unified notification router).
   */
  const handleDeepLink = useCallback(
    (url: string | null) => {
      if (!url) return;

      try {
        const authRoute = resolveMobileAuthRoute(url);
        if (authRoute) {
          router.replace(authRoute as any);
          return;
        }

        const paymentRoute = resolvePaymentReturnRoute(url);
        if (paymentRoute) {
          router.replace(paymentRoute as any);
          return;
        }

        const built = buildNotificationFromPushData({ targetUrl: url });
        if (built) {
          navigateToNotification(built);
        }
      } catch (error) {
        console.error('Deep link parsing error:', error);
      }
    },
    [navigateToNotification],
  );

  return {
    handleNotification,
    handleDeepLink,
    pendingNavigation: pendingNotificationRef.current,
    clearPendingNavigation: () => {
      pendingNotificationRef.current = null;
    },
  };
}

/**
 * Configure push notifications for the app.
 * Registers for push notifications and sets up handlers.
 */
export async function configurePushNotifications(): Promise<{
  token?: string;
  error?: string;
  unsupported?: boolean;
}> {
  if (pushConfigurationPromise) return pushConfigurationPromise;

  pushConfigurationPromise = configurePushNotificationsOnce();
  return pushConfigurationPromise;
}

async function configurePushNotificationsOnce(): Promise<{
  token?: string;
  error?: string;
  unsupported?: boolean;
}> {
  if (isExpoGoAndroid()) {
    return { error: 'Push notifications are not available in Expo Go on Android.', unsupported: true };
  }

  const NotificationsModule = await getNotificationsModule();
  if (!NotificationsModule) {
    return { error: 'expo-notifications is unavailable.', unsupported: true };
  }

  try {
    // Get existing permission
    const existingSettings = await NotificationsModule.getPermissionsAsync();
    let finalStatus = existingSettings.status;

    // Request permission if not granted
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

    if (finalStatus !== NotificationsModule.PermissionStatus.GRANTED) {
      return { error: 'Permission for push notifications not granted' };
    }

    // Get push token - skip in Expo Go on Android SDK 53+
    let token: string | undefined;
    if (Platform.OS === 'android') {
      await ensureAndroidPushChannels(NotificationsModule);
    }

    const projectId = resolveExpoProjectId();

    if (!isExpoGo() && projectId) {
      try {
        const { data: expoPushToken } = await NotificationsModule.getExpoPushTokenAsync({
          projectId,
        });
        token = expoPushToken;
      } catch (tokenError) {
        console.warn('Failed to get push token:', tokenError);
      }
    } else if (!isExpoGo() && __DEV__) {
      console.warn(
        'Skipping push token acquisition: missing Expo EAS project ID. Set extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID.',
      );
    }

    // Configure notification handlers
    NotificationsModule.setNotificationHandler({
      handleNotification: async (notification) => getForegroundNotificationBehavior(notification),
    });

    return { token };
  } catch (error) {
    console.warn('Push notification configuration error:', error);
    return { error: 'Failed to configure push notifications' };
  }
}

/**
 * Handle initial notification when app starts from cold state.
 * Returns the notification that launched the app, if any.
 */
export async function handleInitialNotification(): Promise<{
  notification: ExpoNotifications.Notification | null;
  error?: string;
}> {
  const NotificationsModule = await getNotificationsModule();
  if (!NotificationsModule) {
    return { notification: null };
  }
  try {
    const response = await NotificationsModule.getLastNotificationResponseAsync();
    return { notification: response?.notification || null };
  } catch (error) {
    console.warn('Initial notification error:', error);
    return { notification: null, error: 'Failed to get initial notification' };
  }
}

/**
 * Set up listeners for notification events.
 * Returns unsubscribe function.
 */
export function setupNotificationListeners(
  onNotificationReceived: (notification: ExpoNotifications.Notification) => void,
  onNotificationResponse: (response: ExpoNotifications.NotificationResponse) => void,
): () => void {
  let mounted = true;
  let cleanup: (() => void) | null = null;

  void getNotificationsModule().then((NotificationsModule) => {
    if (!mounted || !NotificationsModule) return;

    NotificationsModule.setNotificationHandler({
      handleNotification: async (notification) => getForegroundNotificationBehavior(notification),
    });

    // Listener for when notification is received while app is foreground
    const receivedSubscription = NotificationsModule.addNotificationReceivedListener(
      onNotificationReceived,
    );

    // Listener for when user taps on notification
    const responseSubscription = NotificationsModule.addNotificationResponseReceivedListener(
      onNotificationResponse,
    );

    cleanup = () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }).catch((error) => {
    console.warn('Failed to set up notification listeners:', error);
  });

  return () => {
    mounted = false;
    cleanup?.();
  };
}
