import axios, { type AxiosInstance, AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { env } from '@/src/config/env';
import { apiHostDevLog, apiHostDevWarn } from '@/src/features/feed/utils/feedDiagnostics';
import { finishNetworkTrace, startNetworkTrace } from './networkTrace';

const DEFAULT_PORT = 3040;
const MOBILE_PLATFORM_HEADER = 'x-client-platform';
const MOBILE_PLATFORM_VALUE = 'mobile';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

function getExpoHostHint(): string | null {
  const expoConfigHostUri = (Constants as any)?.expoConfig?.hostUri;
  const manifest2HostUri = (Constants as any)?.manifest2?.debuggerHost;
  const manifestHostUri = (Constants as any)?.manifest?.debuggerHost;

  const rawHostUri = [expoConfigHostUri, manifest2HostUri, manifestHostUri].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );

  if (typeof rawHostUri !== 'string') return null;

  const hostPart = rawHostUri
    .replace(/^exp:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .trim();

  return hostPart.length > 0 ? hostPart : null;
}

function normalizeApiBaseUrl(
  rawUrl: string,
  options?: { applyAndroidLocalhostRewrite?: boolean },
): string {
  const trimmed = rawUrl.trim();
  const applyAndroidLocalhostRewrite =
    options?.applyAndroidLocalhostRewrite !== false;

  try {
    const parsed = new URL(trimmed);

    if (Platform.OS === 'android' && applyAndroidLocalhostRewrite) {
      const expoHost = getExpoHostHint();
      const shouldSwapHost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '10.0.2.2';

      if (shouldSwapHost) {
        if (expoHost) {
          parsed.hostname = expoHost;
        } else if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '10.0.2.2'
        ) {
          parsed.hostname = '10.0.2.2';
        }
      }
    }

    if (!parsed.port) {
      parsed.port = String(DEFAULT_PORT);
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (LOCAL_HOSTS.has(normalized) || normalized === 'host.docker.internal') {
    return true;
  }

  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;

  const octets = normalized.split('.');
  if (octets.length === 4 && octets.every((part) => /^\d+$/.test(part))) {
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    if (first === 172 && second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
}

function buildBaseUrlWithHost(baseUrl: string, hostname: string): string | null {
  try {
    const parsed = new URL(baseUrl);
    parsed.hostname = hostname;
    if (!parsed.port) {
      parsed.port = String(DEFAULT_PORT);
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function pushUniqueCandidate(
  target: string[],
  candidate: string | null | undefined,
  options?: { applyAndroidLocalhostRewrite?: boolean },
) {
  if (!candidate) return;
  const normalized = normalizeApiBaseUrl(candidate, options);
  if (!target.includes(normalized)) {
    target.push(normalized);
  }
}

/**
 * Detect if running on a physical device vs simulator/emulator.
 * Physical devices cannot use localhost or 10.0.2.2 to reach the dev machine.
 */
function isPhysicalDevice(): boolean {
  // expo-constants provides isDevice which is true for physical devices
  return Constants.isDevice ?? false;
}

function getDefaultBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) return normalizeApiBaseUrl(envUrl);

  if (!__DEV__) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL/EXPO_PUBLIC_API_BASE_URL. Production mobile builds require a stable API base URL.',
    );
  }

  // Physical devices cannot use localhost/10.0.2.2 to reach the dev machine.
  if (isPhysicalDevice()) {
    if (__DEV__) {
      console.warn(
        '[api] Running on physical device without EXPO_PUBLIC_API_URL set.\n' +
        'Set it to your machine\'s local IP, e.g.:\n' +
        'EXPO_PUBLIC_API_URL=http://192.168.x.x:3040 npx expo start'
      );
    }
    return Platform.OS === 'android'
      ? `http://10.0.2.2:${DEFAULT_PORT}`
      : `http://localhost:${DEFAULT_PORT}`;
  }

  // Prefer app env config if present.
  if (env?.apiBaseUrl) return normalizeApiBaseUrl(env.apiBaseUrl);

  // Emulator/Simulator
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }

  // iOS simulator / web
  return `http://localhost:${DEFAULT_PORT}`;
}

function getBaseUrlCandidates(): string[] {
  const configuredUrl = getDefaultBaseUrl();
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, configuredUrl);

  try {
    const parsed = new URL(configuredUrl);
    const expoHost = getExpoHostHint();
    const primaryHost = parsed.hostname;
    const privateOrLoopback = isPrivateOrLoopbackHost(primaryHost);
    const runningOnPhysicalDevice = isPhysicalDevice();

    if (Platform.OS === 'android') {
      if (expoHost && expoHost !== primaryHost && privateOrLoopback) {
        pushUniqueCandidate(candidates, buildBaseUrlWithHost(configuredUrl, expoHost));
      }

      if (!runningOnPhysicalDevice) {
        pushUniqueCandidate(
          candidates,
          buildBaseUrlWithHost(configuredUrl, '10.0.2.2'),
          { applyAndroidLocalhostRewrite: false },
        );
        pushUniqueCandidate(
          candidates,
          buildBaseUrlWithHost(configuredUrl, '127.0.0.1'),
          { applyAndroidLocalhostRewrite: false },
        );
        pushUniqueCandidate(
          candidates,
          buildBaseUrlWithHost(configuredUrl, 'localhost'),
          { applyAndroidLocalhostRewrite: false },
        );
      }
    } else {
      if (expoHost && expoHost !== primaryHost && privateOrLoopback) {
        pushUniqueCandidate(candidates, buildBaseUrlWithHost(configuredUrl, expoHost));
      }
      pushUniqueCandidate(candidates, buildBaseUrlWithHost(configuredUrl, 'localhost'));
    }
  } catch {
    // Keep the configured URL only.
  }

  return candidates;
}

const baseUrlCandidates = getBaseUrlCandidates();
let activeBaseUrlIndex = 0;

const getActiveBaseUrl = () =>
  baseUrlCandidates[Math.min(activeBaseUrlIndex, baseUrlCandidates.length - 1)] ??
  `http://localhost:${DEFAULT_PORT}`;

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

export const getActiveApiBaseUrl = () => getActiveBaseUrl();

export const getApiEnvironmentKey = () => hashString(getActiveBaseUrl());

const baseURL = getActiveBaseUrl();

if (__DEV__) {
  apiHostDevLog('active-host', {
    baseURL,
    candidates: baseUrlCandidates,
    isPhysicalDevice: isPhysicalDevice(),
    platform: Platform.OS,
  });
}

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

const refreshClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    [MOBILE_PLATFORM_HEADER]: MOBILE_PLATFORM_VALUE,
  },
});

