import { apiClient, getApiSecurityIdentity } from '@/src/api/httpClient';
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

export type SecuritySessionAuthority = { actorId: string; identity: string };
export function captureSessionAuthority(actorId: string): SecuritySessionAuthority | null {
  const identity = getApiSecurityIdentity();
  return actorId && identity?.startsWith(`${actorId}:`) ? { actorId, identity } : null;
}
function bound(authority: SecuritySessionAuthority | null, signal?: AbortSignal) {
  if (!authority?.identity.startsWith(`${authority.actorId}:`) ||
    getApiSecurityIdentity() !== authority.identity) throw new Error('Your sign-in changed. Reopen device sessions before continuing.');
  return { signal, _securityIdentity: authority.identity };
}

function unwrap<T>(payload: unknown): T {
  return (payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: T }).data : payload) as T;
}
function page<T>(payload: unknown, valid: (item: unknown) => boolean): SecurityPage<T> {
  const result = unwrap<SecurityPage<T> | null>(payload);
  if (!result || !Array.isArray(result.items) || result.items.length > 100 ||
    result.items.some(item => !valid(item)) ||
    !(result.nextCursor === null || (typeof result.nextCursor === 'string' && result.nextCursor.length > 0 && result.nextCursor.length <= 512)))
    throw new Error('WIEZ returned incomplete device sessions. Please retry.');
  return result;
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const optionalText = (value: unknown) => value === null || typeof value === 'string';
function validDevice(value: unknown) {
  return record(value) && typeof value.key === 'string' && (value.key === 'unidentified' || /^[a-f0-9]{64}$/.test(value.key)) &&
    optionalText(value.deviceName) && typeof value.isCurrentDevice === 'boolean' && date(value.lastUsedAt) &&
    Number.isSafeInteger(value.sessionCount) && Number.isSafeInteger(value.activeSessionCount) &&
    Number(value.activeSessionCount) >= 0 && Number(value.sessionCount) >= Number(value.activeSessionCount);
}
function validSession(value: unknown) {
  return record(value) && typeof value.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) &&
    ['Studio', 'Sign-in'].includes(String(value.context)) && ['isActive', 'isCurrentSession', 'isCurrentSource'].every(key => typeof value[key] === 'boolean') &&
    date(value.createdAt) && date(value.expiresAt) && (value.lastUsedAt === null || date(value.lastUsedAt)) &&
    (value.endedAt === null || date(value.endedAt)) && optionalText(value.endedReason) && optionalText(value.ipAddressMasked);
}

export const SecuritySessionsApi = {
  async devices(authority: SecuritySessionAuthority | null, cursor: string | null, signal?: AbortSignal): Promise<SecurityPage<SecurityDevice>> {
    const response = await apiClient.get('/auth/security/session-devices', { params: { cursor: cursor ?? undefined }, ...bound(authority, signal) });
    return page<SecurityDevice>(response.data, validDevice);
  },
  async sessions(authority: SecuritySessionAuthority | null, key: string, cursor: string | null, signal?: AbortSignal): Promise<SecurityPage<DeviceSession>> {
    const response = await apiClient.get(`/auth/security/session-devices/${encodeURIComponent(key)}/sessions`, { params: { cursor: cursor ?? undefined }, ...bound(authority, signal) });
    return page<DeviceSession>(response.data, validSession);
  },
  async revokeDevice(authority: SecuritySessionAuthority, key: string) {
    await apiClient.post(`/auth/security/session-devices/${encodeURIComponent(key)}/revoke`, undefined, bound(authority));
  },
  async revokeSession(authority: SecuritySessionAuthority, id: string) {
    await apiClient.patch(`/auth/security/sessions/${encodeURIComponent(id)}/revoke`, undefined, bound(authority));
  },
  async revokeOthers(authority: SecuritySessionAuthority) { await apiClient.post('/auth/security/sessions/logout-others', undefined, bound(authority)); },
};
