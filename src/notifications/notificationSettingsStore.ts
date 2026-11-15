import type { QueryClient } from '@tanstack/react-query';
import { NotificationsApi } from '@/src/api/NotificationsApi';
import { getApiSecurityIdentity, getApiSessionScope, type SessionRequestConfig } from '@/src/api/httpClient';
import { queryKeys } from '@/src/query/queryKeys';
import { applyNotificationSettingsPatch, buildNotificationSettingsPatch,
  type NotificationSettingPatchDescriptor, type NotificationSettings } from '@/src/notifications/notificationSettings';

export const patchKeyOf = (patch: Pick<NotificationSettingPatchDescriptor, 'section' | 'key'>) =>
  patch.section + '.' + patch.key;
export const layUnansweredSaves = (base: NotificationSettings, pending: readonly NotificationSettingPatchDescriptor[]) =>
  pending.reduce((settings, patch) => applyNotificationSettingsPatch(settings, patch), base);
export function notificationSettingsError(error: unknown): string {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.filter(Boolean).join(', ') || 'Try saving this setting again.';
  if (typeof message === 'string' && message.trim()) return message;
  return error instanceof Error && error.message.trim() ? error.message : 'Try saving this setting again.';
}
export type NotificationSaveState = {
  pending: readonly NotificationSettingPatchDescriptor[];
  pendingKeys: ReadonlySet<string>;
  failed: { patch: NotificationSettingPatchDescriptor; message: string } | null;
};

function createStore(client: QueryClient, userId: string | null, identity: string | null, scope: number) {
  let state: NotificationSaveState = { pending: [], pendingKeys: new Set(), failed: null };
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();
  const key = queryKeys.notifications.settings(userId);
  const isCurrent = () => Boolean(userId && identity && identity.split(':')[0] === userId &&
    getApiSecurityIdentity() === identity && getApiSessionScope() === scope);
  const config: SessionRequestConfig = { _authScope: scope, ...(identity ? { _securityIdentity: identity } : {}) };
  const publish = (pending: readonly NotificationSettingPatchDescriptor[], failed = state.failed) => {
    state = { pending, pendingKeys: new Set(pending.map(patchKeyOf)), failed };
    listeners.forEach(listener => listener());
  };
  const save = (patch: NotificationSettingPatchDescriptor): Promise<boolean> => {
    if (!isCurrent() || !client.getQueryData(key)) return Promise.resolve(false);
    // Cache holds confirmed server data. Optimistic edits are an account/session
    // scoped overlay, so a failed save cannot undo another switch or survive logout.
    publish([...state.pending, patch], null);
    const run = async () => {
      if (!isCurrent()) { publish(state.pending.filter(item => item !== patch), null); return false; }
      try {
        await client.cancelQueries({ queryKey: key, exact: true });
        if (!isCurrent()) return false;
        const answer = await NotificationsApi.updateSettings(
          buildNotificationSettingsPatch(patch.section, patch.key, patch.value), config);
        if (!isCurrent()) return false;
        // A refresh started during this save must not replace its newer answer.
        await client.cancelQueries({ queryKey: key, exact: true });
        if (!isCurrent()) return false;
        client.setQueryData<NotificationSettings>(key, answer);
        return true;
      } catch (error) {
        if (isCurrent()) publish(state.pending, { patch, message: notificationSettingsError(error) });
        return false;
      } finally {
        publish(state.pending.filter(item => item !== patch), isCurrent() ? state.failed : null);
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    userId, identity, scope, config, isCurrent, save,
    load: async (signal?: AbortSignal) => {
      if (!isCurrent()) throw new Error('Your sign-in session changed. Open these settings again.');
      const settings = await NotificationsApi.getSettings({ ...config, signal });
      if (!isCurrent()) throw new Error('Your sign-in session changed. Open these settings again.');
      return settings;
    },
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    retry: () => { if (state.failed && isCurrent()) void save(state.failed.patch); },
    dismiss: () => { if (isCurrent()) publish(state.pending, null); },
  };
}
// At most one current model per QueryClient. Retired models are retained only
// by their outstanding requests, never by a growing account-history map.
const stores = new WeakMap<QueryClient, ReturnType<typeof createStore>>();
const deniedStores = new WeakMap<QueryClient, ReturnType<typeof createStore>>();
export function getNotificationSettingsStore(client: QueryClient, userId: string | null) {
  const identity = getApiSecurityIdentity(), scope = getApiSessionScope();
  if (!userId || !identity || identity.split(':')[0] !== userId) {
    // A stale observer must not evict the current account's in-flight queue.
    let denied = deniedStores.get(client);
    if (!denied) { denied = createStore(client, null, null, -1); deniedStores.set(client, denied); }
    return denied;
  }
  let store = stores.get(client);
  if (!store || store.userId !== userId || store.identity !== identity || store.scope !== scope) {
    store = createStore(client, userId, identity, scope);
    stores.set(client, store);
  }
  return store;
}
