import * as SecureStore from 'expo-secure-store';

const SEARCH_HISTORY_KEY = 'threadly.mobile.search.history';
const SEARCH_HISTORY_HIDDEN_KEY = 'threadly.mobile.search.hidden';
const MAX_RECENT = 12;

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, value: string[]) {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export async function getLocalRecentSearches() {
  return readList(SEARCH_HISTORY_KEY);
}

export async function saveRecentSearch(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return;
  const current = await readList(SEARCH_HISTORY_KEY);
  const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, MAX_RECENT);
  await writeList(SEARCH_HISTORY_KEY, next);
}

export async function removeRecentSearch(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return;
  const [current, hidden] = await Promise.all([readList(SEARCH_HISTORY_KEY), readList(SEARCH_HISTORY_HIDDEN_KEY)]);
  await Promise.all([
    writeList(SEARCH_HISTORY_KEY, current.filter((item) => item !== normalized)),
    writeList(SEARCH_HISTORY_HIDDEN_KEY, [normalized, ...hidden.filter((item) => item !== normalized)].slice(0, MAX_RECENT * 2)),
  ]);
}

export async function getHiddenSearches() {
  return readList(SEARCH_HISTORY_HIDDEN_KEY);
}
