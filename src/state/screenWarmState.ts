const MAX_WARM_SCREEN_STATE_ENTRIES = 32;
const warmScreenStateCache = new Map<string, unknown>();

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

export function clearWarmScreenStateCache() {
  warmScreenStateCache.clear();
}