import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { BAG_IT_EMOJI } from '@/src/constants/bagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type BagPulseStatus =
  | 'not_bagged'
  | 'previously_bagged'
  | 'currently_bagged'
  | 'bagging'
  | 'disabled';

export type BagPulseContext = 'single' | 'multi' | 'multi_card' | 'rail' | 'detail';

type Props = {
  status: BagPulseStatus;
  context?: BagPulseContext;
  mode?: 'standard' | 'custom';
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const resolveScale = (status: BagPulseStatus, context: BagPulseContext) => {
  if (status === 'disabled') return 1;
  if (status === 'bagging') return context === 'single' ? 1.16 : 1.08;
  if (context === 'multi' || context === 'multi_card') {
    if (status === 'not_bagged') return 1.06;
    if (status === 'previously_bagged') return 1.04;
    return 1.025;
  }
  if (status === 'not_bagged') return 1.18;
  if (status === 'previously_bagged') return 1.1;
  return 1.04;
};

export function BagPulseIcon({
  status,
  context = 'single',
  size = 42,
  style,
}: Props) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  const maxScale = useMemo(() => resolveScale(status, context), [context, status]);
  const icon = BAG_IT_EMOJI;
  const shapeRadius = Math.max(tokens.radius.md, size / 3);

  useEffect(() => {
    if (status === 'disabled') {
      pulse.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: status === 'bagging' ? 360 : context === 'multi' || context === 'multi_card' ? 980 : 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: status === 'bagging' ? 360 : context === 'multi' || context === 'multi_card' ? 1280 : 820,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [context, pulse, status]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, maxScale],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [status === 'disabled' ? 0.08 : 0.18, status === 'disabled' ? 0.02 : 0],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, context === 'multi' || context === 'multi_card' ? 1.24 : 1.46],
  });

  const active = status === 'currently_bagged' || status === 'bagging';
  const previouslyBagged = status === 'previously_bagged';

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <Animated.View
        style={[
          styles.ring,
          {
            borderRadius: shapeRadius,
            backgroundColor: theme.colors.primary,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.iconWrap,
          {
            width: size,
            height: size,
            borderRadius: shapeRadius,
            backgroundColor: active
              ? theme.colors.primary
              : previouslyBagged
                ? theme.colors.primarySoft
                : theme.colors.surfaceOverlay,
            opacity: status === 'disabled' ? 0.52 : 1,
            transform: [{ scale }],
          },
        ]}
      >
        <AppText variant="subtitle" tone={active ? 'inverse' : 'default'}>
          {icon}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
});

export default BagPulseIcon;
