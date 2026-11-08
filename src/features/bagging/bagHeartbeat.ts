import { useEffect } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  type AppStateStatus,
} from 'react-native';
import { useIsFocused } from 'expo-router';

/**
 * One heartbeat for every live Bag It control on screen.
 *
 * The pulse is the point of the control: it is what pulls a shopper's eye to
 * the bag on a card full of photographs, so it has to keep beating — three
 * beats at mount and then stillness is not enough. But the obvious way to keep
 * it beating, an endless native-driven loop per card, is exactly what cost a
 * 24MB Java GC every ~1.3s on Android with a grid mounted (device log
 * 2026-10-17): every looping view rebuilt its props map every frame, forever,
 * hidden tabs included.
 *
 * So the beat is a CLOCK, not a loop per card:
 *
 * - one `Animated.Value` drives every subscribed button, so thirty cards beat
 *   in step — it reads as the market breathing, not thirty things twitching;
 * - it beats in short bursts (a double beat, ~0.8s) with a rest in between, so
 *   the UI thread animates under a fifth of the time instead of all of it;
 * - only focused screens subscribe (a card on a hidden tab stays still), and
 *   the clock stops entirely when nothing is subscribed, when the app leaves
 *   the foreground, or when the user has asked the system to reduce motion.
 */

/** Time from one burst to the next. */
export const BAG_HEARTBEAT_PERIOD_MS = 4200;

const pulse = new Animated.Value(0);

/** Button scale. A double beat peaking at 6% — visible across the grid without jostling neighbours. */
export const bagHeartbeatScale = pulse.interpolate({
  inputRange: [0, 1],
  outputRange: [1, 1.06],
});

/** Glow ring opacity, rising with each beat. */
export const bagHeartbeatGlow = pulse.interpolate({
  inputRange: [0, 1],
  outputRange: [0, 0.85],
});

let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let running: Animated.CompositeAnimation | null = null;
let appActive = AppState.currentState === 'active';
let reduceMotion = false;
type Removable = { remove(): void };
let appStateSubscription: Removable | null = null;
let reduceMotionSubscription: Removable | null = null;

const timing = (toValue: number, duration: number, easing = Easing.out(Easing.quad)) =>
  Animated.timing(pulse, {
    toValue,
    duration,
    easing,
    useNativeDriver: true,
    isInteraction: false,
  });

function beat() {
  running?.stop();
  const animation = Animated.sequence([
    timing(1, 140),
    timing(0.3, 120, Easing.inOut(Easing.quad)),
    timing(1, 150),
    timing(0, 400, Easing.inOut(Easing.quad)),
  ]);
  running = animation;
  animation.start(() => {
    // Only clear the slot if it still holds THIS burst; a newer burst may
    // already have replaced it.
    if (running === animation) running = null;
  });
}

function canRun() {
  return subscribers > 0 && appActive && !reduceMotion;
}

function startClock() {
  if (timer || !canRun()) return;
  beat();
  timer = setInterval(beat, BAG_HEARTBEAT_PERIOD_MS);
}

function stopClock() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running?.stop();
  running = null;
  pulse.setValue(0);
}

function handleAppState(next: AppStateStatus) {
  appActive = next === 'active';
  if (canRun()) startClock();
  else stopClock();
}

function handleReduceMotion(enabled: boolean) {
  reduceMotion = enabled;
  if (canRun()) startClock();
  else stopClock();
}

function subscribe() {
  subscribers += 1;
  if (subscribers === 1) {
    appActive = AppState.currentState === 'active';
    appStateSubscription = AppState.addEventListener('change', handleAppState);
    reduceMotionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      handleReduceMotion,
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(handleReduceMotion)
      .catch(() => undefined);
  }
  startClock();

  return () => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers > 0) return;
    stopClock();
    appStateSubscription?.remove();
    appStateSubscription = null;
    reduceMotionSubscription?.remove();
    reduceMotionSubscription = null;
  };
}

/**
 * Join the heartbeat while `live` and the screen is focused.
 *
 * Returns whether the caller should bind to `bagHeartbeatScale` /
 * `bagHeartbeatGlow`; when it is false, render the button still.
 */
export function useBagHeartbeat(live: boolean): boolean {
  const focused = useIsFocused();
  const active = live && focused;

  useEffect(() => (active ? subscribe() : undefined), [active]);

  return active;
}
