import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  normalizeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/src/types/theme';
import { tokens, type ThemeScheme } from '@/src/styles/tokens';

export type ThemeMode = ThemePreference;

export type ThemeContextValue = {
  ready: boolean;
  /**
   * Compatibility alias for the saved preference. Prefer `themePreference`
   * in new code so it is not confused with the resolved rendered scheme.
   */
  mode: ThemeMode;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (mode: ThemePreference) => void;
  syncThemePreferenceFromBackend: (mode: unknown) => void;
  /**
   * Compatibility alias for `setThemePreference`.
   */
  setMode: (mode: ThemeMode) => void;
  scheme: ThemeScheme;
  theme: (typeof tokens)['themes'][ThemeScheme];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_MODE_KEY = 'threadly.theme.mode';

function computeScheme(mode: ThemeMode, systemScheme: ColorSchemeName): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';

  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  initialMode = 'system',
  bootstrapped = false,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  bootstrapped?: boolean;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [ready, setReady] = useState(bootstrapped);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

  const setThemePreference = useCallback((next: ThemePreference) => {
    const normalized = normalizeThemePreference(next);
    setModeState(normalized);
    SecureStore.setItemAsync(THEME_MODE_KEY, normalized).catch(() => undefined);
  }, []);

  const syncThemePreferenceFromBackend = useCallback((next: unknown) => {
    setThemePreference(normalizeThemePreference(next));
  }, [setThemePreference]);

  useEffect(() => {
    setModeState(initialMode);
    setReady(bootstrapped);
  }, [bootstrapped, initialMode]);

  useEffect(() => {
    if (bootstrapped) {
      return;
    }

    let isMounted = true;

    SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((value) => {
        if (!isMounted) return;
        setModeState(normalizeThemePreference(value));
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) setReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, [bootstrapped]);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const scheme = useMemo(() => computeScheme(mode, systemScheme), [mode, systemScheme]);

  const theme = useMemo(() => tokens.themes[scheme], [scheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ready,
      mode,
      themePreference: mode,
      resolvedTheme: scheme,
      setThemePreference,
      syncThemePreferenceFromBackend,
      setMode: setThemePreference,
      scheme,
      theme,
    }),
    [ready, mode, setThemePreference, syncThemePreferenceFromBackend, scheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
