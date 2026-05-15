import { useEffect, useRef } from 'react';
import { router, usePathname } from 'expo-router';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type * as Notifications from 'expo-notifications';
import { resolveExpoProjectId } from '@/src/notifications/pushTokenRegistration';

/**
 * Check if running in Expo Go on Android
 */
const isExpoGo = (): boolean => Constants.executionEnvironment === 'storeClient';
const isExpoGoAndroid = (): boolean => isExpoGo() && Platform.OS === 'android';

type ExpoNotificationsModule = typeof import('expo-notifications');

let notificationsModulePromise: Promise<ExpoNotificationsModule | null> | null = null;
let pushConfigurationPromise: Promise<{
  token?: string;
  error?: string;
  unsupported?: boolean;
}> | null = null;

function supportsNativeNotificationModule() {
  return !isExpoGoAndroid();
}

async function getNotificationsModule() {
  if (!supportsNativeNotificationModule()) return null;
  notificationsModulePromise ??= import('expo-notifications').catch((error) => {
    if (__DEV__) {
      console.warn('Unable to load expo-notifications:', error);
    }
    return null;
  });
  return notificationsModulePromise;
}

import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import type { MessageContextParams } from '@/src/types/messaging';

import {
  getMessageNotificationTarget,
  normalizeNotificationContext,
} from './mobileRouting';

/**
 * Notification routing handler for message notifications.
 * Processes incoming notifications and routes to appropriate screen.
 */
export function useNotificationRouting() {
  const { status, user } = useAuth();
  const toast = useToast();
  const pathname = usePathname();

  // Track last handled notification to prevent duplicates
  const lastHandledNotificationRef = useRef<string | null>(null);
  const pendingNavigationRef = useRef<{
    params: MessageContextParams;
    type: 'thread' | 'inbox' | 'unsupported';
  } | null>(null);

  /**
   * Navigate to message thread or inbox based on context.
   * Handles deduplication to prevent double navigation.
   */
  const navigateToMessage = (
    context: MessageContextParams,
    options: { type: 'thread' | 'inbox' | 'unsupported' },
  ) => {
    // Don't navigate if not authenticated (except to auth screen)
    if (status !== 'authenticated' && status !== 'loading') {
      // Preserve the navigation intent to handle after login
      pendingNavigationRef.current = { params: context, type: options.type };
      return;
    }

    // Generate a navigation key to prevent duplicates
    const navKey = JSON.stringify({
      threadId: context.threadId,
      conversationId: context.conversationId,
      messageId: context.messageId,
      orderId: context.orderId,
      customOrderId: context.customOrderId,
      type: options.type,
    });

    // Prevent duplicate navigation within a short window
    if (lastHandledNotificationRef.current === navKey) {
      return;
    }
    lastHandledNotificationRef.current = navKey;

    try {
      if (options.type === 'unsupported') {
        // Navigate to inbox - unsupported contexts fall back to inbox
        router.replace('/(tabs)/inbox' as any);
        toast.info('Design/product-specific messages are not supported yet.');
        return;
      }

      if (options.type === 'inbox') {
        // Navigate to inbox (Messages list)
        if (pathname !== '/(tabs)/inbox') {
          router.replace('/(tabs)/inbox' as any);
        }
        return;
      }

      // Navigate to thread - build params for ChatThread
      const params: Record<string, any> = {};

      if (context.threadId) params.threadId = context.threadId;
      if (context.conversationId) params.conversationId = context.conversationId;
      if (context.messageId) params.messageId = context.messageId;
      if (context.orderId) params.orderId = context.orderId;
      if (context.customOrderId) params.customOrderId = context.customOrderId;
      if (context.brandId) params.brandId = context.brandId;
      if (context.customerId) params.customerId = context.customerId;

      // Only navigate if not already on the messages screen with same params
      const isAlreadyOnMessages = pathname === '/messages/[threadId]';
      if (!isAlreadyOnMessages) {
        router.replace({ pathname: '/messages/[threadId]', params } as any);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      toast.error('Unable to open message');
    }
  };

  /**
   * Handle a notification tap or deep link.
   */
  const handleNotification = (
    notification: Notifications.Notification | null,
  ) => {
    if (!notification) return;

    const payload = notification.request?.content?.data ?? {};
    const target = getMessageNotificationTarget(payload as Record<string, unknown>);

    if (target) {
      navigateToMessage(target.params, target);
    }
  };

  /**
   * Handle URL deep linking.
   */
  const handleDeepLink = (url: string | null) => {
    if (!url) return;

    try {
      const parsed = Linking.parse(url);
      const path = parsed.path || '';

      // Check if it's a message-related URL
      if (path.startsWith('/messages') || path.startsWith('/inbox')) {
        // Extract params from URL
        const params: MessageContextParams = {};

        if (parsed.queryParams?.threadId) {
          params.threadId = String(parsed.queryParams.threadId);
        }
        if (parsed.queryParams?.conversationId) {
          params.conversationId = String(parsed.queryParams.conversationId);
        }
        if (parsed.queryParams?.messageId) {
          params.messageId = String(parsed.queryParams.messageId);
        }
        if (parsed.queryParams?.orderId) {
          params.orderId = String(parsed.queryParams.orderId);
        }
        if (parsed.queryParams?.customOrderId) {
          params.customOrderId = String(parsed.queryParams.customOrderId);
        }
        if (parsed.queryParams?.brandId) {
          params.brandId = String(parsed.queryParams.brandId);
        }
        if (parsed.queryParams?.customerId) {
          params.customerId = String(parsed.queryParams.customerId);
        }

        const target = getMessageNotificationTarget(params);
        if (target) {
          navigateToMessage(target.params, target);
        }
      }
    } catch (error) {
      console.error('Deep link parsing error:', error);
    }
  };

  return {
    handleNotification,
    handleDeepLink,
    pendingNavigation: pendingNavigationRef.current,
    clearPendingNavigation: () => {
      pendingNavigationRef.current = null;
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
  if (!supportsNativeNotificationModule()) {
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
      await NotificationsModule.setNotificationChannelAsync('default', {
        name: 'default',
        importance: NotificationsModule.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
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
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
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
  notification: Notifications.Notification | null;
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
  onNotificationReceived: (notification: Notifications.Notification) => void,
  onNotificationResponse: (response: Notifications.NotificationResponse) => void,
): () => void {
  let mounted = true;
  let cleanup: (() => void) | null = null;

  void getNotificationsModule().then((NotificationsModule) => {
    if (!mounted || !NotificationsModule) return;

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
