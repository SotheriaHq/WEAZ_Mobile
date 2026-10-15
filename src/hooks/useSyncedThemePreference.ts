import { useCallback } from 'react';

import { UserPreferencesApi } from '@/src/api/UserPreferencesApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import type { ThemePreference } from '@/src/types/theme';

export function useSyncedThemePreference() {
  const themeState = useTheme();
  const { status, user, updateUser } = useAuth();
  const toast = useToast();

  const setThemePreference = useCallback(
    async (themePreference: ThemePreference) => {
      themeState.setThemePreference(themePreference);

      if (status !== 'authenticated' || !user?.id) {
        return;
      }

      try {
        const updated = await UserPreferencesApi.updateThemePreference(themePreference);
        /**
         * Only write back when the server actually disagrees.
         *
         * `updateUser` replaces the auth user object, which re-renders every
         * consumer in the app — the same full-tree pass the theme flip just
         * did. Since the server echoes back the preference we sent, the common
         * case was paying for that pass twice for no change at all, landing a
         * second later when the request returned. That is the lag between
         * pressing a theme and the screen settling.
         */
        if (updated.themePreference !== user.themePreference) {
          updateUser({ themePreference: updated.themePreference });
        }
      } catch (error) {
        console.warn('Theme preference sync failed; keeping local preference.', error);
        toast.warning('Theme saved on this device. Account sync will retry next time.');
      }
    },
    [status, themeState, toast, updateUser, user?.id, user?.themePreference],
  );

  return {
    ...themeState,
    setThemePreference,
    setMode: setThemePreference,
  };
}
