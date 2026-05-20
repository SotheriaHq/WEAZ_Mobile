import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AppState } from 'react-native';

type TraceHeaders = Record<string, unknown> | { get?: (name: string) => unknown };

type TraceableRequestConfig = InternalAxiosRequestConfig & {
  __threadlyTrace?: {
    id: number;
    requestTimestampMs: number;
    requestTimestamp: string;
    routeLabel: string | null;
    appState: string | null;
    trigger: string;
  };
};

type NetworkTraceEntry = {
  id: number;
  requestTimestamp: string;
  responseTimestamp: string;
  durationMs: number;
  method: string;
  sanitizedUrl: string;
  normalizedUrl: string;
  queryParamNames: string[];
  statusCode: number | null;
  routeLabel: string | null;
  appState: string | null;
  trigger: string;
  duplicateBucket: string;
  responseSizeBytes: number | null;
  requestId: string | null;
  isSignedUrlRequest: boolean;
  isCacheBusted: boolean;
  hasNoStoreHeaders: boolean;
  cacheBustReasons: string[];
  errorName: string | null;
};

type NetworkTraceSummary = {
  enabled: boolean;
  totalRequests: number;
  capturedAt: string;
  routeCounts: Array<{ routeLabel: string; count: number }>;
  appStateCounts: Array<{ appState: string; count: number }>;
  triggerCounts: Array<{ trigger: string; count: number }>;
  statusCounts: Array<{ statusCode: string; count: number }>;
  duplicateBuckets: Array<{ bucket: string; count: number; statuses: string[]; totalBytes: number | null }>;
  signedUrlCalls: {
    total: number;
    buckets: Array<{ bucket: string; count: number; totalBytes: number | null }>;
  };
  cacheBustedOrNoStoreCalls: {
    total: number;
    buckets: Array<{ bucket: string; count: number; reasons: string[] }>;
  };
  topEndpoints: Array<{ bucket: string; count: number; totalBytes: number | null }>;
  largestResponseClasses: Array<{ bucket: string; count: number; totalBytes: number }>;
};

type NetworkTraceControls = {
  enabled: boolean;
  clear: () => void;
  entries: () => NetworkTraceEntry[];
  summary: () => NetworkTraceSummary;
  printSummary: () => NetworkTraceSummary;
  setScreen: (label: string | null) => void;
  markTrigger: (trigger: string | null) => void;
};

const MAX_ENTRIES = 2000;
const CACHE_BUST_QUERY_NAMES = new Set(['_cb', 'cachebust', 'cache_bust', 'timestamp', 'ts', 't']);
const SIGNED_URL_PATH_PATTERNS = [
  /\/uploads\/signed-url(?:\/|$)/i,
  /\/uploads\/public-url(?:\/|$)/i,
  /\/uploads\/public-url-by-key(?:\/|$)/i,
];

const isTraceEnabled =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.NODE_ENV !== 'test' &&
  process.env.EXPO_PUBLIC_THREADLY_NETWORK_TRACE !== '0';

let nextTraceId = 1;
let currentScreenLabel: string | null = null;
let manualTrigger: string | null = null;
let lastAppStateTransition: { state: string | null; at: number } = {
  state: AppState.currentState ?? null,
  at: Date.now(),
};
const entries: NetworkTraceEntry[] = [];

if (isTraceEnabled) {
  AppState.addEventListener('change', (nextState) => {
    lastAppStateTransition = {
      state: nextState,
      at: Date.now(),
    };
  });
}

function sanitizeQueryName(name: string) {
  return name.replace(/[^\w.-]/g, '').slice(0, 80) || 'query';
}

function normalizePathSegment(segment: string) {
  const decoded = decodeURIComponent(segment);
  if (/^\d+$/.test(decoded)) return ':number';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded)) {
    return ':id';
  }
  if (/^[A-Za-z0-9_-]{18,}$/.test(decoded)) return ':id';
  return encodeURIComponent(decoded).replace(/%2F/gi, '/');
}

