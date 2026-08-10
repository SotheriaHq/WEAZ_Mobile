import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import {
  KeyboardStickyView,
  type KeyboardStickyViewProps,
} from 'react-native-keyboard-controller';

/**
 * Keeps a footer (primary actions, chat composer) glued to the keyboard as it
 * expands and collapses, with the same native animation curve as the IME.
 *
 * Pair with `KeyboardAwareFormScroll` on form screens that have sticky bottom
 * actions. Pass `extraKeyboardSpace` on the scroll view equal to the footer
 * height so the last field can still scroll clear of the footer+keyboard stack.
 *
 * `offset.opened` can pull the footer slightly off the keyboard top (e.g. when
 * a home-indicator safe area would otherwise leave a gap).
 */
export type KeyboardStickyFooterProps = KeyboardStickyViewProps & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function KeyboardStickyFooter({
  children,
  offset = { closed: 0, opened: 0 },
  style,
  ...rest
}: KeyboardStickyFooterProps) {
  return (
    <KeyboardStickyView offset={offset} style={style} {...rest}>
      {children}
    </KeyboardStickyView>
  );
}

export default KeyboardStickyFooter;
