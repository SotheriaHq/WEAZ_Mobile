import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/src/theme/ThemeProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FloatingOrbProps {
  size: number;
  color: string;
  initialX: number;
  initialY: number;
  delay?: number;
  duration?: number;
}

function FloatingOrb({ size, color, initialX, initialY, delay = 0, duration = 8000 }: FloatingOrbProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 800,
      delay,
      useNativeDriver: true,
    }).start();

    // Float animation Y
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -30,
          duration: duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Float animation X (slower, less movement)
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: 15,
          duration: duration * 1.3,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -15,
          duration: duration * 1.3,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulse scale
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.1,
          duration: duration * 0.7,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: duration * 0.7,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          left: initialX,
          top: initialY,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    />
  );
}

interface AnimatedAuthBackgroundProps {
  children: React.ReactNode;
}

export function AnimatedAuthBackground({ children }: AnimatedAuthBackgroundProps) {
  const { scheme, theme } = useTheme();
  const isDark = scheme === 'dark';

  const gradientColors = isDark
    ? ['#0f0a14', '#1a1122', '#0f0a14'] as const
    : ['#f7f6f8', '#ede9f5', '#f7f6f8'] as const;

  const orbColors = {
    primary: isDark ? 'rgba(147, 51, 234, 0.25)' : 'rgba(147, 51, 234, 0.15)',
    secondary: isDark ? 'rgba(212, 175, 55, 0.20)' : 'rgba(212, 175, 55, 0.12)',
    accent: isDark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.10)',
  };

  return (
    <View style={styles.container}>
      {/* Base gradient */}
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Floating orbs */}
      <View style={styles.orbContainer} pointerEvents="none">
        <FloatingOrb
          size={280}
          color={orbColors.primary}
          initialX={-80}
          initialY={-60}
          delay={0}
          duration={8000}
        />
        <FloatingOrb
          size={200}
          color={orbColors.secondary}
          initialX={SCREEN_WIDTH - 100}
          initialY={SCREEN_HEIGHT * 0.15}
          delay={500}
          duration={10000}
        />
        <FloatingOrb
          size={160}
          color={orbColors.accent}
          initialX={SCREEN_WIDTH * 0.3}
          initialY={SCREEN_HEIGHT * 0.5}
          delay={1000}
          duration={9000}
        />
        <FloatingOrb
          size={120}
          color={orbColors.primary}
          initialX={-40}
          initialY={SCREEN_HEIGHT * 0.7}
          delay={1500}
          duration={7000}
        />
      </View>

      {/* Content */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 9999,
  },
});
