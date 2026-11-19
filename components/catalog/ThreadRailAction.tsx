import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

type ThreadRailActionProps = {
  threaded: boolean;
  count: string;
  onPress: () => void;
};

const THREAD_EMOJI = String.fromCodePoint(0x1f9f5);

/** One wind of the spool when a thread is made. */
const WIND_DURATION_MS = 420;

/**
 * "30" over "threads" — one phrase, stacked so it fits.
 *
 * The label arrives pre-formatted ("30", "30 threads", "1.2k threads"), and a
 * single line of it was squeezed into a 56pt column at `numberOfLines={1}`, so
 * anything past a single digit clipped to "30 thre...". Splitting the number
 * from its noun fits the column at any count and never ellipsises, and the two
 * lines still read as the one thing they are.
 */
function splitThreadCountLabel(count: string): { value: string; caption: string } {
  // Callers may pass "30", "30 threads" or "1.2k threads" - take the leading token.
  const leading = count.trim().split(/\s+/)[0] || '0';
  return {
    value: leading,
    caption: leading === '1' ? 'thread' : 'threads',
  };
}

/**
 * The spool answers the tap itself, and the count is live.
 *
 * It used to spin for as long as the request took and lock the button
 * meanwhile, so a slow network left a spool spinning for up to the 15-second
 * request timeout, and the count only moved when the server answered — the
 * "spinning, count never registers" report. The parent now flips `threaded`
 * and the count on the tap (see `handleThreadPress` in RunwayFeedScreen) and
 * sends the final state once the taps stop, so this component has no busy
 * state at all: threading winds the spool one whole turn with a small pop,
 * unthreading pops without the turn. Reduce Motion gets the pop only.
 */
export default function ThreadRailAction({
  threaded,
  count,
  onPress,
}: ThreadRailActionProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const pressScale = useSharedValue(1);
  const feedbackScale = useSharedValue(1);
  // Whole turns, not degrees — so the spool always rests upright.
  const turns = useSharedValue(0);

  const previousThreadedRef = useRef(threaded);

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

  // Feedback on a CHANGE of state (never on mount, and not on a recycled row
  // that merely receives a different item's value without a tap).
  useEffect(() => {
    const wasThreaded = previousThreadedRef.current;
    previousThreadedRef.current = threaded;
    if (wasThreaded === threaded) return;
    popScale();
    if (!threaded || reduceMotion) return;
    cancelAnimation(turns);
    turns.value = withTiming(Math.round(turns.value) + 1, {
      duration: WIND_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [popScale, reduceMotion, threaded, turns]);

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
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={threaded ? 'Remove thread' : 'Thread this design'}
        accessibilityState={{ selected: threaded }}
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
        White text and a shadow, not a plate and not a tint.

        The plate this replaces was a rounded scrim behind the count. It made
        the number legible, but it also drew a small grey tile onto the artwork
        that never belonged there, and it read as a chip on bright stages. The
        threaded state additionally switched the text to brand purple, which is
        the least reliable colour available for this job: it pops on a dark
        jacket and vanishes on a lilac dress, and it changed the count colour
        for a state the emoji above already reports.

        The rail sits over arbitrary photography, so the count now carries its
        own contrast the way rail glyphs do everywhere else — white, with a
        shadow dark and wide enough to hold an edge against a white background.
        One colour in both states, nothing painted onto the image.
      */}
      <View style={styles.countBlock}>
        <AppText variant="bodyBold" tone="inverse" style={styles.count}>
          {countLabel.value}
        </AppText>
        <AppText variant="navLabel" tone="inverse" style={styles.count}>
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
  },
  count: {
    width: 56,
    textAlign: 'center',
    /*
     * Opaque and wide, because this shadow is the only thing between white
     * text and a white photograph. The old value (0.55 alpha, 3pt radius) was
     * tuned to sit on top of the scrim plate that used to be behind it; with
     * the plate gone it has to do the whole job on its own.
     */
    textShadowColor: tokens.scrim(0.92),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  /*
   * `countActive` is gone. It set `color` on an AppText, which is stripped, so
   * the threaded state never actually tinted the count — threaded and
   * unthreaded rendered identically and the only cue left was the emoji's
   * glow. The state now comes through `tone`, which is where colour is allowed
   * to come from.
   */
});
