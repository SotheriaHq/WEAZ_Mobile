import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

import { apiClient, getApiSecurityIdentity } from '@/src/api/httpClient';
import { bindNativeSessionSocket } from './nativeSessionSocket';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { syncAppBadgeCount } from '@/src/notifications/appBadge';
import { queryClient, WIEZ_COUNT_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { markMarketFeedDirty } from '@/src/features/feed/api/feedApi';

/**
 * Notification types that mean the recipient's own content moved between review
 * states. When one arrives we eagerly refresh the catalogue tabs (In Review /
 * Public / etc.) so an approved design leaves "In Review" without a manual
 * refresh, and flag the runway feed for revalidation on next focus.
 */
const CONTENT_REVIEW_NOTIFICATION_TYPES = new Set([
  'CONTENT_REVIEW_APPROVED',
  'CONTENT_PUBLISHED',
  'CONTENT_CHANGES_REQUESTED',
  'CONTENT_REVIEW_REJECTED',
  'CONTENT_REVIEW_FAILED',
  'CONTENT_RESUBMITTED',
]);

function maybeHandleContentReviewNotification(payload: RealtimeNotification) {
  if (!payload || !CONTENT_REVIEW_NOTIFICATION_TYPES.has(String(payload.type))) return;
  // `['brand', 'collections']` is a prefix: every per-tab query carries its own
  // {scope,status} filter, so the broad prefix is what refetches all of them.
  void queryClient.invalidateQueries({ queryKey: ['brand', 'collections'] });
  void queryClient.invalidateQueries({ queryKey: ['designs', 'user'] });
  markMarketFeedDirty();
}

type RealtimeNotification = MobileNotification;
type NotificationDeletedPayload = {
  id?: string;
  unreadDelta?: number;
};

type NotificationListeners = {
  onCreated?: (notification: RealtimeNotification) => void;
  onDeleted?: (payload: NotificationDeletedPayload) => void;
  /** Events may have been missed: re-read the list from the server. */
  onResync?: () => void;
};

let socket: Socket | null = null;
let socketToken: string | null = null;
let socketUserId: string | null = null;
let unbindSession: (() => void) | null = null;
let activeSubscriptions = 0;

const createdListeners = new Set<(notification: RealtimeNotification) => void>();
const deletedListeners = new Set<(payload: NotificationDeletedPayload) => void>();
const resyncListeners = new Set<() => void>();
let lastResyncAt = 0;
/** Several triggers fire together on a resume; one round trip answers all. */
const RESYNC_MIN_GAP_MS = 2_000;

let unreadCount = 0;
const unreadCountListeners = new Set<() => void>();
let unreadCountRefreshPromise: Promise<boolean> | null = null;

function emitUnreadCount() {
  unreadCountListeners.forEach((listener) => listener());
}

function setUnreadCount(nextCount: number) {
  const normalized = Math.max(0, Math.floor(nextCount));
  if (normalized === unreadCount) return;
  unreadCount = normalized;
  queryClient.setQueryData(queryKeys.notifications.unreadCount(), { count: normalized });
  // Every unread mutation (inbox load, mark read, realtime, logout reset)
  // funnels through here, so the OS app-icon badge stays in lock-step with
  // the same backend count pushes stamp on delivery.
  void syncAppBadgeCount(normalized);
  emitUnreadCount();
}

function getSocketBaseUrl(): string | null {
  const baseUrl = String(apiClient.defaults.baseURL ?? '').trim();
  return baseUrl.length > 0 ? baseUrl.replace(/\/$/, '') : null;
}

function disconnectSocket() {
  unbindSession?.(); unbindSession = null;
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
  socketUserId = null;
}

function ensureSocket(token: string, userId: string) {
  if (getApiSecurityIdentity()?.split(':')[0] !== userId) return null;
  const baseUrl = getSocketBaseUrl();
  if (!baseUrl) return null;

  if (socket && socketToken === token && socketUserId === userId) {
    return socket;
  }

  disconnectSocket();

  socketToken = token;
  socketUserId = userId;
  socket = io(baseUrl, {
    autoConnect: false,
    transports: ['websocket'],
    withCredentials: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 10000,
  });
  unbindSession = bindNativeSessionSocket(socket);

  // The first connect follows the sign-in count read; every later one is a
  // reconnect after a gap in which events were not delivered to this device.
  let connectedBefore = false;
  socket.on('connect', () => {
    socket?.emit('join', { room: `USER:${userId}` });
    if (connectedBefore) resyncNotifications();
    connectedBefore = true;
  });

  socket.on('notification.created', (payload: RealtimeNotification) => {
    if (payload && payload.isRead === false) {
      setUnreadCount(unreadCount + 1);
    }
    maybeHandleContentReviewNotification(payload);
    createdListeners.forEach((listener) => listener(payload));
  });

  socket.on('notification.deleted', (payload: NotificationDeletedPayload) => {
    if (typeof payload?.unreadDelta === 'number' && payload.unreadDelta !== 0) {
      setUnreadCount(unreadCount + payload.unreadDelta);
    }
    deletedListeners.forEach((listener) => listener(payload));
  });

  socket.on('disconnect', () => {
    if (__DEV__) {
      console.log('[notifications] realtime socket disconnected');
    }
  });

  socket.connect();
  return socket;
}

/**
 * Catch up with what happened while this device was not listening.
 *
 * The socket only delivers events while it is connected, and Android drops it
 * as soon as the app is in the background — so whatever arrived meanwhile
 * (the "email verified" notice after tapping a link in Gmail, a push that came
 * in) never reached the in-app count or list. The push showed; the badge and
 * the inbox stayed stale until something unrelated refreshed them.
 *
 * Forces past the 30s count cache, marks the cached list stale so the next
 * open re-reads it, and tells a mounted Notifications screen to re-read now.
 * Called on reconnect, on return to the foreground, on a push received in the
 * foreground, and after email verification.
 */
export function resyncNotifications(): void {
  if (!getApiSecurityIdentity()) return;
  const now = Date.now();
  if (now - lastResyncAt < RESYNC_MIN_GAP_MS) return;
  lastResyncAt = now;
  void refreshUnreadNotificationCount({ authenticated: true, forceRefresh: true });
  void queryClient.invalidateQueries({
    queryKey: ['notifications', 'list'],
    refetchType: 'none',
  });
  resyncListeners.forEach((listener) => listener());
}

export function useUnreadNotificationCount(): number {
  return useSyncExternalStore(
    (listener) => {
      unreadCountListeners.add(listener);
      return () => unreadCountListeners.delete(listener);
    },
    () => unreadCount,
    () => unreadCount,
  );
}

export function replaceUnreadNotificationCount(nextCount: number) {
  setUnreadCount(nextCount);
}

export function incrementUnreadNotificationCount(delta = 1) {
  setUnreadCount(unreadCount + delta);
}

export function decrementUnreadNotificationCount(delta = 1) {
  setUnreadCount(unreadCount - delta);
}

export function resetUnreadNotificationCount() {
  setUnreadCount(0);
}

export function clearNotificationRealtimeSession() {
  disconnectSocket();
  activeSubscriptions = 0;
  unreadCountRefreshPromise = null;
  lastResyncAt = 0;
  resetUnreadNotificationCount();
  queryClient.removeQueries({ queryKey: queryKeys.notifications.unreadCount(), exact: true });
}

export async function refreshUnreadNotificationCount({
  authenticated,
  forceRefresh = false,
}: {
  authenticated: boolean;
  forceRefresh?: boolean;
}): Promise<boolean> {
  if (!authenticated) {
    resetUnreadNotificationCount();
    queryClient.removeQueries({ queryKey: queryKeys.notifications.unreadCount(), exact: true });
    return false;
  }

  if (unreadCountRefreshPromise) return unreadCountRefreshPromise;

  if (forceRefresh) {
    queryClient.removeQueries({ queryKey: queryKeys.notifications.unreadCount(), exact: true });
  }

  unreadCountRefreshPromise = queryClient
    .fetchQuery({
      queryKey: queryKeys.notifications.unreadCount(),
      queryFn: NotificationsApi.getUnreadCount,
      staleTime: WIEZ_COUNT_STALE_TIME_MS,
    })
    .then(({ count }) => {
      replaceUnreadNotificationCount(count);
      return true;
    })
    .catch(() => {
      resetUnreadNotificationCount();
      return false;
    })
    .finally(() => {
      unreadCountRefreshPromise = null;
    });

  return unreadCountRefreshPromise;
}

export function useNotificationRealtimeChannel({
  enabled = true,
  token,
  userId,
  onCreated,
  onDeleted,
  onResync,
}: {
  enabled?: boolean;
  token: string | null;
  userId: string | null;
} & NotificationListeners) {
  useEffect(() => {
    if (!enabled) return;
    if (onCreated) createdListeners.add(onCreated);

    return () => {
      if (onCreated) createdListeners.delete(onCreated);
    };
  }, [enabled, onCreated]);

  useEffect(() => {
    if (!enabled) return;
    if (onDeleted) deletedListeners.add(onDeleted);

    return () => {
      if (onDeleted) deletedListeners.delete(onDeleted);
    };
  }, [enabled, onDeleted]);

  useEffect(() => {
    if (!enabled || !onResync) return;
    resyncListeners.add(onResync);
    return () => {
      resyncListeners.delete(onResync);
    };
  }, [enabled, onResync]);

  useEffect(() => {
    if (!enabled || !token || !userId) {
      return;
    }

    activeSubscriptions += 1;
    ensureSocket(token, userId);

    return () => {
      activeSubscriptions = Math.max(0, activeSubscriptions - 1);

      if (activeSubscriptions === 0) {
        disconnectSocket();
      }
    };
  }, [enabled, token, userId]);
}
