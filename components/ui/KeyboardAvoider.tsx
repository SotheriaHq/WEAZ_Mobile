import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type KeyboardAvoidingViewProps,
  type ViewStyle,
} from 'react-native';

/**
 * Keyboard avoidance that actually works on Android in this app.
 *
 * Every form here used `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.
 * On Android that is a no-op by design: it assumes the OS will shrink the window
 * via `adjustResize`, and `KeyboardAvoidingView` then has nothing to do.
 *
 * That assumption does not hold for this app. WIEZ draws edge-to-edge (see
 * `plugins/with-android-system-bars`), and an edge-to-edge Android window is not
 * resized when the IME appears — the keyboard is composited over the content
 * instead. So the layout never moved and the focused input stayed underneath the
 * keyboard, on every Android form.
 *
 * `padding` is driven by the keyboard events rather than by window resizing, so
 * it behaves the same on both platforms here. Because the window does not
 * shrink, there is no double-compensation to worry about.
 *
 * `offset` maps to `keyboardVerticalOffset` — set it to the height of any fixed
 * header above this view, otherwise the padding is measured from the wrong
 * origin and overshoots.
 */
export type KeyboardAvoiderProps = Omit<
  KeyboardAvoidingViewProps,
  'behavior' | 'keyboardVerticalOffset'
> & {
  offset?: number;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
};

export function KeyboardAvoider({
  offset = 0,
  style,
  children,
  ...rest
}: KeyboardAvoiderProps) {
  return (
    <KeyboardAvoidingView
      // Deliberately the same on both platforms — see the note above.
      behavior="padding"
      keyboardVerticalOffset={offset}
      // No default flex: this is a drop-in for existing `KeyboardAvoidingView`
      // usages, and one of them (the comments sheet composer) relies on sizing to
      // its children. Callers that want to fill pass their own `flex: 1`.
      style={style}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

export default KeyboardAvoider;
