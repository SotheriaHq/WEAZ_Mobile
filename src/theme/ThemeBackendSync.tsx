import { useEffect, useRef } from 'react';

import { useAuth } from '@/src/auth/AuthContext';
import { useTheme } from '@/src/theme/ThemeProvider';
import { normalizeThemePreference } from '@/src/types/theme';

export function ThemeBackendSync() {
  const { status, user } = useAuth();
  const { syncThemePreferenceFromBackend } = useTheme();
  const lastAppliedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (status !== 'authenticated' || !user?.id) {
      lastAppliedKeyRef.current = null;
      return;
    }

    const themePreference = normalizeThemePreference(user.themePreference);
    const appliedKey = `${user.id}:${themePreference}`;

    if (lastAppliedKeyRef.current === appliedKey) {
      return;
    }

    lastAppliedKeyRef.current = appliedKey;
    syncThemePreferenceFromBackend(themePreference);
  }, [status, syncThemePreferenceFromBackend, user?.id, user?.themePreference]);

  return null;
}
