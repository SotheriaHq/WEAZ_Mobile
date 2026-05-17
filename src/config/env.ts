type EnvKey =
  | 'EXPO_PUBLIC_API_BASE_URL'
  | 'EXPO_PUBLIC_WEB_APP_URL'
  | 'EXPO_PUBLIC_TRUSTED_WEB_ORIGINS'
  | 'EXPO_PUBLIC_API_WITH_CREDENTIALS'
  | 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'
  | 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
  | 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'
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
const webAppUrl = getEnvVar('EXPO_PUBLIC_WEB_APP_URL', 'http://localhost:5173');
const trustedWebOriginsRaw = getEnvVar('EXPO_PUBLIC_TRUSTED_WEB_ORIGINS', '');
const apiWithCredentials = parseBoolean(getEnvVar('EXPO_PUBLIC_API_WITH_CREDENTIALS', 'true'));
const googleWebClientId = getEnvVar('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', '');
const googleIosClientId = getEnvVar('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', '');
const googleAndroidClientId = getEnvVar('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID', '');
const tokenStorageKey = getEnvVar('EXPO_PUBLIC_TOKEN_STORAGE_KEY', 'THREADLY_ACCESS_TOKEN');
const refreshTokenStorageKey = getEnvVar(
  'EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY',
  'THREADLY_REFRESH_TOKEN',
);
const userStorageKey = getEnvVar('EXPO_PUBLIC_USER_STORAGE_KEY', 'THREADLY_USER');

export const env = {
  apiBaseUrl,
  webAppUrl,
  trustedWebOrigins: trustedWebOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  api: {
    withCredentials: apiWithCredentials,
    defaultConfig: {
      baseURL: apiBaseUrl,
      withCredentials: apiWithCredentials,
    },
  },
  google: {
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
    configured:
      [googleWebClientId, googleIosClientId, googleAndroidClientId].some(
        (value) => value.length > 0 && !value.startsWith('<'),
      ),
  },
  tokenStorageKey,
  refreshTokenStorageKey,
  userStorageKey,
} as const;