refreshClient.interceptors.request.use((config) => startNetworkTrace(config));
refreshClient.interceptors.response.use(
  (res) => {
    finishNetworkTrace(res.config, res);
    return res;
  },
  (error: AxiosError) => {
    finishNetworkTrace(error.config, error.response, error);
    return Promise.reject(error);
  },
);

function applyBaseUrl(baseUrl: string) {
  apiClient.defaults.baseURL = baseUrl;
  refreshClient.defaults.baseURL = baseUrl;
}

let currentAuthToken: string | null = null;
let currentRefreshToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

type RetryableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _hostFailoverAttempts?: number;
  _hostFailoverStartIndex?: number;
  _hostCandidateIndex?: number;
};

function findCandidateIndex(baseUrl: string | null | undefined): number {
  if (!baseUrl) return -1;

  const normalized = normalizeApiBaseUrl(baseUrl, {
    applyAndroidLocalhostRewrite: false,
  });

  return baseUrlCandidates.findIndex((candidate) => candidate === normalized);
}

function resolveNextCandidateIndex(startIndex: number, attemptCount: number): number | null {
  const candidateCount = baseUrlCandidates.length;
  if (candidateCount <= 1) return null;
  if (attemptCount >= candidateCount - 1) return null;
  return (startIndex + attemptCount + 1) % candidateCount;
}

