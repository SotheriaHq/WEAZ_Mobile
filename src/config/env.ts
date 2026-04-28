type EnvKey =
  | 'EXPO_PUBLIC_API_BASE_URL'
  | 'EXPO_PUBLIC_API_WITH_CREDENTIALS'
  | 'EXPO_PUBLIC_TOKEN_STORAGE_KEY'
  | 'EXPO_PUBLIC_USER_STORAGE_KEY'
  | 'EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY';

const getEnvVar = (key: EnvKey, fallback?: string): string => {
  const value = process.env[key];
  if (typeof value === 'string' && value.length > 0) {
    return value.normalize('NFKC').trim();
  }

  if (typeof fallback !== 'undefined') {
    return fallback.normalize('NFKC').trim();
  }

  throw new Error(`Missing required environment variable: ${key}`);
};

const parseBoolean = (value: string): boolean => value.trim().toLowerCase() === 'true';

const apiBaseUrl = getEnvVar('EXPO_PUBLIC_API_BASE_URL', 'http://localhost:3040');
const apiWithCredentials = parseBoolean(getEnvVar('EXPO_PUBLIC_API_WITH_CREDENTIALS', 'true'));
const tokenStorageKey = getEnvVar('EXPO_PUBLIC_TOKEN_STORAGE_KEY', 'THREADLY_ACCESS_TOKEN');
const refreshTokenStorageKey = getEnvVar(
  'EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY',
  'THREADLY_REFRESH_TOKEN',
);
const userStorageKey = getEnvVar('EXPO_PUBLIC_USER_STORAGE_KEY', 'THREADLY_USER');

export const env = {
  apiBaseUrl,
  api: {
    withCredentials: apiWithCredentials,
    defaultConfig: {
      baseURL: apiBaseUrl,
      withCredentials: apiWithCredentials,
    },
  },
  tokenStorageKey,
  refreshTokenStorageKey,
  userStorageKey,
} as const;
