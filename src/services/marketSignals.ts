import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';

import {
  sendMarketSignalBatch,
  type MarketSignalEvent,
} from '@/src/api/MarketApi';

export const MARKET_SIGNAL_QUEUE_LIMIT = 100;
export const MARKET_SIGNAL_BATCH_LIMIT = 25;
export const MARKET_SIGNAL_FLUSH_INTERVAL_MS = 5000;
export const MARKET_SIGNAL_DUPLICATE_WINDOW_MS = 30_000;
export const MARKET_SIGNAL_EVENT_TTL_MS = 24 * 60 * 60 * 1000;
export const MARKET_SIGNAL_MAX_RETRIES = 5;
export const MARKET_SIGNAL_RETRY_BASE_MS = 2_000;
export const MARKET_SIGNAL_RETRY_MAX_MS = 60_000;
export const MARKET_SIGNAL_QUEUE_STORAGE_KEY = 'threadly.market.signalQueue.v1';
export const MARKET_SIGNAL_RECENT_STORAGE_KEY = 'threadly.market.signalRecent.v1';
export const MARKET_SIGNAL_IDENTITY_STORAGE_KEY = 'threadly.market.signalIdentity.v1';
export const MARKET_SIGNAL_LAST_CLEARED_STORAGE_KEY =
  'threadly.market.signalLastClearedAt.v1';

type QueuedMarketSignal = {
  event: MarketSignalEvent & { clientEventId: string };
  queuedAt: number;
  retryCount: number;
  nextAttemptAt: number;
  anonymousSessionId: string;
  sessionId: string;
};

let queue: QueuedMarketSignal[] = [];
let recentSignalKeys = new Map<string, number>();
let flushing = false;
let hydrating: Promise<void> | null = null;
let hydrated = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let runtimeSubscribers = 0;
let anonymousSessionId: string | null = null;
let marketSessionId: string | null = null;
let lastClearedAt = 0;

