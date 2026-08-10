import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
} from 'react-native-keyboard-controller';

/**
 * Keyboard avoidance for non-scroll / fixed-layout surfaces (chat composer
 * under a list, sheet composer, single-field overlays).
 *
 * Uses `react-native-keyboard-controller`'s `KeyboardAvoidingView`, which tracks
 * the IME on the UI thread and works under WIEZ's edge-to-edge Android window
 * (where OS `adjustResize` does not shrink the layout and RN's stock
 * KeyboardAvoidingView is a no-op on Android).
 *
 * For multi-field forms, prefer `KeyboardAwareFormScroll` — it also scrolls the
 * focused field into view, which padding alone cannot do.
 *
 * `offset` maps to `keyboardVerticalOffset` — set it to the height of any fixed
 * header above this view so padding is measured from the correct origin.
 */
export type KeyboardAvoiderProps = Omit<
  KeyboardAvoidingViewProps,
  'behavior' | 'keyboardVerticalOffset'
> & {
  offset?: number;
  style?: StyleProp<ViewStyle>;
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
      behavior="padding"
      keyboardVerticalOffset={offset}
      // No default flex: drop-in for existing usages (e.g. comments sheet
      // composer) that size to children. Callers that fill the screen pass
      // `style={{ flex: 1 }}`.
      style={style}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

export default KeyboardAvoider;
