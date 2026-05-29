import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

import { apiClient } from '@/src/api/httpClient';
import { MessagingApi } from '@/src/api/MessagingApi';
import { queryClient, THREADLY_COUNT_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import type {
  MessageCreatedRealtimeEvent,
  MessageReadRealtimeEvent,
  ThreadUpdatedRealtimeEvent,
} from '@/src/types/messaging';

type MessagingRealtimeListeners = {
  onMessageCreated?: (payload: MessageCreatedRealtimeEvent) => void;
  onThreadUpdated?: (payload: ThreadUpdatedRealtimeEvent) => void;
  onMessageRead?: (payload: MessageReadRealtimeEvent) => void;
};

const UNREAD_REFRESH_DEBOUNCE_MS = 300;
export const MESSAGE_FOREGROUND_ALERT_DEDUPE_WINDOW_MS = 6_000;

let socket: Socket | null = null;
let socketToken: string | null = null;
let socketUserId: string | null = null;
let activeSubscriptions = 0;
let unreadCountRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let activeMessageThreadId: string | null = null;

const messageCreatedListeners = new Set<(payload: MessageCreatedRealtimeEvent) => void>();
const threadUpdatedListeners = new Set<(payload: ThreadUpdatedRealtimeEvent) => void>();
const messageReadListeners = new Set<(payload: MessageReadRealtimeEvent) => void>();
const foregroundAlertKeys = new Map<string, number>();

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
  queryClient.setQueryData(queryKeys.messaging.unreadCount(), { unreadCount: normalized });
  emitUnreadCount();
}

