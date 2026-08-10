import React from 'react';
import {
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { tokens } from '@/src/styles/tokens';

/**
 * App-standard scroll container for multi-field forms.
 *
 * Uses `react-native-keyboard-controller` (Expo-recommended for multi-input
 * screens) so focusing a field:
 * - animates in sync with the OS keyboard curve
 * - scrolls the caret into view on both iOS and Android
 * - works under edge-to-edge Android (window is not resized by the IME)
 *
 * Prefer this over nesting `KeyboardAvoider` + plain `ScrollView`. That pair
 * only shrinks the container and does not scroll to the focused field, which is
 * why lower inputs stayed under the keyboard.
 *
 * `bottomOffset` — gap between the caret and the top of the keyboard (or above
 * a sticky footer if you pass that footer's height).
 * `extraKeyboardSpace` — extra bottom scroll extent when a sticky footer sits
 * above the keyboard (positive) or when the scroll view does not reach the
 * screen bottom (negative).
 */
export type KeyboardAwareFormScrollProps = Omit<
  KeyboardAwareScrollViewProps,
  'bottomOffset' | 'extraKeyboardSpace'
> & {
  bottomOffset?: number;
  extraKeyboardSpace?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export const KeyboardAwareFormScroll = React.forwardRef<
  KeyboardAwareScrollViewRef,
  KeyboardAwareFormScrollProps
>(function KeyboardAwareFormScroll(
  {
    bottomOffset = tokens.spacing['2xl'],
    extraKeyboardSpace = 0,
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = 'interactive',
    showsVerticalScrollIndicator = false,
    children,
    ...rest
  },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      // Single keyboard owner: do not also use RN's automatic insets.
      automaticallyAdjustKeyboardInsets={false}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

KeyboardAwareFormScroll.displayName = 'KeyboardAwareFormScroll';

export default KeyboardAwareFormScroll;
