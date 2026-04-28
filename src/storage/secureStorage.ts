import * as SecureStore from 'expo-secure-store';
import { env } from '../config/env';

export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(env.tokenStorageKey);
  } catch {
    return null;
  }
};

export const setAccessToken = async (token: string): Promise<void> => {
  await SecureStore.setItemAsync(env.tokenStorageKey, token);
};

export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(env.refreshTokenStorageKey);
  } catch {
    return null;
  }
};

export const setRefreshToken = async (token: string): Promise<void> => {
  await SecureStore.setItemAsync(env.refreshTokenStorageKey, token);
};

export const removeAccessToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(env.tokenStorageKey);
  } catch {
    // ignore
  }
};

export const removeRefreshToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(env.refreshTokenStorageKey);
  } catch {
    // ignore
  }
};
