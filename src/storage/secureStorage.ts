import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from '../config/env';

const WEB_DEV_SECURE_STORE_PREFIX = 'WIEZ_DEV_SECURE_STORE:';
const AUTH_USER_SNAPSHOT_VERSION = 1;

type AuthUserSnapshot = {
  version: typeof AUTH_USER_SNAPSHOT_VERSION;
  accessToken: string;
  user: unknown;
};

const canUseWebDevFallback = () =>
  __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined';

const getWebDevStorageKey = (key: string) => `${WEB_DEV_SECURE_STORE_PREFIX}${key}`;

const getWebDevItem = (key: string): string | null => {
  if (!canUseWebDevFallback()) return null;
  try {
    return window.localStorage.getItem(getWebDevStorageKey(key));
  } catch {
    return null;
  }
};

const setWebDevItem = (key: string, token: string): boolean => {
  if (!canUseWebDevFallback()) return false;
  try {
    window.localStorage.setItem(getWebDevStorageKey(key), token);
    return true;
  } catch {
    return false;
  }
};

const removeWebDevItem = (key: string): boolean => {
  if (!canUseWebDevFallback()) return false;
  try {
    window.localStorage.removeItem(getWebDevStorageKey(key));
    return true;
  } catch {
    return false;
  }
};

