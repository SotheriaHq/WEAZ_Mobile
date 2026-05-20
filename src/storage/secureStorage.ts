import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from '../config/env';

const WEB_DEV_SECURE_STORE_PREFIX = 'THREADLY_DEV_SECURE_STORE:';

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

export const getAccessToken = async (): Promise<string | null> => {
  const webToken = getWebDevItem(env.tokenStorageKey);
  if (webToken) return webToken;

  try {
    return await SecureStore.getItemAsync(env.tokenStorageKey);
  } catch {
    return null;
  }
};

export const setAccessToken = async (token: string): Promise<void> => {
  if (setWebDevItem(env.tokenStorageKey, token)) return;
  await SecureStore.setItemAsync(env.tokenStorageKey, token);
};

export const getRefreshToken = async (): Promise<string | null> => {
  const webToken = getWebDevItem(env.refreshTokenStorageKey);
  if (webToken) return webToken;

  try {
    return await SecureStore.getItemAsync(env.refreshTokenStorageKey);
  } catch {
    return null;
  }
};

export const setRefreshToken = async (token: string): Promise<void> => {
  if (setWebDevItem(env.refreshTokenStorageKey, token)) return;
  await SecureStore.setItemAsync(env.refreshTokenStorageKey, token);
};

export const removeAccessToken = async (): Promise<void> => {
  if (removeWebDevItem(env.tokenStorageKey)) return;

  try {
    await SecureStore.deleteItemAsync(env.tokenStorageKey);
  } catch {
    // ignore
  }
};

export const removeRefreshToken = async (): Promise<void> => {
  if (removeWebDevItem(env.refreshTokenStorageKey)) return;

  try {
    await SecureStore.deleteItemAsync(env.refreshTokenStorageKey);
  } catch {
    // ignore
  }
};
