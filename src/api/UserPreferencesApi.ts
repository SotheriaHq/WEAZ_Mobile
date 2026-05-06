import { apiClient } from '@/src/api/httpClient';
import { normalizeThemePreference, type ThemePreference } from '@/src/types/theme';

type ThemePreferenceResponse =
  | { themePreference?: unknown }
  | { user?: { themePreference?: unknown } | null };

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

function readThemePreference(
  payload: ThemePreferenceResponse,
  fallback: ThemePreference,
): ThemePreference {
  if ('themePreference' in payload) {
    return normalizeThemePreference(payload.themePreference, fallback);
  }

  if ('user' in payload && payload.user && typeof payload.user === 'object') {
    return normalizeThemePreference(payload.user.themePreference, fallback);
  }

  return fallback;
}

export const UserPreferencesApi = {
  async updateThemePreference(
    themePreference: ThemePreference,
  ): Promise<{ themePreference: ThemePreference }> {
    const response = await apiClient.patch('/users/me/preferences', { themePreference });
    const payload = unwrapData<ThemePreferenceResponse>(response.data);

    return {
      themePreference: readThemePreference(payload, themePreference),
    };
  },
};
