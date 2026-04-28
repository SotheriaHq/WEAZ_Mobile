import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type TabChromeMode = 'collapsed' | 'expanded';

type TabChromeContextValue = {
  mode: TabChromeMode;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
};

const TabChromeContext = createContext<TabChromeContextValue | null>(null);

export function TabChromeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TabChromeMode>('collapsed');

  const expand = useCallback(() => {
    setMode('expanded');
  }, []);

  const collapse = useCallback(() => {
    setMode('collapsed');
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'));
  }, []);

  const value = useMemo(
    () => ({ mode, collapse, expand, toggle }),
    [mode, collapse, expand, toggle]
  );

  return <TabChromeContext.Provider value={value}>{children}</TabChromeContext.Provider>;
}

export function useTabChrome() {
  const ctx = useContext(TabChromeContext);
  if (!ctx) {
    throw new Error('useTabChrome must be used within TabChromeProvider');
  }
  return ctx;
}
