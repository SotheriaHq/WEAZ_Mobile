import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

import { apiClient } from '@/src/api/httpClient';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { queryClient, THREADLY_COUNT_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

type RealtimeNotification = MobileNotification;
type NotificationDeletedPayload = {
  id?: string;
  unreadDelta?: number;
};

type NotificationListeners = {
  onCreated?: (notification: RealtimeNotification) => void;
  onDeleted?: (payload: NotificationDeletedPayload) => void;
};

let socket: Socket | null = null;
let socketToken: string | null = null;
let socketUserId: string | null = null;
let activeSubscriptions = 0;

const createdListeners = new Set<(notification: RealtimeNotification) => void>();
const deletedListeners = new Set<(payload: NotificationDeletedPayload) => void>();

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
  emitUnreadCount();
}

function getSocketBaseUrl(): string | null {
  const baseUrl = String(apiClient.defaults.baseURL ?? '').trim();
  return baseUrl.length > 0 ? baseUrl.replace(/\/$/, '') : null;
}

function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
  socketUserId = null;
}

function ensureSocket(token: string, userId: string) {
  const baseUrl = getSocketBaseUrl();
  if (!baseUrl) return null;

  if (socket && socketToken === token && socketUserId === userId) {
    return socket;
  }

  disconnectSocket();

  socketToken = token;
  socketUserId = userId;
  socket = io(baseUrl, {
    autoConnect: true,
    transports: ['websocket'],
    withCredentials: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    timeout: 10000,
  });

  socket.on('connect', () => {
    socket?.emit('join', { room: `USER:${userId}` });
  });

  socket.on('notification.created', (payload: RealtimeNotification) => {
    if (payload && payload.isRead === false) {
      setUnreadCount(unreadCount + 1);
    }
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

  return socket;
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
      staleTime: THREADLY_COUNT_STALE_TIME_MS,
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
