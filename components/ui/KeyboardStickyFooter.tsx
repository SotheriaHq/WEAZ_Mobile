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
 * Footer that rides the keyboard.
 *
 * Two things this has to get right, and neither is the animation:
 *
 * 1. It must know the keyboard height it is ALREADY sitting under. The
 *    listeners below only report future transitions, so a footer that mounted
 *    while a keyboard was up — every reroute that keeps focus alive, returning
 *    from a sheet, opening the composer from a screen with a live search field
 *    — sat at translateY 0, which on an edge-to-edge Android window is behind
 *    the IME. The buttons were simply not on screen, and nothing would bring
 *    them back until the user dismissed and re-raised the keyboard themselves.
 *    That is the "the bottom buttons don't render until I refresh" report.
 *    `Keyboard.metrics()` gives the current height at mount, so the first
 *    frame is already correct.
 *
 * 2. It must track height CHANGES, not just show/hide. Swapping to an emoji
 *    keyboard, a suggestion strip appearing, a Samsung toolbar, one-handed or
 *    floating keyboards, and rotation all resize a keyboard that is already
 *    open. iOS reports that as `keyboardWillChangeFrame` and nothing else, so
 *    without a listener for it the footer stayed pinned to the first height it
 *    ever saw. Android re-emits `keyboardDidShow` with the new height instead,
 *    which the show handler already covers.
 */
export type KeyboardStickyFooterProps = {
  offset?: { closed?: number; opened?: number };
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

const easeOut = Easing.out(Easing.cubic);

/**
 * iOS emits `keyboardWillShow` before the IME moves and hands us its real
 * duration, so we can ride the same curve. Android only emits `did*`, after the
 * keyboard has finished — animating a full 220ms from there is a visibly late
 * second movement, which is most of what "the transition feels cracked" is. A
 * short catch-up ease is the closest honest approximation.
 */
const ANDROID_CATCH_UP_MS = 120;

function currentKeyboardHeight(): number {
  const metrics = Keyboard.metrics?.();
  return Math.max(0, metrics?.height ?? 0);
}

export function KeyboardStickyFooter({
  children,
  offset = { closed: 0, opened: 0 },
  style,
}: KeyboardStickyFooterProps) {
  const closedOffset = offset.closed ?? 0;
  const openedOffset = offset.opened ?? 0;

  // Seeded, not zeroed — see (1) above. A lazy initializer so the metrics read
  // happens once during mount rather than on every render.
  const translateY = useSharedValue(
    (() => {
      const height = currentKeyboardHeight();
      return height > 0 ? -(height + openedOffset) : -closedOffset;
    })(),
  );

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';

    const applyHeight = (height: number, duration: number) => {
      const target = height > 0 ? -(height + openedOffset) : -closedOffset;
      if (duration <= 0) {
        translateY.value = target;
        return;
      }
      translateY.value = withTiming(target, { duration, easing: easeOut });
    };

    const onShow = (event: KeyboardEvent) => {
      const height = Math.max(0, event.endCoordinates?.height ?? 0);
      const duration =
        isIOS && event.duration > 0 ? event.duration : isIOS ? 250 : ANDROID_CATCH_UP_MS;
      applyHeight(height, duration);
    };

    const onHide = (event: KeyboardEvent) => {
      const duration =
        isIOS && event?.duration > 0 ? event.duration : isIOS ? 220 : ANDROID_CATCH_UP_MS;
      applyHeight(0, duration);
    };

    // Re-read metrics on mount as well as seeding above: a keyboard raised
    // between the render and the effect would otherwise be missed entirely.
    applyHeight(currentKeyboardHeight(), 0);

    const subs = [
      Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', onShow),
      Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', onHide),
      // iOS-only: resizes of an already-open keyboard — see (2) above.
      ...(isIOS
        ? [Keyboard.addListener('keyboardWillChangeFrame', onShow)]
        : []),
    ];

    return () => {
      subs.forEach((sub) => sub.remove());
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
