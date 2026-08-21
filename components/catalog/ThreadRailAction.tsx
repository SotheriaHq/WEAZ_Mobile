import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

type ThreadRailActionProps = {
  threaded: boolean;
  count: string;
  busy?: boolean;
  onPress: () => void;
};

const THREAD_EMOJI = String.fromCodePoint(0x1f9f5);

/** One full turn while the request is in flight. */
const SPIN_TURN_DURATION_MS = 760;
/** Easing the spool to rest on a whole turn once the server answers. */
const SPIN_SETTLE_DURATION_MS = 320;

/**
 * Two lines, because one line truncated and described the wrong thing.
 *
 * The label arrived pre-formatted as "30 threads" and was squeezed into a 56pt
 * column at `numberOfLines={1}`, so anything past a single digit clipped to
 * "30 thre...". It also named the OBJECT ("threads") rather than the act, which
 * is backwards for this feature: a thread is something people DO to a design,
 * and the number is proof that they did.
 *
 * Number and unit on the first line, verb underneath. "30 people" / "threaded"
 * fits the column at any count, never ellipsises, and reads as a statement
 * about people rather than a tally of objects.
 */
function splitThreadCountLabel(count: string): { value: string; caption: string } {
  // Callers may pass "30", "30 threads" or "1.2k threads" - take the leading token.
  const leading = count.trim().split(/\s+/)[0] || '0';
  return {
    value: `${leading} ${leading === '1' ? 'person' : 'people'}`,
    caption: 'threaded',
  };
}

/**
 * The spool spins while the thread is being made, and the count is live.
 *
 * What this replaces was neither. The "spin" was `rotation: -8deg -> +8deg -> 0`
 * — a sixteen-degree wiggle, which is a shake by any other name; a spool of
 * thread that rocks back and forth is not doing anything a spool does. And the
 * count was deliberately WITHHELD: a `setTimeout` chain
 * (`revealCountAfterFeedback`, `countRevealAtRef`, a 280ms
 * `THREAD_COUNT_REVEAL_DELAY_MS`) held the new number back until the wiggle had
 * finished, so the one piece of real information arrived late on purpose and
 * the tap felt unacknowledged.
 *
 * Now: `busy` drives a continuous full rotation, so the motion means "your
 * thread is being made" and lasts exactly as long as that takes. When the
 * server answers, the spool eases to rest on a whole turn — never mid-angle —
 * with a small scale pop, and the count renders from props with no delay at
 * all. Reduce Motion gets the pop and no rotation.
 */
export default function ThreadRailAction({
  threaded,
  count,
  busy = false,
  onPress,
}: ThreadRailActionProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const pressScale = useSharedValue(1);
  const feedbackScale = useSharedValue(1);
  // Whole turns, not degrees — so "settle on a whole turn" is Math.round.
  const turns = useSharedValue(0);

  const wasBusyRef = useRef(busy);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(Boolean(enabled));
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(Boolean(enabled));
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const popScale = useCallback(() => {
    cancelAnimation(feedbackScale);
    feedbackScale.value = withSequence(
      withTiming(1.22, { duration: 130, easing: Easing.bezier(0.16, 0.95, 0.28, 1.12) }),
      withTiming(1, { duration: 190, easing: Easing.out(Easing.quad) }),
    );
  }, [feedbackScale]);

  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;

    if (busy && !wasBusy) {
      if (reduceMotion) return;
      cancelAnimation(turns);
      // `false` = do not reverse. A spool that unwinds every other turn is the
      // wiggle again, one revolution at a time.
      turns.value = withRepeat(
        withTiming(turns.value + 1, {
          duration: SPIN_TURN_DURATION_MS,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
      return;
    }

    if (!busy && wasBusy) {
      popScale();
      if (reduceMotion) return;
      cancelAnimation(turns);
      // Land on a whole turn so the spool never stops at an angle.
      turns.value = withTiming(Math.round(turns.value) + 1, {
        duration: SPIN_SETTLE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [busy, popScale, reduceMotion, turns]);

  useEffect(
    () => () => {
      cancelAnimation(pressScale);
      cancelAnimation(feedbackScale);
      cancelAnimation(turns);
    },
    [feedbackScale, pressScale, turns],
  );

  const handlePressIn = useCallback(() => {
    pressScale.value = withTiming(0.92, { duration: 70, easing: Easing.out(Easing.quad) });
  }, [pressScale]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [pressScale]);

  const countLabel = splitThreadCountLabel(count);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value * feedbackScale.value },
      { rotate: `${turns.value * 360}deg` },
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
        accessibilityState={{ selected: threaded, disabled: busy, busy }}
      >
        <Animated.View style={[styles.iconWrap, iconStyle]}>
          <AppText
            variant="display"
            tone="inverse"
            style={[styles.threadEmoji, threaded && styles.threadEmojiActive]}
          >
            {THREAD_EMOJI}
          </AppText>
        </Animated.View>
      </Pressable>
      {/*
        Straight from props. There is no local mirror of the count and no timer
        gating it, so it changes the instant the parent's optimistic update or
        the server response lands — which is what "real time" has to mean here.
      */}
      {/*
        A colour alone cannot be "obvious" on arbitrary photography — the same
        purple that pops on a dark jacket disappears on a lilac dress. What
        makes a number readable over any image is a CONSISTENT GROUND, so the
        count sits on its own scrim and the colour finally has something stable
        to be legible against. The number is also a full step larger than the
        verb under it: the figure is the social proof, the word is the label.
      */}
      <View style={[styles.countBlock, { backgroundColor: tokens.scrim(0.42) }]}>
        <AppText
          variant="bodyBold"
          tone={threaded ? 'primary' : 'inverse'}
          style={styles.count}
        >
          {countLabel.value}
        </AppText>
        <AppText
          variant="navLabel"
          tone={threaded ? 'primary' : 'inverse'}
          style={styles.count}
        >
          {countLabel.caption}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Column width, not inset, is what set this rail off the screen edge.
   *
   * A 52pt control centred in an 88pt column left 18pt of empty column on each
   * side, so every glyph floated ~30pt in from the edge no matter what `right`
   * the rail used. Matches `railItem` in RunwayFeedScreen — the two have to
   * agree or the thread action sits out of line with its neighbours.
   */
  item: {
    width: 56,
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
    // No `color` here: AppText strips it, and these two declarations were being
    // silently discarded on every render. The glyph is an emoji, so losing it
    // cost nothing — but the count's did (see below).
    textAlign: 'center',
    textShadowColor: tokens.scrim(0.45),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  threadEmojiActive: {
    textShadowColor: tokens.colors.threadRailGlow,
  },
  countBlock: {
    alignItems: 'center',
    width: 56,
    borderRadius: tokens.radius.md,
    paddingVertical: 2,
    paddingHorizontal: tokens.spacing.xs,
    overflow: 'hidden',
  },
  count: {
    width: 56,
    textAlign: 'center',
    textShadowColor: tokens.scrim(0.55),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /*
   * `countActive` is gone. It set `color` on an AppText, which is stripped, so
   * the threaded state never actually tinted the count — threaded and
   * unthreaded rendered identically and the only cue left was the emoji's
   * glow. The state now comes through `tone`, which is where colour is allowed
   * to come from.
   */
});