const getSecureItem = async (key: string): Promise<string | null> => {
  const webValue = getWebDevItem(key);
  if (webValue) return webValue;

  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

let writeQueue: Promise<unknown> = Promise.resolve();
const enqueueWrite = <T,>(write: () => Promise<T>): Promise<T> => {
  const result = writeQueue.catch(() => undefined).then(write);
  writeQueue = result.catch(() => undefined);
  return result;
};
const writeRaw = async (key: string, value: string) => {
  if (!setWebDevItem(key, value)) await SecureStore.setItemAsync(key, value);
};
const removeRaw = async (key: string) => {
  if (removeWebDevItem(key)) return;
  await SecureStore.deleteItemAsync(key);
};
const setSecureItem = (key: string, value: string): Promise<void> => enqueueWrite(() => writeRaw(key, value));
const removeSecureItem = (key: string): Promise<void> => enqueueWrite(async () => {
  try { await removeRaw(key); } catch { /* Retry on the next explicit sign-out. */ }
});

export const PRIMARY_CREDENTIALS_KEY = 'ARU_ACCESS_TOKEN.credentials.v2';
export const LEGACY_CREDENTIALS_KEY = 'WIEZ_ACCESS_TOKEN.credentials.v2';
export const HISTORICAL_CREDENTIALS_KEYS = [
  'WIEZ_ACCESS_TOKEN',
  'WIEZ_REFRESH_TOKEN',
  'THREADLY_ACCESS_TOKEN',
  'THREADLY_REFRESH_TOKEN',
  'ARU_ACCESS_TOKEN',
  'ARU_REFRESH_TOKEN',
];

export const PRIMARY_USER_KEY = 'ARU_USER';
export const LEGACY_USER_KEYS = ['WIEZ_USER', 'THREADLY_USER'];

export type Credentials = { version: 2; accessToken: string | null; refreshToken: string | null };

export const readCredentialsRaw = async (): Promise<Credentials | null> => {
  // 1. Read primary ARU credentials
  const primaryRaw = await getSecureItem(PRIMARY_CREDENTIALS_KEY);
  if (primaryRaw) {
    try {
      const parsed = JSON.parse(primaryRaw) as Credentials;
      if (parsed?.version === 2) {
        return parsed;
      }
    } catch {
      // Corrupt primary: remove and try fallback
      await removeSecureItem(PRIMARY_CREDENTIALS_KEY).catch(() => undefined);
    }
  }

  // 2. Read legacy fallback credentials
  const legacyRaw = await getSecureItem(LEGACY_CREDENTIALS_KEY);
  if (!legacyRaw) {
    return null;
  }

  let legacyCreds: Credentials | null = null;
  try {
    const parsed = JSON.parse(legacyRaw) as Credentials;
    if (parsed?.version === 2) {
      legacyCreds = parsed;
    }
  } catch {
    return null;
  }

  if (!legacyCreds) {
    return null;
  }

  // 3. Durable migration: Write-Primary -> Verify -> Retire-Legacy
  try {
    await writeRaw(PRIMARY_CREDENTIALS_KEY, legacyRaw);
    const verified = await getSecureItem(PRIMARY_CREDENTIALS_KEY);
    if (verified === legacyRaw) {
      try {
        await removeRaw(LEGACY_CREDENTIALS_KEY);
      } catch {
        console.warn('[AuthMigration] Non-fatal legacy credential retirement failure. Retained for retry.');
      }
    }
  } catch {
    console.warn('[AuthMigration] Primary key write failed. Returning legacy credentials without migration.');
  }

  return legacyCreds;
};

export const setSessionTokens = (
  accessToken: string,
  refreshToken: string | null,
  stillCurrent: () => boolean = () => true,
): Promise<boolean> => enqueueWrite(async () => {
  if (!stillCurrent()) return false;
  const payload = JSON.stringify({ version: 2, accessToken, refreshToken });

  // 1. Strict single-write to primary key
  await writeRaw(PRIMARY_CREDENTIALS_KEY, payload);

  // 2. Verify write succeeded
  const verified = await getSecureItem(PRIMARY_CREDENTIALS_KEY);
  if (verified !== payload) {
    throw new Error('Durable verification of primary credentials failed.');
  }

  // 3. Purge legacy and historical keys asynchronously
  const purgeTargets = [
    LEGACY_CREDENTIALS_KEY,
    ...HISTORICAL_CREDENTIALS_KEYS,
  ];
  await Promise.allSettled(purgeTargets.map((key) => removeRaw(key)));

  return stillCurrent();
});

export const getAccessToken = async (): Promise<string | null> => {
  await writeQueue;
  return (await readCredentialsRaw())?.accessToken ?? null;
};

export const getRefreshToken = async (): Promise<string | null> => {
  await writeQueue;
  return (await readCredentialsRaw())?.refreshToken ?? null;
};

export const setAccessToken = (token: string): Promise<void> => enqueueWrite(async () => {
  const previous = await readCredentialsRaw();
  const payload = JSON.stringify({ version: 2, accessToken: token, refreshToken: previous?.refreshToken ?? null });
  await writeRaw(PRIMARY_CREDENTIALS_KEY, payload);
  const verified = await getSecureItem(PRIMARY_CREDENTIALS_KEY);
  if (verified !== payload) {
    throw new Error('Durable verification of primary credentials failed.');
  }
  await Promise.allSettled([LEGACY_CREDENTIALS_KEY, ...HISTORICAL_CREDENTIALS_KEYS].map((k) => removeRaw(k)));
});

export const setRefreshToken = (token: string): Promise<void> => enqueueWrite(async () => {
  const previous = await readCredentialsRaw();
  const payload = JSON.stringify({ version: 2, accessToken: previous?.accessToken ?? null, refreshToken: token });
  await writeRaw(PRIMARY_CREDENTIALS_KEY, payload);
  const verified = await getSecureItem(PRIMARY_CREDENTIALS_KEY);
  if (verified !== payload) {
    throw new Error('Durable verification of primary credentials failed.');
  }
  await Promise.allSettled([LEGACY_CREDENTIALS_KEY, ...HISTORICAL_CREDENTIALS_KEYS].map((k) => removeRaw(k)));
});

export const clearCredentials = async (): Promise<{ success: boolean; errors: string[] }> => {
  const purgeTargets = [
    PRIMARY_CREDENTIALS_KEY,
    LEGACY_CREDENTIALS_KEY,
    ...HISTORICAL_CREDENTIALS_KEYS,
  ];
  const results = await Promise.allSettled(purgeTargets.map((k) => removeRaw(k)));
  const errors: string[] = [];
  results.forEach((res, idx) => {
    if (res.status === 'rejected') {
      errors.push(`Failed to delete ${purgeTargets[idx]}: ${String(res.reason)}`);
    }
  });
  return { success: errors.length === 0, errors };
};

export const removeAccessToken = async (): Promise<void> => {
  await clearCredentials();
};

export const removeRefreshToken = async (): Promise<void> => {
  await clearCredentials();
};

export const getCachedAuthUser = async (accessToken: string): Promise<unknown | null> => {
  let raw = await getSecureItem(PRIMARY_USER_KEY);
  if (!raw) {
    for (const legacyKey of LEGACY_USER_KEYS) {
      const legacy = await getSecureItem(legacyKey);
      if (legacy) {
        try {
          const snapshot = JSON.parse(legacy) as Partial<AuthUserSnapshot>;
          if (
            snapshot.version === AUTH_USER_SNAPSHOT_VERSION &&
            snapshot.accessToken === accessToken &&
            snapshot.user &&
            typeof snapshot.user === 'object'
          ) {
            try {
              await writeRaw(PRIMARY_USER_KEY, legacy);
              await removeRaw(legacyKey);
            } catch {
              // Best effort migration
            }
            return snapshot.user;
          }
        } catch {
          // Corrupt legacy snapshot
        }
      }
    }
  }

  if (!raw) return null;

  try {
    const snapshot = JSON.parse(raw) as Partial<AuthUserSnapshot>;
    if (
      snapshot.version !== AUTH_USER_SNAPSHOT_VERSION ||
      snapshot.accessToken !== accessToken ||
      !snapshot.user ||
      typeof snapshot.user !== 'object'
    ) {
      return null;
    }
    return snapshot.user;
  } catch {
    return null;
  }
};

export const setCachedAuthUser = async (accessToken: string, user: unknown): Promise<void> => {
  const snapshot: AuthUserSnapshot = {
    version: AUTH_USER_SNAPSHOT_VERSION,
    accessToken,
    user,
  };
  await setSecureItem(PRIMARY_USER_KEY, JSON.stringify(snapshot));
  await Promise.allSettled(LEGACY_USER_KEYS.map((k) => removeRaw(k)));
};

export const removeCachedAuthUser = async (): Promise<void> => {
  await Promise.allSettled([PRIMARY_USER_KEY, ...LEGACY_USER_KEYS].map((k) => removeRaw(k)));
};
