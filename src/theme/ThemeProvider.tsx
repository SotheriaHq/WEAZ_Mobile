import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  normalizeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/src/types/theme';
import { tokens, type ThemeScheme } from '@/src/styles/tokens';
import { useCommitCost } from '@/src/perf/commitCost';

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

const THEME_MODE_KEY = 'wiez.theme.mode';

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
  useCommitCost('P:Theme');
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [ready, setReady] = useState(bootstrapped);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? 'light',
  );

  const setThemePreference = useCallback((next: ThemePreference) => {
    const normalized = normalizeThemePreference(next);
    /*
      Urgent, not a transition.

      A theme change used to re-render every mounted screen in one pass — on
      the A17 about a second — and as a transition nothing changed on screen
      until ALL of it was done (owner, Nov 2026: "the theme change is still not
      instant"). Hidden tabs now take the change through `DeferredThemeScope`
      a beat later, so this urgent pass only repaints what is on display and
      lands at once.
    */
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

/**
 * Force everything rendered inside to resolve dark-theme tokens, regardless of
 * the user's light/dark preference.
 *
 * For full-bleed media viewers that matte images against
 * `tokens.themes.dark.colors.bg` in both themes. Chrome floating over such a
 * stage must belong to the stage, not to the app's ambient scheme: in light mode
 * a themed chip or skeleton lights up as a bright slab on black.
 *
 * The Runway is NOT one of these any more — it follows the ambient theme via
 * `theme.colors.runwayStage`, which has a value per scheme. Reach for this only
 * where the backdrop is genuinely dark regardless of preference.
 *
 * This is the general form of the per-component `onDarkStage` props (see `Chip`,
 * `Skeleton`, `AppText`) — the same intent expressed as scope instead of a prop
 * threaded through every child. The stored preference and its setters pass
 * through untouched, so a control rendered inside a scope still writes the real
 * user preference.
 */
export function DarkStageThemeScope({ children }: { children: React.ReactNode }) {
  const parent = useTheme();

  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, resolvedTheme: 'dark', scheme: 'dark', theme: tokens.themes.dark }),
    [parent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * A screen that is not on display takes a theme change a beat later.
 *
 * Every visited tab stays mounted (see `freezeHiddenTabs.tsx`), so a theme
 * change used to repaint all of them before the one being looked at could
 * show the new colours. Inside this scope, while `deferred` is true, the
 * screen reads the theme through `useDeferredValue`: the urgent pass skips it
 * entirely (its value has not changed yet) and React repaints it afterwards
 * in the background, interruptibly. When it comes back on display it reads
 * the live value again — by then the background pass has normally caught up,
 * so nothing re-renders on the way in.
 */
export function DeferredThemeScope({
  deferred,
  children,
}: {
  deferred: boolean;
  children: React.ReactNode;
}) {
  const parent = useTheme();
  const lagging = React.useDeferredValue(parent);

  return (
    <ThemeContext.Provider value={deferred ? lagging : parent}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
