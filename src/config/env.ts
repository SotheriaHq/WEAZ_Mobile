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
  | 'EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY'
  | 'EXPO_PUBLIC_MOBILE_CHECKOUT_ENABLED';

/**
 * Every `EXPO_PUBLIC_*` value, read through a STATIC member expression.
 *
 * Expo inlines these at BUNDLE time by static code replacement, and the docs
 * are explicit that only dot notation qualifies:
 *
 *   "process.env['EXPO_PUBLIC_KEY'] or const {EXPO_PUBLIC_X} = process.env
 *    is invalid and will not be inlined."
 *
 * This file used to do `process.env[key]` — a computed member expression. The
 * bundler could not see which keys were wanted, so it inlined none of them, and
 * every value below silently fell back to its default in a release build. In
 * development the Expo CLI populates `process.env` at runtime, so the bug was
 * invisible exactly where a console would have shown it, and only appeared in a
 * standalone build. The visible symptom was "Google sign-up isn't available in
 * this version of the app": `env.google.configured` was computed from three
 * empty strings.
 *
 * The map must therefore stay a literal, one static `process.env.KEY` per line.
 * A loop, a spread, or a helper over `EnvKey` reintroduces the same bug in a
 * form that still type-checks. `scripts/test-env-inlining-contract.js` fails
 * the build if that happens.
 */
const RAW_ENV: Record<EnvKey, string | undefined> = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_WEB_APP_URL: process.env.EXPO_PUBLIC_WEB_APP_URL,
  EXPO_PUBLIC_TRUSTED_WEB_ORIGINS: process.env.EXPO_PUBLIC_TRUSTED_WEB_ORIGINS,
  EXPO_PUBLIC_API_WITH_CREDENTIALS: process.env.EXPO_PUBLIC_API_WITH_CREDENTIALS,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  EXPO_PUBLIC_TOKEN_STORAGE_KEY: process.env.EXPO_PUBLIC_TOKEN_STORAGE_KEY,
  EXPO_PUBLIC_USER_STORAGE_KEY: process.env.EXPO_PUBLIC_USER_STORAGE_KEY,
  EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY: process.env.EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY,
  EXPO_PUBLIC_MOBILE_CHECKOUT_ENABLED: process.env.EXPO_PUBLIC_MOBILE_CHECKOUT_ENABLED,
};

const getEnvVar = (key: EnvKey, fallback?: string): string => {
  const value = RAW_ENV[key];
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
const tokenStorageKey = getEnvVar('EXPO_PUBLIC_TOKEN_STORAGE_KEY', 'WIEZ_ACCESS_TOKEN');
const refreshTokenStorageKey = getEnvVar(
  'EXPO_PUBLIC_REFRESH_TOKEN_STORAGE_KEY',
  'WIEZ_REFRESH_TOKEN',
);
const userStorageKey = getEnvVar('EXPO_PUBLIC_USER_STORAGE_KEY', 'WIEZ_USER');
const mobileCheckoutEnabled = parseBoolean(
  getEnvVar('EXPO_PUBLIC_MOBILE_CHECKOUT_ENABLED', 'true'),
);

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
  mobileCheckout: {
    enabled: mobileCheckoutEnabled,
  },
} as const;
