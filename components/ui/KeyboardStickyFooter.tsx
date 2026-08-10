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
 * Footer rides the keyboard with one Reanimated ease (no multi-step shake).
 */
export type KeyboardStickyFooterProps = {
  offset?: { closed?: number; opened?: number };
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

const easeOut = Easing.out(Easing.cubic);

export function KeyboardStickyFooter({
  children,
  offset = { closed: 0, opened: 0 },
  style,
}: KeyboardStickyFooterProps) {
  const closedOffset = offset.closed ?? 0;
  const openedOffset = offset.opened ?? 0;
  const translateY = useSharedValue(-closedOffset);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = Math.max(0, event.endCoordinates?.height ?? 0);
      const duration = event.duration > 0 ? event.duration : Platform.OS === 'ios' ? 250 : 220;
      translateY.value = withTiming(-(height + openedOffset), {
        duration,
        easing: easeOut,
      });
    };

    const onHide = (event: KeyboardEvent) => {
      const duration = event?.duration > 0 ? event.duration : Platform.OS === 'ios' ? 220 : 180;
      translateY.value = withTiming(-closedOffset, {
        duration,
        easing: easeOut,
      });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [closedOffset, openedOffset, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export default KeyboardStickyFooter;
