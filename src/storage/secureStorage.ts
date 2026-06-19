import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from '../config/env';

const WEB_DEV_SECURE_STORE_PREFIX = 'THREADLY_DEV_SECURE_STORE:';
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

const setSecureItem = async (key: string, value: string): Promise<void> => {
  if (setWebDevItem(key, value)) return;
  await SecureStore.setItemAsync(key, value);
};

const removeSecureItem = async (key: string): Promise<void> => {
  if (removeWebDevItem(key)) return;

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Secure storage cleanup is best effort.
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getSecureItem(env.tokenStorageKey);
};

export const setAccessToken = async (token: string): Promise<void> => {
  await setSecureItem(env.tokenStorageKey, token);
};

export const getRefreshToken = async (): Promise<string | null> => {
  return getSecureItem(env.refreshTokenStorageKey);
};

export const setRefreshToken = async (token: string): Promise<void> => {
  await setSecureItem(env.refreshTokenStorageKey, token);
};

export const removeAccessToken = async (): Promise<void> => {
  await removeSecureItem(env.tokenStorageKey);
};

export const removeRefreshToken = async (): Promise<void> => {
  await removeSecureItem(env.refreshTokenStorageKey);
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