function createClientId(prefix: string) {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseQueuedSignal(value: unknown): QueuedMarketSignal | null {
  if (!isRecord(value) || !isRecord(value.event)) return null;
  const event = value.event as Record<string, unknown>;
  if (
    typeof event.clientEventId !== 'string' ||
    typeof event.targetType !== 'string' ||
    typeof event.targetId !== 'string' ||
    typeof event.signalType !== 'string' ||
    typeof event.surface !== 'string' ||
    typeof value.anonymousSessionId !== 'string' ||
    typeof value.sessionId !== 'string'
  ) {
    return null;
  }

  return {
    event: event as QueuedMarketSignal['event'],
    queuedAt: typeof value.queuedAt === 'number' ? value.queuedAt : Date.now(),
    retryCount: typeof value.retryCount === 'number' ? value.retryCount : 0,
    nextAttemptAt: typeof value.nextAttemptAt === 'number' ? value.nextAttemptAt : 0,
    anonymousSessionId: value.anonymousSessionId,
    sessionId: value.sessionId,
  };
}

function mergeQueuedSignals(entries: QueuedMarketSignal[]) {
  const byEventId = new Map<string, QueuedMarketSignal>();
  for (const entry of entries) {
    byEventId.set(entry.event.clientEventId, entry);
  }
  return Array.from(byEventId.values()).sort((a, b) => a.queuedAt - b.queuedAt);
}

async function hydrateMarketSignalState() {
  if (hydrated) return;
  if (hydrating) return hydrating;

  hydrating = (async () => {
    try {
      const [rawQueue, rawRecent, rawIdentity, rawLastCleared] = await Promise.all([
        AsyncStorage.getItem(MARKET_SIGNAL_QUEUE_STORAGE_KEY),
        AsyncStorage.getItem(MARKET_SIGNAL_RECENT_STORAGE_KEY),
        AsyncStorage.getItem(MARKET_SIGNAL_IDENTITY_STORAGE_KEY),
        AsyncStorage.getItem(MARKET_SIGNAL_LAST_CLEARED_STORAGE_KEY),
      ]);
      const storedLastCleared = Number(rawLastCleared);
      if (Number.isFinite(storedLastCleared) && storedLastCleared > lastClearedAt) {
        lastClearedAt = storedLastCleared;
      }

      const inMemoryQueue = queue;
      let storedQueue: QueuedMarketSignal[] = [];
      if (rawQueue) {
        try {
          const parsed = JSON.parse(rawQueue);
          storedQueue = Array.isArray(parsed)
            ? parsed
                .map(parseQueuedSignal)
                .filter(
                  (entry): entry is QueuedMarketSignal =>
                    entry != null && entry.queuedAt > lastClearedAt,
                )
            : [];
        } catch {
          storedQueue = [];
        }
      }
      queue = mergeQueuedSignals([...storedQueue, ...inMemoryQueue]);

      if (rawRecent) {
        try {
          const parsed = JSON.parse(rawRecent);
          const storedRecent = new Map<string, number>(
            Array.isArray(parsed)
              ? parsed.filter(
                  (entry): entry is [string, number] =>
                    Array.isArray(entry) &&
                    typeof entry[0] === 'string' &&
                    typeof entry[1] === 'number',
                )
              : [],
          );
          recentSignalKeys = new Map([
            ...storedRecent.entries(),
            ...recentSignalKeys.entries(),
          ]);
        } catch {
          recentSignalKeys = new Map();
        }
      }

      if (rawIdentity) {
        try {
          const parsed = JSON.parse(rawIdentity);
          if (!anonymousSessionId && typeof parsed?.anonymousSessionId === 'string') {
            anonymousSessionId = parsed.anonymousSessionId;
          }
          if (!marketSessionId && typeof parsed?.marketSessionId === 'string') {
            marketSessionId = parsed.marketSessionId;
          }
        } catch {
          // Invalid identity storage is ignored and overwritten by the next persist.
        }
      }
      compactQueue();
      persistMarketSignalState();
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();

  return hydrating;
}

function persistMarketSignalState() {
  void AsyncStorage.multiSet([
    [MARKET_SIGNAL_QUEUE_STORAGE_KEY, JSON.stringify(queue)],
    [
      MARKET_SIGNAL_RECENT_STORAGE_KEY,
      JSON.stringify(Array.from(recentSignalKeys.entries())),
    ],
    [
      MARKET_SIGNAL_IDENTITY_STORAGE_KEY,
      JSON.stringify({ anonymousSessionId, marketSessionId }),
    ],
  ]).catch(() => undefined);
}

function compactQueue() {
  const now = Date.now();
  queue = queue
    .filter(
      (entry) =>
        now - entry.queuedAt <= MARKET_SIGNAL_EVENT_TTL_MS &&
        entry.retryCount <= MARKET_SIGNAL_MAX_RETRIES,
    )
    .slice(-MARKET_SIGNAL_QUEUE_LIMIT);

  for (const [key, seenAt] of recentSignalKeys.entries()) {
    if (now - seenAt > MARKET_SIGNAL_DUPLICATE_WINDOW_MS) {
      recentSignalKeys.delete(key);
    }
  }
}

export function getMarketSignalAnonymousSessionId() {
  void hydrateMarketSignalState();
  if (!anonymousSessionId) {
    anonymousSessionId = createClientId('anon');
    persistMarketSignalState();
  }
  return anonymousSessionId;
}

function getMarketSessionId() {
  void hydrateMarketSignalState();
  if (!marketSessionId) {
    marketSessionId = createClientId('market_session');
    persistMarketSignalState();
  }
  return marketSessionId;
}

function isNoisySignal(event: MarketSignalEvent) {
  return (
    event.signalType === 'IMPRESSION' ||
    event.signalType === 'ITEM_IMPRESSION' ||
    event.signalType === 'ITEM_VIEW' ||
    event.signalType === 'VIEW' ||
    event.signalType === 'SECTION_VIEW' ||
    event.signalType === 'MARKET_SECTION_VIEW' ||
    event.signalType === 'SUGGESTION_ITEM_VIEW'
  );
}

function buildNoisySignalKey(event: MarketSignalEvent) {
  return [
    event.signalType,
    event.targetType,
    event.targetId,
    event.sectionKey ?? '',
    event.position ?? '',
  ].join(':');
}

export function trackMarketSignal(event: MarketSignalEvent) {
  void hydrateMarketSignalState();
  const targetId = String(event.targetId ?? '').trim();
  if (!targetId || !event.targetType || !event.signalType || !event.surface) return;

  const normalized: QueuedMarketSignal['event'] = {
    ...event,
    clientEventId: event.clientEventId ?? createClientId('market_signal_event'),
    targetId,
    screenContext: event.screenContext ?? 'MARKET_HOME',
    sessionId: event.sessionId ?? getMarketSessionId(),
  };

  if (isNoisySignal(normalized)) {
    const key = buildNoisySignalKey(normalized);
    const now = Date.now();
    const lastSeenAt = recentSignalKeys.get(key);
    if (lastSeenAt && now - lastSeenAt < MARKET_SIGNAL_DUPLICATE_WINDOW_MS) {
      return;
    }
    recentSignalKeys.set(key, now);
  }

  queue.push({
    event: normalized,
    queuedAt: Date.now(),
    retryCount: 0,
    nextAttemptAt: 0,
    anonymousSessionId: getMarketSignalAnonymousSessionId(),
    sessionId: normalized.sessionId ?? getMarketSessionId(),
  });
  compactQueue();
  persistMarketSignalState();
}

function getRetryDelay(retryCount: number) {
  return Math.min(
    MARKET_SIGNAL_RETRY_BASE_MS * 2 ** Math.max(0, retryCount - 1),
    MARKET_SIGNAL_RETRY_MAX_MS,
  );
}

export async function flushMarketSignals() {
  await hydrateMarketSignalState();
  if (flushing || queue.length === 0) return;

  compactQueue();
  const now = Date.now();
  const dueCandidates = queue.filter((entry) => entry.nextAttemptAt <= now);
  const firstDue = dueCandidates[0];
  if (!firstDue) {
    persistMarketSignalState();
    return;
  }

  const batch = dueCandidates
    .filter(
      (entry) =>
        entry.anonymousSessionId === firstDue.anonymousSessionId &&
        entry.sessionId === firstDue.sessionId,
    )
    .slice(0, MARKET_SIGNAL_BATCH_LIMIT);
  const batchIds = new Set(batch.map((entry) => entry.event.clientEventId));

  flushing = true;
  queue = queue.filter((entry) => !batchIds.has(entry.event.clientEventId));
  persistMarketSignalState();

  try {
    await sendMarketSignalBatch({
      batchId: createClientId('market_signal_batch'),
      anonymousSessionId: firstDue.anonymousSessionId,
      sessionId: firstDue.sessionId,
      events: batch.map((entry) => entry.event),
    });
  } catch {
    const retryAt = Date.now();
    const retryEntries = batch
      .map((entry) => ({
        ...entry,
        retryCount: entry.retryCount + 1,
        nextAttemptAt: retryAt + getRetryDelay(entry.retryCount + 1),
      }))
      .filter((entry) => entry.retryCount <= MARKET_SIGNAL_MAX_RETRIES);
    queue = [...retryEntries, ...queue].slice(-MARKET_SIGNAL_QUEUE_LIMIT);
    persistMarketSignalState();
  } finally {
    flushing = false;
  }
}

export async function clearMobileMarketSignalQueue() {
  queue = [];
  recentSignalKeys = new Map<string, number>();
  flushing = false;
  hydrated = true;
  hydrating = null;
  anonymousSessionId = null;
  marketSessionId = null;
  lastClearedAt = Date.now();
  await Promise.allSettled([
    AsyncStorage.multiSet([
      [MARKET_SIGNAL_LAST_CLEARED_STORAGE_KEY, String(lastClearedAt)],
    ]),
    AsyncStorage.multiRemove([
      MARKET_SIGNAL_QUEUE_STORAGE_KEY,
      MARKET_SIGNAL_RECENT_STORAGE_KEY,
      MARKET_SIGNAL_IDENTITY_STORAGE_KEY,
    ]),
  ]);
}

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === 'background' || nextState === 'inactive') {
    void flushMarketSignals();
  }
}

export function startMarketSignalRuntime() {
  runtimeSubscribers += 1;
  void hydrateMarketSignalState();

  if (!intervalId) {
    intervalId = setInterval(() => {
      void flushMarketSignals();
    }, MARKET_SIGNAL_FLUSH_INTERVAL_MS);
  }

  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
  }

  return () => {
    runtimeSubscribers = Math.max(0, runtimeSubscribers - 1);
    if (runtimeSubscribers > 0) return;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    appStateSubscription?.remove();
    appStateSubscription = null;
    void flushMarketSignals();
  };
}

export const __marketSignalQueueTestUtils = {
  getQueueLength: () => queue.length,
  getQueueSnapshot: () => queue.map((entry) => ({ ...entry, event: { ...entry.event } })),
  hydrate: hydrateMarketSignalState,
  reset: async () => {
    queue = [];
    recentSignalKeys = new Map<string, number>();
    flushing = false;
    hydrating = null;
    hydrated = false;
    anonymousSessionId = null;
    marketSessionId = null;
    lastClearedAt = 0;
    runtimeSubscribers = 0;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
    await AsyncStorage.multiRemove([
      MARKET_SIGNAL_QUEUE_STORAGE_KEY,
      MARKET_SIGNAL_RECENT_STORAGE_KEY,
      MARKET_SIGNAL_IDENTITY_STORAGE_KEY,
      MARKET_SIGNAL_LAST_CLEARED_STORAGE_KEY,
    ]).catch(() => undefined);
  },
};
