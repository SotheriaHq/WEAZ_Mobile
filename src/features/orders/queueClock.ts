import { useCallback, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
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
}

function start() {
  if (!timer && AppState.currentState === 'active') timer = setInterval(tick, 1000);
}

function stop() {
  if (timer) clearInterval(timer);
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

export function useQueueClock() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return useSyncExternalStore(focused ? subscribe : noopSubscribe, snapshot, snapshot);
}

export { formatQueueCountdown as queueCountdown } from './customOrderQueuePresentation';
