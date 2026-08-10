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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
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

const easeOut = Easing.out(Easing.cubic);

function keyboardDuration(event?: KeyboardEvent, fallback = 250) {
  const d = event?.duration ?? 0;
  // Android often reports 0; a short ease still feels native.
  return d > 0 ? d : fallback;
}

/**
 * Keyboard-aware form scroller — pure JS + Reanimated (no native rebuild).
 *
 * Smoothness rules (avoid the “shake”):
 * - One animated bottom spacer (Reanimated), not React state padding jumps
 * - One scroll-to-focused pass after the keyboard settles (no multi-retry spam)
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
  const keyboardHeightRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomSpacer = useSharedValue(extraKeyboardSpace);

  const clearScrollTimer = useCallback(() => {
    if (scrollTimerRef.current != null) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }, []);

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

  /** One deferred scroll — never multi-fire (multi-fire = shake). */
  const scheduleScrollToFocused = useCallback(
    (delayMs: number) => {
      clearScrollTimer();
      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null;
        scrollToFocused();
      }, delayMs);
    },
    [clearScrollTimer, scrollToFocused],
  );

  const onFieldFocus = useCallback(() => {
    // Keyboard already open: one short settle, then a single scroll.
    if (keyboardHeightRef.current > 0) {
      scheduleScrollToFocused(Platform.OS === 'ios' ? 48 : 64);
    }
  }, [scheduleScrollToFocused]);

  useEffect(() => {
    // Keep spacer floor in sync when sticky-footer clearance changes.
    if (keyboardHeightRef.current <= 0) {
      bottomSpacer.value = withTiming(extraKeyboardSpace, {
        duration: 180,
        easing: easeOut,
      });
    }
  }, [bottomSpacer, extraKeyboardSpace]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = Math.max(0, event.endCoordinates?.height ?? 0);
      const prev = keyboardHeightRef.current;
      keyboardHeightRef.current = height;

      const duration = keyboardDuration(event, Platform.OS === 'ios' ? 250 : 220);
      const targetPad = height + bottomOffset + extraKeyboardSpace;

      // Only animate when height actually changes (skip repeat events).
      if (Math.abs(prev - height) > 1 || prev === 0) {
        bottomSpacer.value = withTiming(targetPad, { duration, easing: easeOut });
      }

      // Scroll once near the end of the keyboard curve — not on every frame.
      scheduleScrollToFocused(Math.max(duration - 40, Platform.OS === 'ios' ? 120 : 160));
    };

    const onHide = (event: KeyboardEvent) => {
      clearScrollTimer();
      keyboardHeightRef.current = 0;
      const duration = keyboardDuration(event, Platform.OS === 'ios' ? 220 : 180);
      bottomSpacer.value = withTiming(extraKeyboardSpace, { duration, easing: easeOut });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
      clearScrollTimer();
    };
  }, [
    bottomOffset,
    bottomSpacer,
    clearScrollTimer,
    extraKeyboardSpace,
    scheduleScrollToFocused,
  ]);

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
