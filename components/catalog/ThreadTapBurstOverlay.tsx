import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type ThreadTapBurstOverlayProps = {
  burstKey: number;
  style?: StyleProp<ViewStyle>;
};

export default function ThreadTapBurstOverlay({ burstKey, style }: ThreadTapBurstOverlayProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const stitchProgress = useRef(new Animated.Value(0)).current;
  const stitchOpacity = useRef(new Animated.Value(0)).current;
  const trailProgress = useRef(new Animated.Value(0)).current;
  const trailOpacity = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (!burstKey) {
      return;
    }

    opacity.setValue(0);
    scale.setValue(reduceMotion ? 0.96 : 0.92);
    stitchProgress.setValue(0);
    stitchOpacity.setValue(0);
    trailProgress.setValue(0);
    trailOpacity.setValue(0);

    if (reduceMotion) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 120,
            delay: 110,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(scale, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          delay: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.16,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(stitchProgress, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(stitchOpacity, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(stitchOpacity, {
          toValue: 0,
          duration: 120,
          delay: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(trailProgress, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(trailOpacity, {
          toValue: 0.72,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(trailOpacity, {
          toValue: 0,
          duration: 170,
          delay: 120,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [burstKey, opacity, reduceMotion, scale, stitchOpacity, stitchProgress, trailOpacity, trailProgress]);

  const stitchTranslateX = stitchProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 14],
  });

  const stitchScale = stitchProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 1.08],
  });

  const trailTranslateX = trailProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 4],
  });

  const trailScaleX = trailProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        style,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      {!reduceMotion ? (
        <>
          <Animated.View
            style={[
              styles.trail,
              {
                opacity: trailOpacity,
                transform: [{ translateX: trailTranslateX }, { scaleX: trailScaleX }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.threadHeadWrap,
              {
                opacity: stitchOpacity,
                transform: [{ translateX: stitchTranslateX }, { scale: stitchScale }],
              },
            ]}
          >
            <View style={styles.threadHead} />
          </Animated.View>
          <View style={[styles.fabricPoint, styles.fabricPointStart]} />
          <View style={[styles.fabricPoint, styles.fabricPointEnd]} />
        </>
      ) : null}
      <View style={styles.fabricPatch}>
        <View style={[styles.stitchDash, styles.stitchDashOne]} />
        <View style={[styles.stitchDash, styles.stitchDashTwo]} />
        <View style={[styles.stitchDash, styles.stitchDashThree]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: '44%',
    left: '50%',
    marginLeft: -68,
    width: 136,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  trail: {
    position: 'absolute',
    width: 72,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#0f766e',
  },
  threadHeadWrap: {
    position: 'absolute',
    top: 8,
  },
  threadHead: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#CCFBF1',
  },
  fabricPoint: {
    position: 'absolute',
    top: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CCFBF1',
  },
  fabricPointStart: {
    left: 30,
  },
  fabricPointEnd: {
    right: 30,
  },
  fabricPatch: {
    width: 42,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#0F766E',
    overflow: 'hidden',
    transform: [{ rotate: '-5deg' }],
  },
  stitchDash: {
    position: 'absolute',
    width: 13,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#0F766E',
    transform: [{ rotate: '-18deg' }],
  },
  stitchDashOne: {
    left: 7,
    top: 8,
  },
  stitchDashTwo: {
    left: 15,
    top: 14,
  },
  stitchDashThree: {
    left: 23,
    top: 20,
  },
});
