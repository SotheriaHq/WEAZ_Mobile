const MAX_WARM_SCREEN_STATE_ENTRIES = 32;
const warmScreenStateCache = new Map<string, unknown>();
const UI_STATE_PREFIX = 'ui:';

function trimWarmScreenStateCache() {
  while (warmScreenStateCache.size > MAX_WARM_SCREEN_STATE_ENTRIES) {
    const oldestKey = warmScreenStateCache.keys().next().value;
    if (!oldestKey) return;
    warmScreenStateCache.delete(oldestKey);
  }
}

export function readWarmScreenState<T>(key: string): T | null {
  return (warmScreenStateCache.get(key) as T | undefined) ?? null;
}

export function writeWarmScreenState<T>(key: string, value: T) {
  warmScreenStateCache.set(key, value);
  trimWarmScreenStateCache();
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
  warmScreenStateCache.clear();
}