function promoteActiveHostTo(index: number, reason: string) {
  if (index < 0 || index >= baseUrlCandidates.length) return;
  if (index === activeBaseUrlIndex) return;

  activeBaseUrlIndex = index;
  const next = getActiveBaseUrl();
  applyBaseUrl(next);

  if (__DEV__) {
    apiHostDevWarn('active-host-pinned', { baseURL: next, reason });
  }
}

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

function parseRequestBody(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return { rawBody: data };
    }
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return { rawBody: String(data) };
}

function summarizeLoginPayload(payload: Record<string, unknown> | null) {
  if (!payload) return null;

  const identifierValue =
    typeof payload.email === 'string'
      ? payload.email
      : typeof payload.identifier === 'string'
        ? payload.identifier
        : '';
  const passwordValue = typeof payload.password === 'string' ? payload.password : '';

  return {
    hasEmailField: typeof payload.email === 'string',
    hasIdentifierField: typeof payload.identifier === 'string',
    identifierLength: identifierValue.length,
    identifierHasAtSign: identifierValue.includes('@'),
    identifierLeadingWhitespace: /^\s/.test(identifierValue),
    identifierTrailingWhitespace: /\s$/.test(identifierValue),
    passwordMasked: passwordValue ? '*'.repeat(passwordValue.length) : '(empty)',
    passwordLength: passwordValue.length,
    passwordLeadingWhitespace: /^\s/.test(passwordValue),
    passwordTrailingWhitespace: /\s$/.test(passwordValue),
  };
}

