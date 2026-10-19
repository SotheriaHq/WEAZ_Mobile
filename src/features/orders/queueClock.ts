import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { QueuePresenter } from '@/src/api/CustomOrderQueueApi';
import { nextQueueClockDelay } from './customOrderQueuePresentation';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const boundaries = new Map<symbol, number[]>();
let appSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
let now = Date.now();
let anchorServer = now;
let anchorMonotonic = performance.now();
let lastServerTimestamp = -Infinity;

export function syncQueueClock(serverNow: string) {
  const timestamp = Date.parse(serverNow);
  if (!Number.isFinite(timestamp) || timestamp < lastServerTimestamp) return;
  lastServerTimestamp = timestamp;
  anchorServer = timestamp;
  anchorMonotonic = performance.now();
  tick();
}

function tick() {
  now = anchorServer + Math.max(0, performance.now() - anchorMonotonic);
  listeners.forEach((listener) => listener());
  stop(); start();
}

function start() {
  if (!timer && listeners.size && AppState.currentState === 'active') {
    const current = anchorServer + Math.max(0, performance.now() - anchorMonotonic);
    timer = setTimeout(tick, nextQueueClockDelay(current, [...boundaries.values()].flat()));
  }
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    start();
    appSubscription = AppState.addEventListener('change', (state) => {
      stop();
      if (state === 'active') { tick(); start(); }
    });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { stop(); appSubscription?.remove(); appSubscription = undefined; }
  };
}

const noopSubscribe = () => () => undefined;
const snapshot = () => now;

export function useQueueClock(queue?: QueuePresenter | null) {
  const [focused, setFocused] = useState(false);
  const boundaryKey = useRef(Symbol('visible-queue'));
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const active = focused && (queue?.lane === 'PENDING' || queue?.lane === 'UP_NEXT');
  useEffect(() => {
    if (!active || !queue) return;
    const key = boundaryKey.current;
    boundaries.set(key, [queue.queueExpiresAt, queue.retainOpensAt, queue.retainClosesAt].map((value, index) => value ? Date.parse(value) + (index === 2 ? 1 : 0) : NaN));
    tick();
    return () => { boundaries.delete(key); stop(); start(); };
  }, [active, queue]);
  return useSyncExternalStore(active ? subscribe : noopSubscribe, snapshot, snapshot);
}

export { formatQueueCountdown as queueCountdown } from './customOrderQueuePresentation';
