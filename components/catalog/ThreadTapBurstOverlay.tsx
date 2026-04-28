import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';

type ThreadTapBurstOverlayProps = {
  burstKey: number;
  style?: StyleProp<ViewStyle>;
};

export default function ThreadTapBurstOverlay({ burstKey, style }: ThreadTapBurstOverlayProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const needleProgress = useRef(new Animated.Value(0)).current;
  const needleOpacity = useRef(new Animated.Value(0)).current;
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
    needleProgress.setValue(0);
    needleOpacity.setValue(0);
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
        Animated.timing(needleProgress, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(needleOpacity, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(needleOpacity, {
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
  }, [burstKey, needleOpacity, needleProgress, opacity, reduceMotion, scale, trailOpacity, trailProgress]);

  const needleTranslateX = needleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 14],
  });

  const needleRotate = needleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '8deg'],
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
              styles.needleWrap,
              {
                opacity: needleOpacity,
                transform: [{ translateX: needleTranslateX }, { rotate: needleRotate }],
              },
            ]}
          >
            <AppText style={styles.needleEmoji}>🪡</AppText>
          </Animated.View>
        </>
      ) : null}
      <AppText style={styles.threadEmoji}>🧵</AppText>
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
  needleWrap: {
    position: 'absolute',
    top: -8,
  },
  needleEmoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  threadEmoji: {
    fontSize: 28,
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
