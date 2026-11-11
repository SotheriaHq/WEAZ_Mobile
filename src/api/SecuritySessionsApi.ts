import { apiClient } from '@/src/api/httpClient';
export type SecurityDevice = {
  key: string; deviceName: string | null; sessionCount: number; activeSessionCount: number;
  lastUsedAt: string; isCurrentDevice: boolean;
};
export type DeviceSession = {
  id: string; userAgent: string | null; deviceName: string | null;
  createdAt: string; lastUsedAt: string | null; expiresAt: string;
  isCurrentSession: boolean; isCurrentSource: boolean; isActive: boolean;
  ipAddressMasked: string | null; endedAt: string | null; endedReason: string | null; context: 'Studio' | 'Sign-in';
};
export type SecurityPage<T> = { items: T[]; nextCursor: string | null };

function unwrap<T>(payload: unknown): T {
  return (payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: T }).data : payload) as T;
}
export const SecuritySessionsApi = {
  async devices(cursor: string | null, signal?: AbortSignal): Promise<SecurityPage<SecurityDevice>> {
    const response = await apiClient.get('/auth/security/session-devices', { params: { cursor: cursor ?? undefined }, signal });
    return unwrap(response.data);
  },
  async sessions(key: string, cursor: string | null, signal?: AbortSignal): Promise<SecurityPage<DeviceSession>> {
    const response = await apiClient.get(`/auth/security/session-devices/${encodeURIComponent(key)}/sessions`, { params: { cursor: cursor ?? undefined }, signal });
    return unwrap(response.data);
  },
  async revokeDevice(key: string) {
    await apiClient.post(`/auth/security/session-devices/${encodeURIComponent(key)}/revoke`);
  },
  async revokeSession(id: string) {
    await apiClient.patch(`/auth/security/sessions/${encodeURIComponent(id)}/revoke`);
  },
  async revokeOthers() { await apiClient.post('/auth/security/sessions/logout-others'); },
};
