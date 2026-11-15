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

const CREDENTIALS_KEY = `${env.tokenStorageKey}.credentials.v2`;
type Credentials = { version: 2; accessToken: string | null; refreshToken: string | null };
const readCredentialsRaw = async (): Promise<Credentials | null> => {
  const raw = await getSecureItem(CREDENTIALS_KEY);
  try {
    const value = raw ? JSON.parse(raw) as Credentials : null;
    return value?.version === 2 ? value : null;
  } catch { return null; }
};
export const setSessionTokens = (accessToken: string, refreshToken: string | null,
  stillCurrent: () => boolean = () => true): Promise<boolean> => enqueueWrite(async () => {
  if (!stillCurrent()) return false;
  // One secure-store value: power loss cannot leave an access/refresh mismatch.
  await writeRaw(CREDENTIALS_KEY, JSON.stringify({ version: 2, accessToken, refreshToken }));
  // The approved fresh-sign-in cutover retires the previous independent keys.
  await Promise.all([removeRaw(env.tokenStorageKey), removeRaw(env.refreshTokenStorageKey)]).catch(() => undefined);
  return stillCurrent();
});
export const getAccessToken = async (): Promise<string | null> => {
  await writeQueue; return (await readCredentialsRaw())?.accessToken ?? null;
};
export const getRefreshToken = async (): Promise<string | null> => {
  await writeQueue; return (await readCredentialsRaw())?.refreshToken ?? null;
};
export const setAccessToken = (token: string): Promise<void> => enqueueWrite(async () => {
  const previous = await readCredentialsRaw();
  await writeRaw(CREDENTIALS_KEY, JSON.stringify({ version: 2, accessToken: token, refreshToken: previous?.refreshToken ?? null }));
});
export const setRefreshToken = (token: string): Promise<void> => enqueueWrite(async () => {
  const previous = await readCredentialsRaw();
  await writeRaw(CREDENTIALS_KEY, JSON.stringify({ version: 2, accessToken: previous?.accessToken ?? null, refreshToken: token }));
});
export const removeAccessToken = async (): Promise<void> => {
  await removeSecureItem(CREDENTIALS_KEY); await removeSecureItem(env.tokenStorageKey);
};
export const removeRefreshToken = async (): Promise<void> => {
  await removeSecureItem(CREDENTIALS_KEY); await removeSecureItem(env.refreshTokenStorageKey);
};

export const getCachedAuthUser = async (accessToken: string): Promise<unknown | null> => {
  const raw = await getSecureItem(env.userStorageKey);
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
  await setSecureItem(env.userStorageKey, JSON.stringify(snapshot));
};

export const removeCachedAuthUser = async (): Promise<void> => {
  await removeSecureItem(env.userStorageKey);
};
