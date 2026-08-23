import axios, { type AxiosInstance, AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { env } from '@/src/config/env';
import { apiHostDevLog, apiHostDevWarn, isWiezDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';
import { finishNetworkTrace, startNetworkTrace } from './networkTrace';
import { createRequestId } from '@/src/utils/requestId';

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
      if (isPrivateOrLoopbackHost(parsed.hostname)) {
        parsed.port = String(DEFAULT_PORT);
      }
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
      if (isPrivateOrLoopbackHost(parsed.hostname)) {
        parsed.port = String(DEFAULT_PORT);
      }
    }
    // Downgrade SSL protocol to http for private/loopback failover hosts
    if (isPrivateOrLoopbackHost(parsed.hostname) && parsed.protocol === 'https:') {
      parsed.protocol = 'http:';
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

/* ══════════════════════════════════════════════════════════════════════════
   Transport-level GET coalescing.

   `coalesceRequest` already exists, but it only helps a call site that opts in
   — so every screen written since, and every screen that forgot, still issues
   its own duplicate. A cold start as a brand showed the result plainly:

     GET /collections/market                          x2
     GET /designs/user/:id?limit=50                   x2
     GET /store-collections/user/:id?limit=50         x2

   Three redundant round trips that no single call site could see, because the
   duplication is BETWEEN independent screens warming at the same moment.

   Moving the dedupe into the adapter fixes the whole class at once: any two GETs
   with the same URL and params, issued while the first is still in flight, share
   one response. A short settle window also collapses the remount bursts that a
   tab preloader produces, without behaving like a cache — nobody should see data
   older than a few seconds from this.

   Scope is deliberately narrow:
   - GET only. Anything that mutates is never shared.
   - Requests carrying an AbortSignal opt out, because one caller aborting must
     not cancel another caller's work.
   - Failures are never retained; the next caller retries for real.
   ══════════════════════════════════════════════════════════════════════════ */
const GET_DEDUPE_WINDOW_MS = 4_000;

type DedupeEntry = {
  inFlight: Promise<any> | null;
  response?: any;
  settledAt?: number;
};

const getDedupeEntries = new Map<string, DedupeEntry>();

function buildDedupeKey(config: InternalAxiosRequestConfig): string | null {
  const method = String(config.method ?? 'get').toUpperCase();
  if (method !== 'GET') return null;
  if (config.signal) return null;
  if (config.headers?.['x-no-dedupe']) return null;

  let params = '';
  try {
    params = config.params ? JSON.stringify(config.params) : '';
  } catch {
    // Unserializable params (a Map, a circular object) mean we cannot prove two
    // requests are the same, so we do not claim they are.
    return null;
  }
  return `${config.baseURL ?? ''}|${config.url ?? ''}|${params}`;
}

/** Drop coalesced GETs so the next read goes to the network. */
export function invalidateGetDedupe(urlFragment?: string) {
  if (!urlFragment) {
    getDedupeEntries.clear();
    return;
  }
  for (const key of Array.from(getDedupeEntries.keys())) {
    if (key.includes(urlFragment)) getDedupeEntries.delete(key);
  }
}

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

/**
 * Set once the server has told us this session is definitively dead (the refresh
 * token itself was rejected), as opposed to a network blip.
 *
 * Without this latch every wave of 401s starts a *fresh* `/auth/refresh` round
 * trip, because `refreshPromise` clears in its own `finally`. A boot that fans
 * out ~15 authenticated calls against a dead session therefore pays for several
 * serial refresh attempts against a slow API — one `bag/count` was measured at
 * 10.5s. It also cannot succeed: a rejected refresh token stays rejected until
 * the user signs in again.
 *
 * Cleared by `setApiRefreshToken` whenever a real token arrives (sign-in).
 */
let refreshTokenRejected = false;

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

  if (isWiezDebugEnabled('network')) {
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
  // Already told "no" by the server — fail fast instead of re-asking per request.
  if (refreshTokenRejected) return null;

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
      } catch (error) {
        // Only latch on an explicit rejection. A timeout or offline device must
        // stay retryable, or a tunnel blip would strand a valid session.
        const refreshStatus = Number((error as any)?.response?.status ?? 0);
        if (refreshStatus === 401 || refreshStatus === 403) {
          refreshTokenRejected = true;
        }
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

/**
 * Cold-start auth gate.
 *
 * The access token lives in SecureStore, so restoring it is asynchronous — but
 * every screen mounts and starts fetching immediately, and this interceptor
 * attached whatever `currentAuthToken` happened to be at that instant, which
 * on a cold start is `null`. The result was a burst of ~15 authenticated
 * requests going out unauthenticated, all 401-ing, all retried after the token
 * landed: the entire authenticated cold-start payload, twice, plus a round of
 * server work spent rejecting requests. One `/bag/count` was measured at
 * 10.1 seconds because of it.
 *
 * Requests now wait for the token state to be KNOWN (which includes knowing
 * there isn't one). The wait is bounded so a failed restore degrades to the old
 * behaviour rather than hanging the app, and the unauthenticated `/auth/*`
 * endpoints are exempt — `/auth/refresh` is what OPENS the gate during a
 * refresh-token-only restore, so gating it would deadlock.
 */
let authHydrated = false;
let openAuthGate: (() => void) | null = null;
const authHydrationPromise = new Promise<void>((resolve) => {
  openAuthGate = resolve;
});
const AUTH_HYDRATION_TIMEOUT_MS = 4000;

/** Paths that must never wait on the gate — they run before a token exists. */
const AUTH_GATE_EXEMPT_PREFIXES = [
  '/auth/refresh',
  '/auth/login',
  '/auth/register',
  '/auth/google',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/resend',
];

export function markApiAuthHydrated() {
  if (authHydrated) return;
  authHydrated = true;
  openAuthGate?.();
}

function isAuthGateExempt(url?: string): boolean {
  if (!url) return false;
  return AUTH_GATE_EXEMPT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function waitForAuthHydration(url?: string): Promise<void> {
  if (authHydrated || isAuthGateExempt(url)) return;
  await Promise.race([
    authHydrationPromise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, AUTH_HYDRATION_TIMEOUT_MS);
    }),
  ]);
}

export function setApiAuthToken(token: string | null) {
  // Any call here means the token state is now known — including `null`, which
  // is a real answer ("signed out"), not an absence of one.
  markApiAuthHydrated();
  currentAuthToken = token;
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export function setApiRefreshToken(token: string | null) {
  currentRefreshToken = token;
  // A new refresh token means a new session — the previous rejection no longer
  // applies. Clearing the token (sign-out) also resets the latch so the next
  // sign-in starts clean.
  refreshTokenRejected = false;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

/*
  Installed as an adapter rather than an interceptor because an interceptor
  cannot stop a request from being sent — it can only observe it. The adapter IS
  the send step, so returning a shared promise here means the second request
  never touches the network.

  `defaults.adapter` is NOT a function. Since Axios v1 it holds an adapter NAME
  or a list of them — `["xhr","http","fetch"]` — which Axios resolves at send
  time. Calling it directly throws `TypeError: Object is not a function` on
  EVERY request, which is precisely what it did: the whole app lost its API.
  `axios.getAdapter` turns that list into the real function.

  Resolution is guarded. If Axios ever changes this shape again, the dedupe
  silently switches itself off rather than taking the transport down with it —
  losing an optimization is survivable, losing every request is not.
*/
let resolvedBaseAdapter: ((config: any) => Promise<any>) | null = null;
try {
  const candidate = (axios as any).getAdapter?.(
    apiClient.defaults.adapter ?? axios.defaults.adapter,
  );
  resolvedBaseAdapter = typeof candidate === 'function' ? candidate : null;
} catch {
  resolvedBaseAdapter = null;
}

if (resolvedBaseAdapter) {
  const send = resolvedBaseAdapter;

  apiClient.defaults.adapter = async function dedupingAdapter(config: any) {
    const key = buildDedupeKey(config as InternalAxiosRequestConfig);
    if (!key) return send(config);

    const entry = getDedupeEntries.get(key);
    if (entry?.inFlight) return entry.inFlight;
    if (
      entry?.settledAt != null &&
      entry.response !== undefined &&
      Date.now() - entry.settledAt < GET_DEDUPE_WINDOW_MS
    ) {
      return entry.response;
    }

    const promise = send(config)
      .then((response: any) => {
        getDedupeEntries.set(key, {
          inFlight: null,
          response,
          settledAt: Date.now(),
        });
        return response;
      })
      .catch((error: unknown) => {
        // Never retain a failure — the next caller must be free to retry.
        getDedupeEntries.delete(key);
        throw error;
      });

    getDedupeEntries.set(key, { inFlight: promise });
    return promise;
  };
}

apiClient.interceptors.request.use(async (config) => {
  const retryableConfig = config as RetryableConfig;

  // Hold until the restored token (or its confirmed absence) is known.
  await waitForAuthHydration(retryableConfig.url);

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
  if (!headers.get('x-request-id')) {
    headers.set('x-request-id', createRequestId());
  }
  headers.set(MOBILE_PLATFORM_HEADER, MOBILE_PLATFORM_VALUE);
  retryableConfig.headers = headers;

  if (isWiezDebugEnabled('network')) {
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

    if (isWiezDebugEnabled('network')) {
      console.log(`[api] ? ${res.status} ${res.config.url}`);
    }
    return res;
  },
  async (error: AxiosError) => {
    finishNetworkTrace(error.config, error.response, error);
    if (isWiezDebugEnabled('network')) {
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
