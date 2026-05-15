import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@/src/styles/tokens';

type ThreadRailActionProps = {
  threaded: boolean;
  count: string;
  busy?: boolean;
  onPress: () => void;
};

const THREAD_EMOJI = String.fromCodePoint(0x1f9f5);
const THREAD_SPIN_DURATION_MS = 680;
const THREAD_COUNT_REVEAL_DELAY_MS = 520;

function formatThreadCountLabel(count: string) {
  const value = count.trim();
  if (value.length === 0) return '0 threads';
  if (/\bthreads?\b/i.test(value)) return value;
  return `${value} ${value === '1' ? 'thread' : 'threads'}`;
}

export default function ThreadRailAction({
  threaded,
  count,
  busy = false,
  onPress,
}: ThreadRailActionProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const pressScale = useSharedValue(1);
  const feedbackScale = useSharedValue(1);
  const rotation = useSharedValue(0);

  const previousThreadedRef = useRef(threaded);
  const previousBusyRef = useRef(busy);
  const pendingAddRequestRef = useRef(false);
  const countRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRevealAtRef = useRef(0);

  const countLabel = useMemo(() => formatThreadCountLabel(count), [count]);
  const [displayedCountLabel, setDisplayedCountLabel] = useState(countLabel);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(Boolean(enabled));
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(Boolean(enabled));
    });

    return () => {
      mounted = false;
      if (countRevealTimerRef.current) {
        clearTimeout(countRevealTimerRef.current);
        countRevealTimerRef.current = null;
      }
      subscription?.remove?.();
    };
  }, []);

  const stopAnimations = useCallback(() => {
    cancelAnimation(pressScale);
    cancelAnimation(feedbackScale);
    cancelAnimation(rotation);
  }, [feedbackScale, pressScale, rotation]);

  const revealCountAfterFeedback = useCallback((nextCountLabel: string) => {
    if (countRevealTimerRef.current) {
      clearTimeout(countRevealTimerRef.current);
    }

    const remainingDelay = Math.max(0, countRevealAtRef.current - Date.now());

    countRevealTimerRef.current = setTimeout(() => {
      countRevealTimerRef.current = null;
      setDisplayedCountLabel(nextCountLabel);
    }, remainingDelay);
  }, []);

  const runAddRequestFeedback = useCallback(() => {
    stopAnimations();
    countRevealAtRef.current = Date.now() + (reduceMotion ? 180 : THREAD_COUNT_REVEAL_DELAY_MS);

    rotation.value = 0;
    pressScale.value = 1;
    feedbackScale.value = 1;

    if (reduceMotion) {
      feedbackScale.value = withSequence(
        withTiming(1.28, {
          duration: 100,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(1, {
          duration: 120,
          easing: Easing.out(Easing.quad),
        }),
      );
      return;
    }

    rotation.value = withSequence(
      withTiming(360, {
        duration: THREAD_SPIN_DURATION_MS,
        easing: Easing.bezier(0.16, 0.86, 0.2, 1),
      }),
      withTiming(0, { duration: 0 }),
    );
    feedbackScale.value = withSequence(
      withTiming(1.72, {
        duration: 150,
        easing: Easing.bezier(0.16, 0.95, 0.28, 1.12),
      }),
      withTiming(1.16, {
        duration: 130,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(1.34, {
        duration: 100,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(1, {
        duration: 190,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [feedbackScale, pressScale, reduceMotion, rotation, stopAnimations]);

  useEffect(() => {
    const wasThreaded = previousThreadedRef.current;
    const wasBusy = previousBusyRef.current;

    if (!wasBusy && busy && !threaded) {
      pendingAddRequestRef.current = true;
      runAddRequestFeedback();
    }

    if (wasThreaded && !threaded) {
      pendingAddRequestRef.current = false;
      countRevealAtRef.current = 0;
      if (countRevealTimerRef.current) {
        clearTimeout(countRevealTimerRef.current);
        countRevealTimerRef.current = null;
      }
      setDisplayedCountLabel(countLabel);
    }

    if (!wasThreaded && threaded && pendingAddRequestRef.current) {
      revealCountAfterFeedback(countLabel);
      pendingAddRequestRef.current = false;
    }

    if (wasBusy && !busy && !threaded) {
      pendingAddRequestRef.current = false;
    }

    previousThreadedRef.current = threaded;
    previousBusyRef.current = busy;
  }, [busy, countLabel, revealCountAfterFeedback, runAddRequestFeedback, threaded]);

  useEffect(() => {
    if (!countRevealTimerRef.current) {
      setDisplayedCountLabel(countLabel);
    }
  }, [countLabel]);

  const handlePressIn = useCallback(() => {
    pressScale.value = withTiming(0.92, {
      duration: 70,
      easing: Easing.out(Easing.quad),
    });
  }, [pressScale]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withTiming(1, {
      duration: 90,
      easing: Easing.out(Easing.quad),
    });
  }, [pressScale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value * feedbackScale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <View style={styles.item}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={busy}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          busy && styles.buttonBusy,
          pressed && !busy && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={threaded ? 'Remove thread' : 'Thread this design'}
        accessibilityState={{ selected: threaded, disabled: busy }}
      >
        <Animated.View style={[styles.iconWrap, iconStyle]}>
          <Text style={[styles.threadEmoji, threaded && styles.threadEmojiActive]}>
            {THREAD_EMOJI}
          </Text>
        </Animated.View>
      </Pressable>
      <Text
        style={[styles.count, threaded && styles.countActive]}
        numberOfLines={1}
      >
        {displayedCountLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 88,
    alignItems: 'center',
    gap: 2,
  },
  button: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  buttonBusy: {
    opacity: 0.72,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  iconWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadEmoji: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  threadEmojiActive: {
    textShadowColor: 'rgba(126, 34, 206, 0.55)',
  },
  count: {
    width: 88,
    color: '#fff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    fontFamily: tokens.fontFamily.bold,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  countActive: {
    color: '#F5D0FE',
  },
});
