import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';

/**
 * Footer that rides the keyboard.
 *
 * Driven by the platform's own keyboard inset (`useAnimatedKeyboard`), not by
 * JS `Keyboard` events.
 *
 * The event-based version could get STUCK, and did: it moved the footer up on
 * `keyboardDidShow` and only ever brought it back down on `keyboardDidHide`.
 * Under Android edge-to-edge the window no longer resizes for the IME, and that
 * hide event is not dependable — OEM skins, gesture dismissal and the collapse
 * key can all close the keyboard without one arriving. When it went missing the
 * footer stayed translated up by the last keyboard height it saw, which parks
 * a bottom action bar somewhere around the middle of the screen with no way to
 * recover. That is the reported "expanded the keyboard, collapsed it, and the
 * buttons stuck mid-screen" on the design composer.
 *
 * The inset cannot go stale in that way: it is the real keyboard height,
 * published from the platform on the UI thread, so a closed keyboard is
 * always 0 whether or not any JS event fired.
 *
 * It also subsumes, for free, the two things the old implementation had to
 * handle by hand:
 *
 * 1. A footer that MOUNTS under an already-open keyboard starts at the right
 *    place. Events only report future transitions, so that case needed a
 *    `Keyboard.metrics()` seed — the "bottom buttons don't render until I
 *    refresh" report.
 *
 * 2. RESIZES of an open keyboard — emoji panel, suggestion strip, Samsung
 *    toolbar, one-handed/floating keyboards, hardware keyboard, rotation —
 *    which on iOS surface only as `keyboardWillChangeFrame`.
 *
 * The animation curve comes from the keyboard itself, so the footer moves in
 * lockstep with it instead of chasing it with a timing function. That also
 * retires the Android catch-up ease that existed only because `keyboardDidShow`
 * arrives after the keyboard has already finished moving.
 */
export type KeyboardStickyFooterProps = {
  offset?: { closed?: number; opened?: number };
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function KeyboardStickyFooter({
  children,
  offset = { closed: 0, opened: 0 },
  style,
}: KeyboardStickyFooterProps) {
  const closedOffset = offset.closed ?? 0;
  const openedOffset = offset.opened ?? 0;
  const keyboard = useAnimatedKeyboard();

  const animatedStyle = useAnimatedStyle(() => {
    const height = Math.max(0, keyboard.height.value);
    return {
      transform: [
        { translateY: height > 0 ? -(height + openedOffset) : -closedOffset },
      ],
    };
  });

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export default KeyboardStickyFooter;
