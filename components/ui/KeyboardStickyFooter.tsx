import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  StyleSheet,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

/**
 * Footer that rides the keyboard.
 *
 * Driven by the platform's own keyboard inset (`useAnimatedKeyboard`), reinforced
 * with native keyboard hide events and Android system-resize detection.
 *
 * Under Android with adjustResize (or edge-to-edge system insets), the window
 * already resizes for the IME. Translating the footer when the window is already
 * resized double-insets the footer into the middle of the screen. Furthermore,
 * on OEM Android skins (Xiaomi, Samsung) Reanimated's keyboard inset can miss
 * dismissal events and get stuck at non-zero height.
 *
 * This implementation guarantees:
 * 1. Android system resize suppresses duplicate translation.
 * 2. Keyboard hide events act as an authoritative failsafe to guarantee translateY
 *    returns to 0 when the keyboard is closed.
 * 3. Smooth UI-thread animations on platforms requiring translation (such as iOS).
 */
export type KeyboardStickyFooterProps = {
  offset?: { closed?: number; opened?: number };
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /**
   * Collapse the footer while the keyboard is open instead of riding it up.
   *
   * A footer with no background that rides the keyboard sits ON TOP of the
   * field being typed into (the design composer's Save draft / Preview covered
   * the title field). For a form whose actions are only needed once typing is
   * done, the footer steps aside while the keyboard is up — no height, no taps
   * — and returns when it closes. Callers that need the action while typing
   * (Save on fittings) keep the default.
   */
  hideWhileKeyboardOpen?: boolean;
};

export function KeyboardStickyFooter({
  children,
  offset = { closed: 0, opened: 0 },
  style,
  hideWhileKeyboardOpen = false,
}: KeyboardStickyFooterProps) {
  const closedOffset = offset.closed ?? 0;
  const openedOffset = offset.opened ?? 0;
  const keyboard = useAnimatedKeyboard();

  const baseWindowHeightRef = useRef(Dimensions.get('window').height);
  const initialMetrics = Keyboard.metrics?.();
  const initialKbHeight = Math.max(0, initialMetrics?.height ?? 0);
  const isKeyboardVisible = useSharedValue(initialKbHeight > 0);
  const isResizedBySystem = useSharedValue(false);
  const [keyboardOpen, setKeyboardOpen] = useState(initialKbHeight > 0);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';

    const onShow = (event: KeyboardEvent) => {
      isKeyboardVisible.value = true;
      setKeyboardOpen(true);
      if (!isIOS) {
        const kbHeight = Math.max(0, event?.endCoordinates?.height ?? 0);
        const currentWinHeight = Dimensions.get('window').height;
        // If Android window shrunk significantly while keyboard is up, the system already resized the view
        if (kbHeight > 0 && baseWindowHeightRef.current - currentWinHeight > kbHeight * 0.5) {
          isResizedBySystem.value = true;
        } else {
          isResizedBySystem.value = false;
        }
      }
    };

    const onHide = () => {
      isKeyboardVisible.value = false;
      setKeyboardOpen(false);
      isResizedBySystem.value = false;
      const currentWinHeight = Dimensions.get('window').height;
      if (currentWinHeight > baseWindowHeightRef.current) {
        baseWindowHeightRef.current = currentWinHeight;
      }
    };

    const showSub = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [isKeyboardVisible, isResizedBySystem]);

  const animatedStyle = useAnimatedStyle(() => {
    // Failsafe 1: If keyboard is hidden, translate MUST be closedOffset (0).
    // Failsafe 2: If Android system already resized the window, the footer is already lifted.
    if (!isKeyboardVisible.value || isResizedBySystem.value) {
      return {
        transform: [{ translateY: -closedOffset }],
      };
    }

    const height = Math.max(0, keyboard.height.value);
    return {
      transform: [
        { translateY: height > 0 ? -(height + openedOffset) : -closedOffset },
      ],
    };
  });

  const collapsed = hideWhileKeyboardOpen && keyboardOpen;

  return (
    <Animated.View
      pointerEvents={collapsed ? 'none' : 'auto'}
      style={[style, collapsed ? styles.collapsed : animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
});

export default KeyboardStickyFooter;
