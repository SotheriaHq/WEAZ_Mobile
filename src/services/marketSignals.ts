import { AppState, type AppStateStatus } from 'react-native';

import {
  sendMarketSignalBatch,
  type MarketSignalEvent,
} from '@/src/api/MarketApi';

export const MARKET_SIGNAL_QUEUE_LIMIT = 100;
export const MARKET_SIGNAL_BATCH_LIMIT = 25;
export const MARKET_SIGNAL_FLUSH_INTERVAL_MS = 5000;
export const MARKET_SIGNAL_DUPLICATE_WINDOW_MS = 30_000;

let queue: MarketSignalEvent[] = [];
let recentSignalKeys = new Map<string, number>();
let flushing = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let runtimeSubscribers = 0;
let anonymousSessionId: string | null = null;
let marketSessionId: string | null = null;

function createClientId(prefix: string) {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

export function getMarketSignalAnonymousSessionId() {
  if (!anonymousSessionId) {
    anonymousSessionId = createClientId('anon');
  }
  return anonymousSessionId;
}

function getMarketSessionId() {
  if (!marketSessionId) {
    marketSessionId = createClientId('market_session');
  }
  return marketSessionId;
}

function isNoisySignal(event: MarketSignalEvent) {
  return (
    event.signalType === 'IMPRESSION' ||
    event.signalType === 'VIEW' ||
    event.signalType === 'MARKET_SECTION_VIEW' ||
    event.signalType === 'SUGGESTION_ITEM_VIEW'
  );
}

function trimRecentSignalKeys() {
  if (recentSignalKeys.size <= MARKET_SIGNAL_QUEUE_LIMIT * 2) return;
  const now = Date.now();
  for (const [key, seenAt] of recentSignalKeys.entries()) {
    if (now - seenAt > MARKET_SIGNAL_DUPLICATE_WINDOW_MS) {
      recentSignalKeys.delete(key);
    }
  }
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
  const targetId = String(event.targetId ?? '').trim();
  if (!targetId || !event.targetType || !event.signalType) return;

  const normalized: MarketSignalEvent = {
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
    trimRecentSignalKeys();
  }

  if (queue.length >= MARKET_SIGNAL_QUEUE_LIMIT) {
    queue.shift();
  }
  queue.push(normalized);
}

export async function flushMarketSignals() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, MARKET_SIGNAL_BATCH_LIMIT);

  try {
    await sendMarketSignalBatch({
      batchId: createClientId('market_signal_batch'),
      anonymousSessionId: getMarketSignalAnonymousSessionId(),
      sessionId: getMarketSessionId(),
      events: batch,
    });
  } catch {
    queue = [...batch, ...queue].slice(0, MARKET_SIGNAL_QUEUE_LIMIT);
  } finally {
    flushing = false;
  }
}

function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === 'background' || nextState === 'inactive') {
    void flushMarketSignals();
  }
}

export function startMarketSignalRuntime() {
  runtimeSubscribers += 1;

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
  reset: () => {
    queue = [];
    recentSignalKeys = new Map<string, number>();
    flushing = false;
    anonymousSessionId = null;
    marketSessionId = null;
    runtimeSubscribers = 0;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
  },
};
