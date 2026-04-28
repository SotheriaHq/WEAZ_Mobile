import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type ThreadRailActionProps = {
  threaded: boolean;
  count: string;
  busy?: boolean;
  onPress: () => void;
};

export default function ThreadRailAction({
  threaded,
  count,
  busy = false,
  onPress,
}: ThreadRailActionProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const pressScale = useSharedValue(1);
  const iconScale = useSharedValue(1);
  const threadGlyphOpacity = useSharedValue(threaded ? 1 : 0);
  const idleNeedleGlyphOpacity = useSharedValue(threaded ? 0 : 1);

  const stitchProgress = useSharedValue(0);
  const stitchOpacity = useSharedValue(0);
  const trailOpacity = useSharedValue(0);

  const countScale = useSharedValue(1);
  const countTranslateY = useSharedValue(0);
  const countOpacity = useSharedValue(1);

  const previousThreadedRef = useRef(threaded);

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
      subscription?.remove?.();
    };
  }, []);

  const stopAnimations = useCallback(() => {
    cancelAnimation(pressScale);
    cancelAnimation(iconScale);
    cancelAnimation(threadGlyphOpacity);
    cancelAnimation(idleNeedleGlyphOpacity);
    cancelAnimation(stitchProgress);
    cancelAnimation(stitchOpacity);
    cancelAnimation(trailOpacity);
    cancelAnimation(countScale);
    cancelAnimation(countTranslateY);
    cancelAnimation(countOpacity);
  }, [
    countOpacity,
    countScale,
    countTranslateY,
    iconScale,
    idleNeedleGlyphOpacity,
    pressScale,
    stitchOpacity,
    stitchProgress,
    threadGlyphOpacity,
    trailOpacity,
  ]);

  const runAddAnimation = useCallback(() => {
    stopAnimations();

    iconScale.value = reduceMotion ? 0.98 : 0.94;
    threadGlyphOpacity.value = reduceMotion ? 1 : 0.18;
    idleNeedleGlyphOpacity.value = 1;
    stitchProgress.value = 0;
    stitchOpacity.value = 0;
    trailOpacity.value = 0;
    countScale.value = 0.98;
    countTranslateY.value = 6;
    countOpacity.value = 0.72;

    if (reduceMotion) {
      threadGlyphOpacity.value = withTiming(1, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      });
      idleNeedleGlyphOpacity.value = withTiming(0, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      });
      iconScale.value = withSequence(
        withTiming(1.03, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
      );
      countOpacity.value = withTiming(1, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      });
      countTranslateY.value = withTiming(0, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      });
      countScale.value = withTiming(1, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      });
      return;
    }

    threadGlyphOpacity.value = withTiming(1, {
      duration: 90,
      easing: Easing.out(Easing.quad),
    });
    idleNeedleGlyphOpacity.value = withTiming(0, {
      duration: 90,
      easing: Easing.out(Easing.quad),
    });
    iconScale.value = withSequence(
      withTiming(1.16, {
        duration: 170,
        easing: Easing.bezier(0.2, 0.9, 0.2, 1.15),
      }),
      withTiming(1.02, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(1, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      }),
    );
    stitchProgress.value = withDelay(
      110,
      withTiming(1, {
        duration: 220,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      }),
    );
    stitchOpacity.value = withDelay(
      110,
      withSequence(
        withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) }),
        withDelay(90, withTiming(0, { duration: 70, easing: Easing.in(Easing.quad) })),
      ),
    );
    trailOpacity.value = withDelay(
      110,
      withSequence(
        withTiming(0.75, { duration: 80, easing: Easing.out(Easing.quad) }),
        withDelay(80, withTiming(0, { duration: 80, easing: Easing.in(Easing.quad) })),
      ),
    );
    countOpacity.value = withDelay(
      340,
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
    );
    countTranslateY.value = withDelay(
      340,
      withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) }),
    );
    countScale.value = withDelay(
      340,
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
    );
  }, [
    countOpacity,
    countScale,
    countTranslateY,
    iconScale,
    idleNeedleGlyphOpacity,
    reduceMotion,
    stitchOpacity,
    stitchProgress,
    stopAnimations,
    threadGlyphOpacity,
    trailOpacity,
  ]);

  const runRemoveAnimation = useCallback(() => {
    stopAnimations();

    iconScale.value = 1;
    threadGlyphOpacity.value = 1;
    idleNeedleGlyphOpacity.value = 0;
    stitchProgress.value = 0;
    stitchOpacity.value = 0;
    trailOpacity.value = 0;
    countScale.value = 1;
    countTranslateY.value = 0;
    countOpacity.value = 1;

    if (reduceMotion) {
      threadGlyphOpacity.value = withTiming(0, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      });
      idleNeedleGlyphOpacity.value = withTiming(1, {
        duration: 120,
        easing: Easing.out(Easing.quad),
      });
      iconScale.value = withSequence(
        withTiming(0.98, { duration: 80, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
      );
      countOpacity.value = withSequence(
        withTiming(0.86, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
      );
      return;
    }

    threadGlyphOpacity.value = withTiming(0, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
    idleNeedleGlyphOpacity.value = withTiming(1, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
    iconScale.value = withSequence(
      withTiming(0.95, {
        duration: 80,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(1, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      }),
    );
    countTranslateY.value = withSequence(
      withDelay(80, withTiming(4, { duration: 70, easing: Easing.out(Easing.quad) })),
      withTiming(0, { duration: 90, easing: Easing.out(Easing.quad) }),
    );
    countOpacity.value = withSequence(
      withDelay(80, withTiming(0.84, { duration: 70, easing: Easing.out(Easing.quad) })),
      withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
    );
    countScale.value = withSequence(
      withDelay(80, withTiming(0.98, { duration: 70, easing: Easing.out(Easing.quad) })),
      withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
    );
  }, [
    countOpacity,
    countScale,
    countTranslateY,
    iconScale,
    idleNeedleGlyphOpacity,
    reduceMotion,
    stitchOpacity,
    stitchProgress,
    stopAnimations,
    threadGlyphOpacity,
    trailOpacity,
  ]);

  useEffect(() => {
    if (previousThreadedRef.current === threaded) {
      return;
    }

    if (threaded) {
      runAddAnimation();
    } else {
      runRemoveAnimation();
    }

    previousThreadedRef.current = threaded;
  }, [runAddAnimation, runRemoveAnimation, threaded]);

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

  const buttonInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const threadGlyphStyle = useAnimatedStyle(() => ({
    opacity: threadGlyphOpacity.value,
  }));

  const idleNeedleGlyphStyle = useAnimatedStyle(() => ({
    opacity: idleNeedleGlyphOpacity.value,
  }));

  const stitchNeedleStyle = useAnimatedStyle(() => ({
    opacity: stitchOpacity.value,
    transform: [
      { translateX: interpolate(stitchProgress.value, [0, 1], [-12, 12]) },
      { rotateZ: `${interpolate(stitchProgress.value, [0, 1], [-10, 6])}deg` },
    ],
  }));

  const stitchTrailStyle = useAnimatedStyle(() => ({
    opacity: trailOpacity.value,
    transform: [
      { translateX: interpolate(stitchProgress.value, [0, 1], [-6, 3]) },
      { scaleX: interpolate(stitchProgress.value, [0, 1], [0.18, 1]) },
    ],
  }));

  const countStyle = useAnimatedStyle(() => ({
    opacity: countOpacity.value,
    transform: [{ translateY: countTranslateY.value }, { scale: countScale.value }],
  }));

  return (
    <View style={styles.item}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.button,
          threaded && styles.buttonActive,
          busy && styles.buttonBusy,
          pressed && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={threaded ? 'Unthread design' : 'Thread design'}
      >
        <Animated.View
          style={[
            styles.buttonInner,
            buttonInnerStyle,
          ]}
        >
          <Animated.View
            style={[
              styles.emojiWrap,
              iconWrapStyle,
            ]}
          >
            {!reduceMotion ? (
              <View pointerEvents="none" style={styles.overlayLayer}>
                <Animated.View
                  style={[
                    styles.trail,
                    stitchTrailStyle,
                  ]}
                />
                <Animated.View
                  style={[
                    styles.needleWrap,
                    stitchNeedleStyle,
                  ]}
                >
                  <AppText style={styles.sewNeedleEmoji}>🪡</AppText>
                </Animated.View>
              </View>
            ) : null}
            <Animated.Text style={[styles.glyph, styles.threadGlyph, threadGlyphStyle]}>
              🧵
            </Animated.Text>
            <Animated.Text style={[styles.glyph, styles.needleGlyph, idleNeedleGlyphStyle]}>
              🪡
            </Animated.Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
      <Animated.Text
        style={[
          styles.count,
          threaded && styles.countActive,
          countStyle,
        ]}
      >
        {busy ? '…' : count}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: 'center',
    gap: 2,
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  buttonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: 'transparent',
  },
  buttonBusy: {
    opacity: 0.8,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  emojiWrap: {
    width: 24,
    height: 24,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trail: {
    position: 'absolute',
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#0f766e',
  },
  needleWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sewNeedleEmoji: {
    fontSize: 12,
    lineHeight: 14,
  },
  glyph: {
    position: 'absolute',
    textAlign: 'center',
  },
  threadGlyph: {
    fontSize: 22,
    lineHeight: 24,
  },
  needleGlyph: {
    fontSize: 21,
    lineHeight: 24,
  },
  count: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  countActive: {
    color: '#CCFBF1',
  },
});