function normalizeRealtimePayload<T extends object>(payload: unknown): T {
  return payload && typeof payload === 'object' ? (payload as T) : ({} as T);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isMessageLikeValue(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('message');
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function getSocketBaseUrl(): string | null {
  const baseUrl = String(apiClient.defaults.baseURL ?? '').trim();
  return baseUrl.length > 0 ? baseUrl.replace(/\/$/, '') : null;
}

function pruneForegroundAlertKeys(now = Date.now()) {
  foregroundAlertKeys.forEach((timestamp, key) => {
    if (now - timestamp > MESSAGE_FOREGROUND_ALERT_DEDUPE_WINDOW_MS) {
      foregroundAlertKeys.delete(key);
    }
  });
}

export function getMessageForegroundAlertDedupeKey(payload: unknown): string | null {
  const source = toRecord(payload);
  const messageId = readString(source.messageId);
  const threadId = readString(source.threadId) ?? readString(source.conversationId);

  if (messageId && threadId) return `message:${threadId}:${messageId}`;
  if (messageId) return `message:${messageId}`;
  if (threadId) return `thread:${threadId}`;
  return null;
}

export function markMessageForegroundAlertHandled(payload: unknown): boolean {
  const dedupeKey = getMessageForegroundAlertDedupeKey(payload);
  if (!dedupeKey) return false;

  const now = Date.now();
  pruneForegroundAlertKeys(now);
  foregroundAlertKeys.set(dedupeKey, now);
  return true;
}

export function shouldShowMessageForegroundAlert(payload: unknown): boolean {
  const dedupeKey = getMessageForegroundAlertDedupeKey(payload);
  if (!dedupeKey) return false;

  const now = Date.now();
  pruneForegroundAlertKeys(now);
  const lastShownAt = foregroundAlertKeys.get(dedupeKey);
  if (typeof lastShownAt === 'number' && now - lastShownAt <= MESSAGE_FOREGROUND_ALERT_DEDUPE_WINDOW_MS) {
    return false;
  }

  foregroundAlertKeys.set(dedupeKey, now);
  return true;
}

export function setActiveMessageThreadId(threadId: string | null | undefined) {
  activeMessageThreadId = readString(threadId);
}

export function isMessageThreadActive(threadId: string | null | undefined): boolean {
  const normalizedThreadId = readString(threadId);
  return Boolean(normalizedThreadId && activeMessageThreadId && normalizedThreadId === activeMessageThreadId);
}

export function shouldPresentMessageForegroundPushNotification(payload: unknown): boolean {
  const source = toRecord(payload);
  const isMessagePayload =
    isMessageLikeValue(source.type) ||
    isMessageLikeValue(source.category) ||
    isMessageLikeValue(source.notificationType) ||
    Boolean(readString(source.threadId) || readString(source.conversationId) || readString(source.messageId));

  if (!isMessagePayload) return true;

  const threadId = readString(source.threadId) ?? readString(source.conversationId);
  if (isMessageThreadActive(threadId)) {
    markMessageForegroundAlertHandled(payload);
    return false;
  }

  const dedupeKey = getMessageForegroundAlertDedupeKey(payload);
  if (!dedupeKey) return true;

  return shouldShowMessageForegroundAlert(payload);
}

function clearUnreadCountRefreshTimer() {
  if (!unreadCountRefreshTimer) return;
  clearTimeout(unreadCountRefreshTimer);
  unreadCountRefreshTimer = null;
}

function scheduleUnreadMessageCountRefresh() {
  clearUnreadCountRefreshTimer();
  unreadCountRefreshTimer = setTimeout(() => {
    unreadCountRefreshTimer = null;
    void refreshUnreadMessageCount({
      authenticated: Boolean(socketToken && socketUserId),
    });
  }, UNREAD_REFRESH_DEBOUNCE_MS);
}

function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
  socketUserId = null;
  clearUnreadCountRefreshTimer();
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

  socket.on('message.created', (payload: unknown) => {
    const normalizedPayload = normalizeRealtimePayload<MessageCreatedRealtimeEvent>(payload);
    scheduleUnreadMessageCountRefresh();
    messageCreatedListeners.forEach((listener) => listener(normalizedPayload));
  });

  socket.on('thread.updated', (payload: unknown) => {
    const normalizedPayload = normalizeRealtimePayload<ThreadUpdatedRealtimeEvent>(payload);
    scheduleUnreadMessageCountRefresh();
    threadUpdatedListeners.forEach((listener) => listener(normalizedPayload));
  });

  socket.on('message.read', (payload: unknown) => {
    const normalizedPayload = normalizeRealtimePayload<MessageReadRealtimeEvent>(payload);
    scheduleUnreadMessageCountRefresh();
    messageReadListeners.forEach((listener) => listener(normalizedPayload));
  });

  socket.on('disconnect', () => {
    if (__DEV__) {
      console.log('[messaging] realtime socket disconnected');
    }
  });

  return socket;
}

export function useUnreadMessageCount(): number {
  return useSyncExternalStore(
    (listener) => {
      unreadCountListeners.add(listener);
      return () => unreadCountListeners.delete(listener);
    },
    () => unreadCount,
    () => unreadCount,
  );
}

export function replaceUnreadMessageCount(nextCount: number) {
  setUnreadCount(nextCount);
}

export function resetUnreadMessageCount() {
  setUnreadCount(0);
}

export function clearMessagingRealtimeSession() {
  disconnectSocket();
  activeSubscriptions = 0;
  unreadCountRefreshPromise = null;
  activeMessageThreadId = null;
  foregroundAlertKeys.clear();
  resetUnreadMessageCount();
  queryClient.removeQueries({ queryKey: queryKeys.messaging.unreadCount(), exact: true });
}

export async function refreshUnreadMessageCount({
  authenticated,
  forceRefresh = false,
}: {
  authenticated: boolean;
  forceRefresh?: boolean;
}): Promise<boolean> {
  if (!authenticated) {
    resetUnreadMessageCount();
    queryClient.removeQueries({ queryKey: queryKeys.messaging.unreadCount(), exact: true });
    return false;
  }

  if (unreadCountRefreshPromise) return unreadCountRefreshPromise;

  if (forceRefresh) {
    queryClient.removeQueries({ queryKey: queryKeys.messaging.unreadCount(), exact: true });
  }

  unreadCountRefreshPromise = queryClient
    .fetchQuery({
      queryKey: queryKeys.messaging.unreadCount(),
      queryFn: MessagingApi.getUnreadMessageCount,
      staleTime: THREADLY_COUNT_STALE_TIME_MS,
    })
    .then(({ unreadCount: nextUnreadCount }) => {
      replaceUnreadMessageCount(nextUnreadCount);
      return true;
    })
    .catch(() => {
      resetUnreadMessageCount();
      return false;
    })
    .finally(() => {
      unreadCountRefreshPromise = null;
    });

  return unreadCountRefreshPromise;
}

export function useMessagingRealtimeChannel({
  enabled = true,
  token,
  userId,
  onMessageCreated,
  onThreadUpdated,
  onMessageRead,
}: {
  enabled?: boolean;
  token: string | null;
  userId: string | null;
} & MessagingRealtimeListeners) {
  useEffect(() => {
    if (!enabled) return;
    if (onMessageCreated) messageCreatedListeners.add(onMessageCreated);

    return () => {
      if (onMessageCreated) messageCreatedListeners.delete(onMessageCreated);
    };
  }, [enabled, onMessageCreated]);

  useEffect(() => {
    if (!enabled) return;
    if (onThreadUpdated) threadUpdatedListeners.add(onThreadUpdated);

    return () => {
      if (onThreadUpdated) threadUpdatedListeners.delete(onThreadUpdated);
    };
  }, [enabled, onThreadUpdated]);

  useEffect(() => {
    if (!enabled) return;
    if (onMessageRead) messageReadListeners.add(onMessageRead);

    return () => {
      if (onMessageRead) messageReadListeners.delete(onMessageRead);
    };
  }, [enabled, onMessageRead]);

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
