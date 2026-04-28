import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { tokens, type ThemeScheme } from '@/src/styles/tokens';

export type ThemeMode = 'auto' | 'system' | 'time' | 'light' | 'dark';

export type ThemeContextValue = {
  ready: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  scheme: ThemeScheme;
  theme: (typeof tokens)['themes'][ThemeScheme];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_MODE_KEY = 'threadly.theme.mode';

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'auto' || value === 'system' || value === 'time' || value === 'light' || value === 'dark';
}

function getTimeBasedScheme(now = new Date()): ThemeScheme {
  const hour = now.getHours();
  const { darkStartHour, lightStartHour } = tokens.timeTheme;

  if (darkStartHour <= lightStartHour) {
    // Example: dark 19 -> light 7 (wraps midnight)
    // dark if hour >= 19 OR hour < 7
    if (hour >= darkStartHour || hour < lightStartHour) return 'dark';
    return 'light';
  }

  // Rare configuration where dark starts before light within same day
  // dark if hour in [darkStartHour, lightStartHour)
  if (hour >= darkStartHour && hour < lightStartHour) return 'dark';
  return 'light';
}

function getNextThemeBoundary(now = new Date()): Date {
  const { darkStartHour, lightStartHour } = tokens.timeTheme;

  const today = new Date(now);
  const at = (hour: number) => {
    const d = new Date(today);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const boundaryA = at(darkStartHour);
  const boundaryB = at(lightStartHour);

  // Get next boundary among the two; handle wrap to next day.
  const candidates = [boundaryA, boundaryB].map((d) => {
    if (d.getTime() <= now.getTime()) {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return next;
    }
    return d;
  });

  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

function computeScheme(mode: ThemeMode, systemScheme: ColorSchemeName, now = new Date()): ThemeScheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';

  const timeScheme = getTimeBasedScheme(now);

  if (mode === 'time') return timeScheme;

  const normalizedSystem: ThemeScheme | null = systemScheme === 'dark' ? 'dark' : systemScheme === 'light' ? 'light' : null;

  if (mode === 'system') return normalizedSystem ?? timeScheme;
  // auto: hybrid (system preferred, time fallback)
  return normalizedSystem ?? timeScheme;
}

export function ThemeProvider({
  children,
  initialMode = 'auto',
  bootstrapped = false,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  bootstrapped?: boolean;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [ready, setReady] = useState(bootstrapped);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [timeTick, setTimeTick] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(THEME_MODE_KEY, next).catch(() => undefined);
  }, []);

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
        if (isThemeMode(value)) setModeState(value);
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

  const scheme = useMemo(() => computeScheme(mode, systemScheme, new Date()), [mode, systemScheme, timeTick]);

  // Efficient time-based updates: schedule the next boundary tick only when time mode is relevant.
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const normalizedSystem: ThemeScheme | null =
      systemScheme === 'dark' ? 'dark' : systemScheme === 'light' ? 'light' : null;

    const timeIsRelevant = mode === 'time' || (mode === 'system' && normalizedSystem == null) || (mode === 'auto' && normalizedSystem == null);

    if (!timeIsRelevant) return;

    const nextBoundary = getNextThemeBoundary(new Date());
    const ms = Math.max(250, nextBoundary.getTime() - Date.now() + 1000);

    timeoutRef.current = setTimeout(() => {
      setTimeTick((n) => n + 1);
    }, ms);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [mode, systemScheme]);

  const theme = useMemo(() => tokens.themes[scheme], [scheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ready,
      mode,
      setMode,
      scheme,
      theme,
    }),
    [ready, mode, setMode, scheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
