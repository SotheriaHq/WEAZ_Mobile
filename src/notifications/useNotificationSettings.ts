import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { NotificationsApi } from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  applyNotificationSettingsPatch,
  buildNotificationSettingsPatch,
  type NotificationSettingPatchDescriptor,
  type NotificationSettings,
} from '@/src/notifications/notificationSettings';
import { queryKeys } from '@/src/query/queryKeys';

/**
 * Notification preferences, shared by the overview and every section screen.
 *
 * The overview stays mounted under a section screen, so both read ONE copy —
 * the query cache — and a switch flipped on a section screen is already right
 * on the overview when the user comes back. No reload on return.
 *
 * Saves run one at a time, in the order they were made. The server answers
 * each save with the whole settings object; applied naively, an earlier
 * answer arriving after a later tap would flip that later switch back. So
 * every answer is laid under the saves still waiting, and a failure undoes
 * only its own switch.
 */

export const patchKeyOf = (patch: Pick<NotificationSettingPatchDescriptor, 'section' | 'key'>) =>
  `${patch.section}.${patch.key}`;

type SaveState = {
  /** Switches whose save has not been answered yet. */
  pendingKeys: ReadonlySet<string>;
  /** The last save that failed, kept so it can be retried as it was. */
  failed: { patch: NotificationSettingPatchDescriptor; message: string } | null;
};

let saveState: SaveState = { pendingKeys: new Set(), failed: null };
const listeners = new Set<() => void>();
const setSaveState = (next: SaveState) => {
  saveState = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSaveState = () => saveState;

/** Unanswered saves, oldest first, per account. */
const unansweredByUser = new Map<string, NotificationSettingPatchDescriptor[]>();
/** The server's last word per account: what a failed save rolls back to. */
const confirmedByUser = new Map<string, NotificationSettings>();
let saveQueue: Promise<unknown> = Promise.resolve();
/** The account the screens are showing; answers for anyone else are dropped. */
let activeUserId: string | null = null;

export function layUnansweredSaves(
  base: NotificationSettings,
  unanswered: readonly NotificationSettingPatchDescriptor[],
): NotificationSettings {
  return unanswered.reduce((settings, patch) => applyNotificationSettingsPatch(settings, patch), base);
}

function errorMessage(error: unknown): string {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.filter(Boolean).join(', ') || 'Try saving this setting again.';
  if (typeof message === 'string' && message.trim()) return message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Try saving this setting again.';
}

function removeOnce(list: NotificationSettingPatchDescriptor[], patch: NotificationSettingPatchDescriptor) {
  const index = list.indexOf(patch);
  if (index >= 0) list.splice(index, 1);
}

function savePatch(
  client: QueryClient,
  userId: string,
  patch: NotificationSettingPatchDescriptor,
): Promise<boolean> {
  const key = queryKeys.notifications.settings(userId);
  const patchKey = patchKeyOf(patch);
  const unanswered = unansweredByUser.get(userId) ?? [];
  unansweredByUser.set(userId, unanswered);

  // The switch moves now; the save follows.
  unanswered.push(patch);
  client.setQueryData<NotificationSettings>(key, (current) =>
    current ? applyNotificationSettingsPatch(current, patch) : current,
  );
  const pendingKeys = new Set(saveState.pendingKeys);
  pendingKeys.add(patchKey);
  setSaveState({ pendingKeys, failed: null });

  const run = async (): Promise<boolean> => {
    let ok = false;
    try {
      const answer = await NotificationsApi.updateSettings(
        buildNotificationSettingsPatch(patch.section, patch.key, patch.value),
      );
      removeOnce(unanswered, patch);
      confirmedByUser.set(userId, answer);
      if (activeUserId === userId) {
        client.setQueryData<NotificationSettings>(key, layUnansweredSaves(answer, unanswered));
      }
      ok = true;
    } catch (error) {
      removeOnce(unanswered, patch);
      if (activeUserId === userId) {
        const confirmed = confirmedByUser.get(userId);
        if (confirmed) {
          client.setQueryData<NotificationSettings>(key, layUnansweredSaves(confirmed, unanswered));
        }
        setSaveState({ ...saveState, failed: { patch, message: errorMessage(error) } });
      }
    } finally {
      // Another save of the same switch may still be waiting.
      if (!unanswered.some((waiting) => patchKeyOf(waiting) === patchKey)) {
        const next = new Set(saveState.pendingKeys);
        next.delete(patchKey);
        setSaveState({ ...saveState, pendingKeys: next });
      }
    }
    return ok;
  };

  const result = saveQueue.then(run, run);
  saveQueue = result.catch(() => undefined);
  return result;
}

export type NotificationSettingsController = {
  settings: NotificationSettings | null;
  /** True only when nothing is cached yet: the first load ever on this phone. */
  loading: boolean;
  loadError: string | null;
  reload: () => void;
  isPending: (patch: Pick<NotificationSettingPatchDescriptor, 'section' | 'key'>) => boolean;
  failed: SaveState['failed'];
  /** Resolves true once the server has saved it. */
  patch: (patch: NotificationSettingPatchDescriptor) => Promise<boolean>;
  retryFailed: () => void;
  dismissFailure: () => void;
};

export function useNotificationSettings(): NotificationSettingsController {
  const client = useQueryClient();
  const { status, user } = useAuth();
  const userId = status === 'authenticated' ? user?.id ?? null : null;
  activeUserId = userId;
  const state = useSyncExternalStore(subscribe, getSaveState, getSaveState);

  const query = useQuery<NotificationSettings>({
    queryKey: queryKeys.notifications.settings(userId),
    queryFn: async () => {
      const settings = await NotificationsApi.getSettings();
      if (userId) confirmedByUser.set(userId, settings);
      return settings;
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
    // A refresh that lands while saves are waiting must not flip their
    // switches back; they are laid over whatever the server last said.
    select: (data) => layUnansweredSaves(data, userId ? unansweredByUser.get(userId) ?? [] : []),
  });

  const patch = useCallback(
    (next: NotificationSettingPatchDescriptor) => {
      if (!userId) return Promise.resolve(false);
      return savePatch(client, userId, next);
    },
    [client, userId],
  );

  const retryFailed = useCallback(() => {
    const failed = saveState.failed;
    if (!failed || !userId) return;
    void savePatch(client, userId, failed.patch);
  }, [client, userId]);

  const dismissFailure = useCallback(() => {
    if (saveState.failed) setSaveState({ ...saveState, failed: null });
  }, []);

  const reload = useCallback(() => {
    void query.refetch();
  }, [query]);

  const isPending = useCallback(
    (target: Pick<NotificationSettingPatchDescriptor, 'section' | 'key'>) =>
      state.pendingKeys.has(patchKeyOf(target)),
    [state.pendingKeys],
  );

  const signedOut = status !== 'loading' && !userId;
  const loadError = signedOut
    ? 'Sign in to manage notification settings.'
    : query.error && !query.data
      ? errorMessage(query.error) || 'Unable to load notification settings right now.'
      : null;

  return {
    settings: query.data ?? null,
    loading: status === 'loading' || (Boolean(userId) && query.isPending && !query.error),
    loadError,
    reload,
    isPending,
    failed: state.failed,
    patch,
    retryFailed,
    dismissFailure,
  };
}

/** Tests only. */
export function resetNotificationSettingsSaves() {
  unansweredByUser.clear();
  confirmedByUser.clear();
  saveQueue = Promise.resolve();
  activeUserId = null;
  setSaveState({ pendingKeys: new Set(), failed: null });
}
export const __testing = { savePatch, setActiveUser: (id: string | null) => { activeUserId = id; } };
