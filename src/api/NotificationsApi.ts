import { apiClient } from '@/src/api/httpClient';
import type {
  NotificationSettings,
  NotificationSettingsPatch,
} from '@/src/notifications/notificationSettings';

type NotificationActor = {
  id?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImage?: string | null;
};

type NotificationTarget = {
  type: 'DESIGN' | 'POST' | 'COLLECTION' | 'COLLECTION_MEDIA' | 'PRODUCT' | 'USER' | 'SYSTEM';
  id: string;
  preview?: string;
};

export type MobileNotification = {
  id: string;
  type: string;
  version?: 1 | 2;
  message: string;
  createdAt: string;
  isRead: boolean;
  actor?: NotificationActor | null;
  target?: NotificationTarget | null;
  subTargetId?: string | null;
  targetUrl?: string | null;
  payload?: Record<string, unknown>;
};

type NotificationListResponse = {
  items: MobileNotification[];
  hasNextPage: boolean;
  endCursor: string | null;
};

export type PushProvider = 'EXPO' | 'FCM' | 'APNS';
export type PushPlatform = 'IOS' | 'ANDROID' | 'WEB' | 'UNKNOWN';

export type RegisterPushTokenPayload = {
  token: string;
  provider?: PushProvider;
  platform?: PushPlatform;
  deviceId?: string;
  deviceName?: string;
  appVersion?: string;
  expoProjectId?: string;
};

export type PushTokenDevice = {
  id: string;
  provider: PushProvider;
  platform: PushPlatform;
  deviceName?: string | null;
  appVersion?: string | null;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  maskedToken?: string | null;
};

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

export const NotificationsApi = {
  async getUnreadCount(): Promise<{ count: number }> {
    const response = await apiClient.get('/notifications/unread-count');
    const payload = unwrap<any>(response.data);
    return { count: Number(payload?.count ?? 0) };
  },

  async list(cursor?: string, limit = 20, type?: string): Promise<NotificationListResponse> {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', String(limit));
    if (type) params.append('type', type);

    const query = params.toString();
    const response = await apiClient.get(query ? `/notifications?${query}` : '/notifications');
    const payload = unwrap<any>(response.data);

    return {
      items: Array.isArray(payload?.items) ? (payload.items as MobileNotification[]) : [],
      hasNextPage: Boolean(payload?.hasNextPage),
      endCursor: typeof payload?.endCursor === 'string' ? payload.endCursor : null,
    };
  },

  async markAsRead(id: string): Promise<{ success: boolean }> {
    const response = await apiClient.patch(`/notifications/${id}/read`);
    const payload = unwrap<any>(response.data);
    return { success: Boolean(payload?.success) };
  },

  async markAllAsRead(): Promise<{ success: boolean; count: number }> {
    const response = await apiClient.post('/notifications/mark-all-read');
    const payload = unwrap<any>(response.data);
    return {
      success: Boolean(payload?.success),
      count: Number(payload?.count ?? 0),
    };
  },

  async getSettings(): Promise<NotificationSettings> {
    const response = await apiClient.get('/notifications/settings');
    return unwrap<NotificationSettings>(response.data);
  },

  async updateSettings(settingsPatch: NotificationSettingsPatch): Promise<NotificationSettings> {
    const response = await apiClient.patch('/notifications/settings', settingsPatch);
    return unwrap<NotificationSettings>(response.data);
  },

  async registerPushToken(payload: RegisterPushTokenPayload): Promise<{ success: boolean }> {
    const response = await apiClient.post('/notifications/push-tokens', payload);
    const body = unwrap<any>(response.data);
    return { success: body?.success !== false };
  },

  async deactivateCurrentPushToken(token: string): Promise<{ success: boolean }> {
    const response = await apiClient.delete('/notifications/push-tokens/current', {
      data: { token },
    });
    const payload = unwrap<any>(response.data);
    return { success: payload?.success !== false };
  },

  async listPushTokens(): Promise<{ items: PushTokenDevice[] }> {
    const response = await apiClient.get('/notifications/push-tokens');
    const payload = unwrap<any>(response.data);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return { items: items as PushTokenDevice[] };
  },
};