function normalizePath(pathname: string) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return path
    .split('/')
    .map((segment, index) => (index === 0 ? '' : normalizePathSegment(segment)))
    .join('/')
    .replace(/\/{2,}/g, '/');
}

function appendParams(searchParams: URLSearchParams, params: unknown) {
  if (!params) return;
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => searchParams.append(key, value));
    return;
  }
  if (typeof params !== 'object') return;
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (typeof value === 'undefined' || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
    } else {
      searchParams.append(key, String(value));
    }
  }
}

function getRequestUrlParts(config: TraceableRequestConfig) {
  const rawUrl = typeof config.url === 'string' ? config.url : '';
  const rawBaseUrl = typeof config.baseURL === 'string' && config.baseURL ? config.baseURL : 'http://threadly.local';
  const parsed = new URL(rawUrl || '/', rawBaseUrl);
  appendParams(parsed.searchParams, config.params);

  const normalizedPath = normalizePath(parsed.pathname);
  const queryParamNames = Array.from(new Set(Array.from(parsed.searchParams.keys()).map(sanitizeQueryName))).sort();
  const query = queryParamNames.map((name) => `${name}=<redacted>`).join('&');
  const sanitizedUrl = query ? `${normalizedPath}?${query}` : normalizedPath;

  return {
    normalizedPath,
    queryParamNames,
    sanitizedUrl,
  };
}

function getHeaderValue(headers: TraceHeaders | undefined, name: string): string | null {
  if (!headers) return null;
  const getter = typeof headers.get === 'function' ? headers.get.bind(headers) : null;
  const direct = getter ? getter(name) : undefined;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct)) return direct.join(', ');

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(String).join(', ');
    if (typeof value !== 'undefined' && value !== null) return String(value);
  }
  return null;
}

function detectNoStoreHeaders(headers: TraceHeaders | undefined) {
  const cacheControl = getHeaderValue(headers, 'Cache-Control')?.toLowerCase() ?? '';
  const pragma = getHeaderValue(headers, 'Pragma')?.toLowerCase() ?? '';
  return cacheControl.includes('no-store') || cacheControl.includes('no-cache') || pragma.includes('no-cache');
}

function detectCacheBust(queryParamNames: string[], headers: TraceHeaders | undefined) {
  const reasons: string[] = [];
  for (const name of queryParamNames) {
    const normalized = name.toLowerCase();
    if (CACHE_BUST_QUERY_NAMES.has(normalized)) {
      reasons.push(`query:${name}`);
    }
  }
  if (detectNoStoreHeaders(headers)) {
    reasons.push('headers:no-store-or-no-cache');
  }
  return reasons;
}

function estimateResponseSize(data: unknown, headers: TraceHeaders | undefined) {
  const contentLength = Number(getHeaderValue(headers, 'content-length'));
  if (Number.isFinite(contentLength) && contentLength >= 0) {
    return contentLength;
  }
  if (typeof data === 'undefined' || data === null) return null;
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text).length;
    }
    return text.length;
  } catch {
    return null;
  }
}

function getRouteLabel() {
  if (currentScreenLabel) return currentScreenLabel;
  const location = (globalThis as { location?: { pathname?: string } }).location;
  return typeof location?.pathname === 'string' ? location.pathname : null;
}

function inferTrigger() {
  if (manualTrigger) {
    const trigger = manualTrigger;
    manualTrigger = null;
    return trigger;
  }
  const now = Date.now();
  if (lastAppStateTransition.state === 'active' && now - lastAppStateTransition.at <= 5000) {
    return 'foreground';
  }
  return 'unknown';
}

