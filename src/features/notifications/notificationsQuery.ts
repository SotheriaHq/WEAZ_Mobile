import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { preloadQuery } from '@/src/cache/cachedQuery';
import { cachePolicies } from '@/src/cache/policies';
import { queryKeys } from '@/src/query/queryKeys';
import { replaceUnreadNotificationCount } from '@/src/realtime/notifications';

/** How many notifications the screen shows, and the warm-up fetches. */
const NOTIFICATIONS_PAGE_SIZE = 100;

/**
 * The notifications list, as one cache entry shared by the screen and warm-up.
 *
 * Both must use the same key, fetcher and policy, or a warm-up fills an entry
 * the screen never reads and the first open still waits on the network.
 */
export function notificationsListQuery(userId: string | null | undefined) {
  return {
    key: queryKeys.notifications.list(userId),
    fetcher: async (): Promise<MobileNotification[]> => {
      const [response, unread] = await Promise.all([
        NotificationsApi.list(undefined, NOTIFICATIONS_PAGE_SIZE),
        NotificationsApi.getUnreadCount(),
      ]);
      replaceUnreadNotificationCount(unread.count);
      return response.items;
    },
    policy: cachePolicies.defaultQuery,
  };
}

/**
 * Fetch the list before the bell is pressed.
 *
 * The 2026-10-18 capture had the first Notifications open as a cache miss: a
 * loader, then every row mounted in the same commit as the response. Warmed,
 * the screen paints its rows on the push itself. A fresh entry is not
 * refetched, and a failure is silent — the screen still loads on its own.
 */
export function warmNotificationsList(userId: string | null | undefined): void {
  if (!userId) return;
  void preloadQuery(notificationsListQuery(userId)).catch(() => undefined);
}
