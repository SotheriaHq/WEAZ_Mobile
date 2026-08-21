import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { tokens } from '@/src/styles/tokens';

type KeyboardFormApi = {
  onFieldFocus: () => void;
};

const KeyboardFormContext = createContext<KeyboardFormApi | null>(null);

/** Report field focus so the form can scroll the caret clear of the keyboard. */
export function useKeyboardFormField() {
  return useContext(KeyboardFormContext);
}

export type KeyboardAwareFormScrollProps = Omit<ScrollViewProps, 'children'> & {
  bottomOffset?: number;
  extraKeyboardSpace?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export type KeyboardAwareFormScrollHandle = {
  scrollToFocused: () => void;
  scrollTo: Animated.ScrollView['scrollTo'];
};

function currentKeyboardHeight(): number {
  const metrics = Keyboard.metrics?.();
  return Math.max(0, metrics?.height ?? 0);
}

/**
 * Keyboard-aware form scroller — pure JS + Reanimated (no native rebuild).
 *
 * Smoothness rules, learned the hard way:
 *
 * - The clearance spacer is resized in ONE step, never animated. `height` is a
 *   layout property: easing it over 250ms asked Yoga to re-lay-out the entire
 *   form — and these forms are big — on every frame of the keyboard
 *   transition. That per-frame layout is the “cracked” feel; it is also
 *   exactly what the React Native animation guidance says not to do (animate
 *   transform and opacity, never layout). Setting it once costs one layout
 *   pass, and the keyboard's own motion is what the eye actually tracks.
 * - The scroll-to-focused runs WITH the keyboard, not after it. It used to be
 *   deferred by a setTimeout tuned to land once the keyboard had settled,
 *   which by construction made two sequential movements out of one gesture:
 *   keyboard up, pause, content jumps. Issuing an animated `scrollTo` in the
 *   same event lets the two glide together.
 * - Both the spacer and the caret position are seeded from
 *   `Keyboard.metrics()` at mount, so a form that opens under an already-raised
 *   keyboard is correct on its first frame instead of waiting for an event that
 *   has already been and gone.
 * - No Keyboard.scheduleLayoutAnimation (fights Reanimated)
 */
export const KeyboardAwareFormScroll = forwardRef<
  KeyboardAwareFormScrollHandle,
  KeyboardAwareFormScrollProps
>(function KeyboardAwareFormScroll(
  {
    bottomOffset = tokens.spacing['2xl'],
    extraKeyboardSpace = 0,
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = 'interactive',
    showsVerticalScrollIndicator = false,
    contentContainerStyle,
    style,
    children,
    onScroll,
    ...rest
  },
  ref,
) {
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollOffsetY = useRef(0);
  // Seeded from the live keyboard so a form mounted under an open keyboard is
  // right on frame one, rather than waiting for a show event that already fired.
  const keyboardHeightRef = useRef(currentKeyboardHeight());
  const bottomSpacer = useSharedValue(
    keyboardHeightRef.current > 0
      ? keyboardHeightRef.current + bottomOffset + extraKeyboardSpace
      : extraKeyboardSpace,
  );

  const scrollToFocused = useCallback(() => {
    const kb = keyboardHeightRef.current;
    if (kb <= 0) return;

    const focused =
      typeof TextInput.State?.currentlyFocusedInput === 'function'
        ? TextInput.State.currentlyFocusedInput()
        : null;

    if (
      !focused ||
      typeof (focused as { measureInWindow?: unknown }).measureInWindow !== 'function'
    ) {
      return;
    }

    const windowHeight = Dimensions.get('window').height;
    const keyboardTop = windowHeight - kb;

    (focused as {
      measureInWindow: (
        cb: (x: number, y: number, width: number, height: number) => void,
      ) => void;
    }).measureInWindow((_x, y, _w, height) => {
      const fieldBottom = y + height;
      const targetBottom = keyboardTop - bottomOffset;
      if (fieldBottom <= targetBottom + 2) return;

      const delta = fieldBottom - targetBottom;
      const nextY = Math.max(0, scrollOffsetY.current + delta);
      scrollRef.current?.scrollTo({ y: nextY, animated: true });
    });
  }, [bottomOffset]);

  const onFieldFocus = useCallback(() => {
    // Keyboard already open: the layout is settled, so scroll straight away.
    // The old 48/64ms settle timer existed only to outlast the animated spacer
    // that no longer animates.
    if (keyboardHeightRef.current > 0) {
      scrollToFocused();
    }
  }, [scrollToFocused]);

  useEffect(() => {
    // Keep the spacer floor in sync when sticky-footer clearance changes.
    if (keyboardHeightRef.current <= 0) {
      bottomSpacer.value = extraKeyboardSpace;
    }
  }, [bottomSpacer, extraKeyboardSpace]);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';

    const applyKeyboardHeight = (height: number) => {
      keyboardHeightRef.current = height;
      // One layout pass, not one per frame. See the component doc block.
      bottomSpacer.value =
        height > 0 ? height + bottomOffset + extraKeyboardSpace : extraKeyboardSpace;
    };

    const onShow = (event: KeyboardEvent) => {
      applyKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0));
      // Same tick as the keyboard, so the caret travels WITH it. On iOS this
      // rides `keyboardWillShow`, which fires before the IME moves at all.
      scrollToFocused();
    };

    const onHide = () => {
      applyKeyboardHeight(0);
    };

    const subs = [
      Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', onShow),
      Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', onHide),
      // iOS reports a resize of an already-open keyboard (emoji panel, hardware
      // keyboard attach, split/floating, rotation) only through this event.
      // Android re-emits `keyboardDidShow` with the new height instead.
      ...(isIOS ? [Keyboard.addListener('keyboardWillChangeFrame', onShow)] : []),
    ];

    return () => {
      subs.forEach((sub) => sub.remove());
    };
  }, [bottomOffset, bottomSpacer, extraKeyboardSpace, scrollToFocused]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToFocused,
      scrollTo: (options) => {
        scrollRef.current?.scrollTo(options);
      },
    }),
    [scrollToFocused],
  );

  const formApi = useMemo<KeyboardFormApi>(
    () => ({ onFieldFocus }),
    [onFieldFocus],
  );

  const spacerStyle = useAnimatedStyle(() => ({
    height: bottomSpacer.value,
    width: '100%',
  }));

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetY.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  return (
    <KeyboardFormContext.Provider value={formApi}>
      <Animated.ScrollView
        ref={scrollRef}
        style={style}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        automaticallyAdjustKeyboardInsets={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        {...rest}
      >
        {children}
        {/* Animated keyboard clearance — smooth height, no layout thrash/shake */}
        <Animated.View style={spacerStyle} pointerEvents="none" />
      </Animated.ScrollView>
    </KeyboardFormContext.Provider>
  );
});

KeyboardAwareFormScroll.displayName = 'KeyboardAwareFormScroll';

export default KeyboardAwareFormScroll;
