import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/src/auth/AuthContext';
import { queryKeys } from '@/src/query/queryKeys';
import type { NotificationSettingPatchDescriptor, NotificationSettings } from '@/src/notifications/notificationSettings';
import { getNotificationSettingsStore, layUnansweredSaves, notificationSettingsError } from '@/src/notifications/notificationSettingsStore';

/** Overview and sections share canonical cached data and one session-bound save queue. */
export function useNotificationSettings() {
  const client = useQueryClient();
  const { status, user } = useAuth();
  const userId = status === 'authenticated' ? user?.id ?? null : null;
  const store = getNotificationSettingsStore(client, userId);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const query = useQuery<NotificationSettings>({
    queryKey: queryKeys.notifications.settings(userId),
    queryFn: ({ signal }) => store.load(signal),
    enabled: store.isCurrent(), staleTime: 60_000,
  });
  const patch = useCallback((next: NotificationSettingPatchDescriptor) => store.save(next), [store]);
  const isPending = useCallback((target: Pick<NotificationSettingPatchDescriptor, 'section' | 'key'>) =>
    state.pendingKeys.has(target.section + '.' + target.key), [state.pendingKeys]);
  const signedOut = status !== 'loading' && !userId;
  return {
    settings: store.isCurrent() && query.data ? layUnansweredSaves(query.data, state.pending) : null,
    loading: status === 'loading' || (Boolean(userId) && query.isPending && !query.error),
    loadError: signedOut ? 'Sign in to manage notification settings.' :
      query.error && !query.data ? notificationSettingsError(query.error) : null,
    reload: () => { void query.refetch(); }, isPending, failed: state.failed, patch,
    retryFailed: store.retry, dismissFailure: store.dismiss,
  };
}
export type NotificationSettingsController = ReturnType<typeof useNotificationSettings>;
