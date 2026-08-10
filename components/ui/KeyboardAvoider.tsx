import React, { useEffect } from 'react';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Keyboard avoidance for non-scroll surfaces (chat composer, modals).
 * Reanimated padding — one smooth ease, no React-state layout jumps.
 */
export type KeyboardAvoiderProps = {
  offset?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

const easeOut = Easing.out(Easing.cubic);

export function KeyboardAvoider({
  offset = 0,
  style,
  children,
}: KeyboardAvoiderProps) {
  const pad = useSharedValue(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = Math.max(0, event.endCoordinates?.height ?? 0);
      const duration = event.duration > 0 ? event.duration : Platform.OS === 'ios' ? 250 : 220;
      pad.value = withTiming(Math.max(0, height - offset), {
        duration,
        easing: easeOut,
      });
    };

    const onHide = (event: KeyboardEvent) => {
      const duration = event?.duration > 0 ? event.duration : Platform.OS === 'ios' ? 220 : 180;
      pad.value = withTiming(0, { duration, easing: easeOut });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [offset, pad]);

  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: pad.value,
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export default KeyboardAvoider;
