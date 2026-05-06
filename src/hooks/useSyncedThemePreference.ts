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
        updateUser({ themePreference: updated.themePreference });
      } catch (error) {
        console.warn('Theme preference sync failed; keeping local preference.', error);
        toast.warning('Theme saved on this device. Account sync will retry next time.');
      }
    },
    [status, themeState, toast, updateUser, user?.id],
  );

  return {
    ...themeState,
    setThemePreference,
    setMode: setThemePreference,
  };
}