async function refreshAccessToken(): Promise<string | null> {
  if (!currentRefreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await refreshClient.post('/auth/refresh', {
          refreshToken: currentRefreshToken,
        });
        const data = unwrapData<any>(response.data);
        const accessToken: string | null =
          (data as any)?.accessToken ?? (data as any)?.token ?? null;
        const rotatedRefreshToken: string | null =
          (data as any)?.refreshToken ?? null;

        if (accessToken) {
          setApiAuthToken(accessToken);
        }
        if (rotatedRefreshToken && typeof rotatedRefreshToken === 'string') {
          setApiRefreshToken(rotatedRefreshToken);
        }

        return accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export function setApiAuthToken(token: string | null) {
  currentAuthToken = token;
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export function setApiRefreshToken(token: string | null) {
  currentRefreshToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

apiClient.interceptors.request.use((config) => {
  const retryableConfig = config as RetryableConfig;

  const requestBaseUrl =
    retryableConfig.baseURL ?? apiClient.defaults.baseURL ?? getActiveBaseUrl();
  const requestCandidateIndex = (() => {
    const resolved = findCandidateIndex(requestBaseUrl);
    return resolved >= 0 ? resolved : activeBaseUrlIndex;
  })();

  retryableConfig.baseURL =
    baseUrlCandidates[requestCandidateIndex] ?? requestBaseUrl;
  retryableConfig._hostCandidateIndex = requestCandidateIndex;
  if (retryableConfig._hostFailoverStartIndex == null) {
    retryableConfig._hostFailoverStartIndex = requestCandidateIndex;
  }

  const headers =
    retryableConfig.headers instanceof AxiosHeaders
      ? retryableConfig.headers
      : new AxiosHeaders(retryableConfig.headers as any);

  if (currentAuthToken) {
    headers.set('Authorization', `Bearer ${currentAuthToken}`);
  }
  headers.set(MOBILE_PLATFORM_HEADER, MOBILE_PLATFORM_VALUE);
  retryableConfig.headers = headers;

  if (__DEV__) {
    const activeRequestBaseUrl = retryableConfig.baseURL ?? apiClient.defaults.baseURL ?? '';
    console.log(
      `[api] ${retryableConfig.method?.toUpperCase()} ${activeRequestBaseUrl}${retryableConfig.url}`,
    );

    if (retryableConfig.url?.includes('/auth/login')) {
      const payload = parseRequestBody(retryableConfig.data);
      console.log('[api] /auth/login outbound payload', summarizeLoginPayload(payload));
    }
  }
  startNetworkTrace(retryableConfig);
  return retryableConfig;
});

apiClient.interceptors.response.use(
  (res) => {
    finishNetworkTrace(res.config, res);
    const successfulIndex = findCandidateIndex(res.config?.baseURL);
    if (successfulIndex >= 0) {
      promoteActiveHostTo(successfulIndex, `HTTP ${res.status}`);
    }

    if (__DEV__) {
      console.log(`[api] ? ${res.status} ${res.config.url}`);
    }
    return res;
  },
  async (error: AxiosError) => {
    finishNetworkTrace(error.config, error.response, error);
    if (__DEV__) {
      console.log(`[api] ? ${error.message}`, {
        url: error.config?.url,
        status: error.response?.status,
        data: error.response?.data,
      });

      if (error.config?.url?.includes('/auth/login')) {
        const payload = parseRequestBody(error.config?.data);
        console.log('[api] /auth/login failed payload snapshot', {
          request: summarizeLoginPayload(payload),
          responseStatus: error.response?.status,
          responseData: error.response?.data,
        });
      }
    }

    const status = error.response?.status;
    const originalRequest = error.config as RetryableConfig | undefined;

    if (error.response && originalRequest) {
      const reachableIndex = findCandidateIndex(
        originalRequest.baseURL ?? apiClient.defaults.baseURL,
      );
      if (reachableIndex >= 0) {
        promoteActiveHostTo(reachableIndex, `HTTP ${error.response.status}`);
      }
    }

    const attemptCount = originalRequest?._hostFailoverAttempts ?? 0;
    const canTryFailover =
      !error.response &&
      !!originalRequest &&
      attemptCount < Math.max(baseUrlCandidates.length - 1, 0);

    if (canTryFailover && originalRequest) {
      const startIndex =
        originalRequest._hostFailoverStartIndex ??
        (() => {
          const resolved = findCandidateIndex(
            originalRequest.baseURL ?? apiClient.defaults.baseURL,
          );
          return resolved >= 0 ? resolved : activeBaseUrlIndex;
        })();
      const nextIndex = resolveNextCandidateIndex(startIndex, attemptCount);

      if (nextIndex != null) {
        const nextBaseUrl =
          baseUrlCandidates[nextIndex] ??
          baseUrlCandidates[Math.min(activeBaseUrlIndex, baseUrlCandidates.length - 1)] ??
          `http://localhost:${DEFAULT_PORT}`;

        originalRequest._hostFailoverAttempts = attemptCount + 1;
        originalRequest._hostFailoverStartIndex = startIndex;
        originalRequest._hostCandidateIndex = nextIndex;
        originalRequest.baseURL = nextBaseUrl;

        const headers =
          originalRequest.headers instanceof AxiosHeaders
            ? originalRequest.headers
            : new AxiosHeaders(originalRequest.headers as any);
        if (currentAuthToken) {
          headers.set('Authorization', `Bearer ${currentAuthToken}`);
        }
        headers.set(MOBILE_PLATFORM_HEADER, MOBILE_PLATFORM_VALUE);
        originalRequest.headers = headers;

        if (__DEV__) {
          const isFeedRequest = originalRequest.url?.includes('/collections/market');
          apiHostDevWarn(isFeedRequest ? 'feed-host-failover' : 'host-failover', {
            fromBaseUrl: baseUrlCandidates[startIndex],
            nextBaseUrl,
            url: originalRequest.url,
            attempt: originalRequest._hostFailoverAttempts,
          });
        }

        return apiClient(originalRequest);
      }
    }

    if (status === 401 && originalRequest && !isAuthEndpoint(originalRequest.url)) {
      if (!originalRequest._retry) {
        originalRequest._retry = true;

        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          const headers =
            originalRequest.headers instanceof AxiosHeaders
              ? originalRequest.headers
              : new AxiosHeaders(originalRequest.headers as any);
          headers.set('Authorization', `Bearer ${refreshedToken}`);
          headers.set(MOBILE_PLATFORM_HEADER, MOBILE_PLATFORM_VALUE);
          originalRequest.headers = headers;
          return apiClient(originalRequest);
        }
      }

      if (unauthorizedHandler) {
        try {
          unauthorizedHandler();
        } catch {
          // ignore
        }
      }
    }

    return Promise.reject(error);
  },
);
