const MAX_WARM_SCREEN_STATE_ENTRIES = 32;
const warmScreenStateCache = new Map<string, unknown>();
const warmScreenStateListeners = new Map<string, Set<() => void>>();
const UI_STATE_PREFIX = 'ui:';

function notifyWarmScreenStateListeners(key: string) {
  warmScreenStateListeners.get(key)?.forEach((listener) => listener());
}

function trimWarmScreenStateCache() {
  while (warmScreenStateCache.size > MAX_WARM_SCREEN_STATE_ENTRIES) {
    const oldestKey = warmScreenStateCache.keys().next().value;
    if (!oldestKey) return;
    warmScreenStateCache.delete(oldestKey);
    notifyWarmScreenStateListeners(oldestKey);
  }
}

export function readWarmScreenState<T>(key: string): T | null {
  return (warmScreenStateCache.get(key) as T | undefined) ?? null;
}

export function writeWarmScreenState<T>(key: string, value: T) {
  warmScreenStateCache.set(key, value);
  trimWarmScreenStateCache();
  notifyWarmScreenStateListeners(key);
}

/**
 * Observe a specific warm entry arriving after a screen has mounted.
 *
 * Persistent snapshots and predictive profile prefetch both complete
 * asynchronously. A screen that only reads the Map during `useState` setup
 * can miss either one by a few milliseconds and still paint an empty shell.
 */
export function subscribeWarmScreenState(key: string, listener: () => void): () => void {
  const listeners = warmScreenStateListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  warmScreenStateListeners.set(key, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) warmScreenStateListeners.delete(key);
  };
}

// Use this wrapper for small route lifetime state such as selected tabs/filters.
// Server data should stay with React Query or feature-owned caches.
export function readWarmScreenUiState<T>(key: string): T | null {
  return readWarmScreenState<T>(`${UI_STATE_PREFIX}${key}`);
}

export function writeWarmScreenUiState<T>(key: string, value: T) {
  writeWarmScreenState(`${UI_STATE_PREFIX}${key}`, value);
}

export function clearWarmScreenStateCache() {
  const keys = [...warmScreenStateCache.keys()];
  warmScreenStateCache.clear();
  keys.forEach(notifyWarmScreenStateListeners);
}
