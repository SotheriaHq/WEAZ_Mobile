import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';

import { clearBrandApiSessionCaches } from '@/src/api/BrandApi';
import { env } from '@/src/config/env';
import { setApiAuthToken, setApiRefreshToken } from '@/src/api/httpClient';
import { clearCachedMarketFeed } from '@/src/features/feed/api/feedApi';
import { MOBILE_PENDING_CHECKOUT_STORAGE_KEY } from '@/src/features/checkout/mobileCheckoutPending';
import {
  clearDesignEditorBackgroundTasks,
  DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY,
} from '@/src/features/design-editor/designEditorBackgroundTasks';
import { PERSISTED_FEED_CACHE_PREFIX } from '@/src/features/feed/utils/feedKeys';
import { clearResolvedImageUriCache } from '@/src/hooks/useResolvedImageUri';
import { clearAppBadge } from '@/src/notifications/appBadge';
import { deactivateRegisteredPushTokenForLogout } from '@/src/notifications/pushTokenRegistration';
import { queryClient as defaultQueryClient } from '@/src/query/queryClient';
import {
  purgeMobilePersistedQueryCache,
  WIEZ_QUERY_CACHE_STORAGE_KEY,
} from '@/src/query/queryPersistor';
import { queryKeys, PRIVATE_QUERY_ROOTS } from '@/src/query/queryKeys';
import { clearMessagingRealtimeSession } from '@/src/realtime/messaging';
import { clearNotificationRealtimeSession } from '@/src/realtime/notifications';
import { resetCustomOrdersAvailability } from '@/src/api/BuyerOrdersApi';
import { clearMobileMarketSignalQueue } from '@/src/services/marketSignals';
import { clearWarmScreenStateCache } from '@/src/state/screenWarmState';
import { removeAccessToken, removeCachedAuthUser, removeRefreshToken } from '@/src/storage/secureStorage';

export const ACTIVE_BRAND_STORAGE_KEY = 'wiez.activeBrandId';
const PENDING_BAG_ACTION_STORAGE_KEY = 'wiez.pendingBagAction.v1';

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
        key === WIEZ_QUERY_CACHE_STORAGE_KEY ||
        key === DESIGN_EDITOR_BACKGROUND_TASKS_STORAGE_KEY ||
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
  clearWarmScreenStateCache();
  clearResolvedImageUriCache();
  clearDesignEditorBackgroundTasks();
  // "This account type has no custom orders" is a per-account verdict, so it
  // must not survive into the next sign-in (brand → buyer would stay suppressed).
  resetCustomOrdersAvailability();

  await Promise.allSettled([
    clearAppBadge(),
    removeAccessToken(),
    removeRefreshToken(),
    SecureStore.deleteItemAsync(ACTIVE_BRAND_STORAGE_KEY),
    SecureStore.deleteItemAsync(PENDING_BAG_ACTION_STORAGE_KEY),
    SecureStore.deleteItemAsync(MOBILE_PENDING_CHECKOUT_STORAGE_KEY),
    removeCachedAuthUser(),
    purgeMobilePersistedQueryCache(),
    clearCachedMarketFeed(),
    clearMobileMarketSignalQueue(),
    clearMobilePrivateAsyncStorage(),
  ]);
}
