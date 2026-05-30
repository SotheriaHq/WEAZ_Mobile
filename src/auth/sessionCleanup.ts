import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';

import { clearBrandApiSessionCaches } from '@/src/api/BrandApi';
import { setApiAuthToken, setApiRefreshToken } from '@/src/api/httpClient';
import { env } from '@/src/config/env';
import { clearCachedMarketFeed } from '@/src/features/feed/api/feedApi';
import { MOBILE_PENDING_CHECKOUT_STORAGE_KEY } from '@/src/features/checkout/mobileCheckoutPending';
import { PERSISTED_FEED_CACHE_PREFIX } from '@/src/features/feed/utils/feedKeys';
import { clearResolvedImageUriCache } from '@/src/hooks/useResolvedImageUri';
import { deactivateRegisteredPushTokenForLogout } from '@/src/notifications/pushTokenRegistration';
import { queryClient as defaultQueryClient } from '@/src/query/queryClient';
import {
  purgeMobilePersistedQueryCache,
  THREADLY_QUERY_CACHE_STORAGE_KEY,
} from '@/src/query/queryPersistor';
import { queryKeys } from '@/src/query/queryKeys';
import { clearMessagingRealtimeSession } from '@/src/realtime/messaging';
import { clearNotificationRealtimeSession } from '@/src/realtime/notifications';
import { clearMobileMarketSignalQueue } from '@/src/services/marketSignals';
import { removeAccessToken, removeRefreshToken } from '@/src/storage/secureStorage';

export const ACTIVE_BRAND_STORAGE_KEY = 'threadly.activeBrandId';
const PENDING_BAG_ACTION_STORAGE_KEY = 'threadly.pendingBagAction.v1';

const PRIVATE_QUERY_ROOTS = new Set([
  'auth',
  'brand',
  'design',
  'designs',
  'store',
  'saved',
  'notifications',
  'messaging',
  'reviews',
]);

export function isMobilePrivateSessionQueryKey(queryKey: QueryKey) {
  const [root, scope] = queryKey;
  if (typeof root !== 'string') return false;
  if (root === 'media') return scope === 'signedUrl';
  return PRIVATE_QUERY_ROOTS.has(root);
}

export function clearMobilePrivateQueryCache(client: QueryClient = defaultQueryClient) {
  void client.cancelQueries({ predicate: (query) => isMobilePrivateSessionQueryKey(query.queryKey) });
  client.removeQueries({ predicate: (query) => isMobilePrivateSessionQueryKey(query.queryKey) });
  client.removeQueries({ queryKey: queryKeys.auth.profile(), exact: true });
  client.removeQueries({ queryKey: queryKeys.notifications.unreadCount(), exact: true });
  client.removeQueries({ queryKey: queryKeys.messaging.unreadCount(), exact: true });
}

export async function clearMobilePrivateAsyncStorage() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const privateKeys = keys.filter(
      (key) =>
        key === THREADLY_QUERY_CACHE_STORAGE_KEY ||
        key.startsWith(PERSISTED_FEED_CACHE_PREFIX) ||
        key === env.userStorageKey,
    );

    if (privateKeys.length > 0) {
      await AsyncStorage.multiRemove(privateKeys);
    }
  } catch {
    // AsyncStorage cleanup must not block logout.
  }
}

export async function clearMobilePrivateSessionState({
  client = defaultQueryClient,
  deactivatePushToken = true,
}: {
  client?: QueryClient;
  deactivatePushToken?: boolean;
} = {}) {
  if (deactivatePushToken) {
    await deactivateRegisteredPushTokenForLogout().catch(() => undefined);
  }

  setApiAuthToken(null);
  setApiRefreshToken(null);
  clearMobilePrivateQueryCache(client);
  clearNotificationRealtimeSession();
  clearMessagingRealtimeSession();
  clearBrandApiSessionCaches();
  clearResolvedImageUriCache();

  await Promise.allSettled([
    removeAccessToken(),
    removeRefreshToken(),
    SecureStore.deleteItemAsync(ACTIVE_BRAND_STORAGE_KEY),
    SecureStore.deleteItemAsync(PENDING_BAG_ACTION_STORAGE_KEY),
    SecureStore.deleteItemAsync(MOBILE_PENDING_CHECKOUT_STORAGE_KEY),
    SecureStore.deleteItemAsync(env.userStorageKey),
    purgeMobilePersistedQueryCache(),
    clearCachedMarketFeed(),
    clearMobileMarketSignalQueue(),
    clearMobilePrivateAsyncStorage(),
  ]);
}