function pushEntry(entry: NetworkTraceEntry) {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

function groupByBucket(source: NetworkTraceEntry[]) {
  const buckets = new Map<string, NetworkTraceEntry[]>();
  for (const entry of source) {
    const group = buckets.get(entry.duplicateBucket) ?? [];
    group.push(entry);
    buckets.set(entry.duplicateBucket, group);
  }
  return buckets;
}

function totalBytes(source: NetworkTraceEntry[]) {
  const values = source
    .map((entry) => entry.responseSizeBytes)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function countBy(source: NetworkTraceEntry[], key: keyof NetworkTraceEntry, fallback: string) {
  const counts = new Map<string, number>();
  for (const entry of source) {
    const value = entry[key];
    const label =
      typeof value === 'string' && value
        ? value
        : typeof value === 'number'
          ? String(value)
          : fallback;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function startNetworkTrace(config: InternalAxiosRequestConfig) {
  if (!isTraceEnabled) return config;
  const traceableConfig = config as TraceableRequestConfig;
  const now = Date.now();
  traceableConfig.__threadlyTrace = {
    id: nextTraceId++,
    requestTimestampMs: now,
    requestTimestamp: new Date(now).toISOString(),
    routeLabel: getRouteLabel(),
    appState: AppState.currentState ?? null,
    trigger: inferTrigger(),
  };
  return traceableConfig;
}

export function finishNetworkTrace(
  config: InternalAxiosRequestConfig | undefined,
  response?: AxiosResponse,
  error?: unknown,
) {
  if (!isTraceEnabled || !config) return;
  const traceableConfig = config as TraceableRequestConfig;
  const trace = traceableConfig.__threadlyTrace;
  if (!trace) return;

  const responseTimestampMs = Date.now();
  const { normalizedPath, queryParamNames, sanitizedUrl } = getRequestUrlParts(traceableConfig);
  const method = String(traceableConfig.method ?? 'GET').toUpperCase();
  const duplicateBucket = `${method} ${sanitizedUrl}`;
  const requestHeaders = traceableConfig.headers as TraceHeaders | undefined;
  const responseHeaders = response?.headers as TraceHeaders | undefined;
  const cacheBustReasons = detectCacheBust(queryParamNames, requestHeaders);
  const isSignedUrlRequest = SIGNED_URL_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath));
  const statusCode = response?.status ?? null;
  const errorName = error instanceof Error ? error.name : error ? 'RequestError' : null;

  pushEntry({
    id: trace.id,
    requestTimestamp: trace.requestTimestamp,
    responseTimestamp: new Date(responseTimestampMs).toISOString(),
    durationMs: responseTimestampMs - trace.requestTimestampMs,
    method,
    sanitizedUrl,
    normalizedUrl: normalizedPath,
    queryParamNames,
    statusCode,
    routeLabel: trace.routeLabel,
    appState: trace.appState,
    trigger: trace.trigger,
    duplicateBucket,
    responseSizeBytes: estimateResponseSize(response?.data, responseHeaders),
    requestId: getHeaderValue(responseHeaders, 'x-request-id'),
    isSignedUrlRequest,
    isCacheBusted: cacheBustReasons.some((reason) => reason.startsWith('query:')),
    hasNoStoreHeaders: cacheBustReasons.includes('headers:no-store-or-no-cache'),
    cacheBustReasons,
    errorName,
  });
}

export function clearNetworkTrace() {
  entries.splice(0, entries.length);
}

export function getNetworkTraceEntries() {
  return entries.slice();
}

export function setNetworkTraceScreen(label: string | null) {
  currentScreenLabel = label && label.trim().length > 0 ? label.trim() : null;
}

export function markNetworkTraceTrigger(trigger: string | null) {
  manualTrigger = trigger && trigger.trim().length > 0 ? trigger.trim() : null;
}

export function getNetworkTraceSummary(): NetworkTraceSummary {
  const captured = getNetworkTraceEntries();
  const buckets = groupByBucket(captured);
  const bucketRows = Array.from(buckets.entries())
    .map(([bucket, bucketEntries]) => ({
      bucket,
      count: bucketEntries.length,
      totalBytes: totalBytes(bucketEntries),
    }))
    .sort((a, b) => b.count - a.count || (b.totalBytes ?? 0) - (a.totalBytes ?? 0));

  const duplicateBuckets = Array.from(buckets.entries())
    .filter(([, bucketEntries]) => bucketEntries.length > 1)
    .map(([bucket, bucketEntries]) => ({
      bucket,
      count: bucketEntries.length,
      statuses: Array.from(new Set(bucketEntries.map((entry) => String(entry.statusCode ?? 'network-error')))).sort(),
      totalBytes: totalBytes(bucketEntries),
    }))
    .sort((a, b) => b.count - a.count || (b.totalBytes ?? 0) - (a.totalBytes ?? 0));

  const signedEntries = captured.filter((entry) => entry.isSignedUrlRequest);
  const cacheEntries = captured.filter((entry) => entry.isCacheBusted || entry.hasNoStoreHeaders);

  return {
    enabled: isTraceEnabled,
    totalRequests: captured.length,
    capturedAt: new Date().toISOString(),
    routeCounts: countBy(captured, 'routeLabel', 'unknown').map(({ label, count }) => ({ routeLabel: label, count })),
    appStateCounts: countBy(captured, 'appState', 'unknown').map(({ label, count }) => ({ appState: label, count })),
    triggerCounts: countBy(captured, 'trigger', 'unknown').map(({ label, count }) => ({ trigger: label, count })),
    statusCounts: countBy(captured, 'statusCode', 'network-error').map(({ label, count }) => ({ statusCode: label, count })),
    duplicateBuckets,
    signedUrlCalls: {
      total: signedEntries.length,
      buckets: Array.from(groupByBucket(signedEntries).entries())
        .map(([bucket, bucketEntries]) => ({
          bucket,
          count: bucketEntries.length,
          totalBytes: totalBytes(bucketEntries),
        }))
        .sort((a, b) => b.count - a.count || (b.totalBytes ?? 0) - (a.totalBytes ?? 0)),
    },
    cacheBustedOrNoStoreCalls: {
      total: cacheEntries.length,
      buckets: Array.from(groupByBucket(cacheEntries).entries())
        .map(([bucket, bucketEntries]) => ({
          bucket,
          count: bucketEntries.length,
          reasons: Array.from(new Set(bucketEntries.flatMap((entry) => entry.cacheBustReasons))).sort(),
        }))
        .sort((a, b) => b.count - a.count),
    },
    topEndpoints: bucketRows.slice(0, 10),
    largestResponseClasses: bucketRows
      .filter((row): row is { bucket: string; count: number; totalBytes: number } => typeof row.totalBytes === 'number')
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 10),
  };
}

export function printNetworkTraceSummary() {
  const summary = getNetworkTraceSummary();
  console.log('[threadly-network-trace] summary', summary);
  if (typeof console.table === 'function') {
    console.table(summary.duplicateBuckets.slice(0, 10));
    console.table(summary.signedUrlCalls.buckets.slice(0, 10));
    console.table(summary.cacheBustedOrNoStoreCalls.buckets.slice(0, 10));
    console.table(summary.largestResponseClasses);
  }
  return summary;
}

const controls: NetworkTraceControls = {
  enabled: isTraceEnabled,
  clear: clearNetworkTrace,
  entries: getNetworkTraceEntries,
  summary: getNetworkTraceSummary,
  printSummary: printNetworkTraceSummary,
  setScreen: setNetworkTraceScreen,
  markTrigger: markNetworkTraceTrigger,
};

if (isTraceEnabled) {
  (globalThis as typeof globalThis & { __THREADLY_NETWORK_TRACE__?: NetworkTraceControls }).__THREADLY_NETWORK_TRACE__ = controls;
}

export const networkTraceEnabled = isTraceEnabled;
