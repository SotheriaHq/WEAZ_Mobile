import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';

import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  children: React.ReactNode | (() => React.ReactNode);
  onClose: () => void;
  showCloseButton?: boolean;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  loading?: boolean;
  scrollable?: boolean;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardBehavior?: 'auto' | 'none';
  keyboardActive?: boolean;
  headerMeta?: string;
  onDismiss?: () => void;
};

export function AppBottomSheet({
  visible,
  title,
  subtitle,
  children,
  onClose,
  showCloseButton = false,
  onDone,
  doneLabel = 'Done',
  doneDisabled,
  loading,
  scrollable = true,
  footer,
  style,
  keyboardBehavior = 'auto',
  keyboardActive,
  headerMeta,
  onDismiss,
}: Props) {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(28);
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = useState(
    visible && (keyboardBehavior !== 'none' || !Keyboard.isVisible()),
  );
  const onDismissRef = useRef(onDismiss);
  const keyboardInset = useSharedValue(0);
  const [keyboardEventHeight, setKeyboardEventHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const baseWindowHeightRef = useRef(windowHeight);
  const isDark = scheme === 'dark';
  const sheetPaddingBottom = Math.max(
    tokens.spacing.lg,
    insets.bottom + tokens.spacing.sm,
  );

  useAndroidOverlaySystemBars(visible, scheme, 'bottom-sheet');

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const dismissCompletedRef = useRef(false);
  const finishDismiss = React.useCallback(() => {
    // Idempotent: animation callback + force-unmount timeout can both fire.
    if (dismissCompletedRef.current) return;
    dismissCompletedRef.current = true;
    setMounted(false);
    onDismissRef.current?.();
  }, []);

  /**
   * How far the body has scrolled, so a downward drag that STARTS at the top of
   * the content can close the sheet instead of doing nothing.
   *
   * The drag responder used to live only on `dragArea` — the handle and header
   * strip, roughly 60pt tall. Every sheet with a scrollable body (the bag
   * fittings measurements, custom bag, filters) therefore ignored a swipe-down
   * anywhere on the content, which is the entire surface the user's thumb is
   * actually on. They swiped the fields and the sheet did not move.
   */
  const bodyScrollYRef = React.useRef(0);

  /**
   * How far the sheet has to move to be gone.
   *
   * The close animation used to travel to a fixed `28` — a 28pt nudge that
   * worked only because the opacity fade did the real hiding. That is fine from
   * rest, and wrong from a DRAG: release at 200pt down and the sheet animates
   * from 200 back UP to 28 while fading, so it visibly stalls, reverses, and
   * only then disappears. That reversal is the "hangs mid-collapse" report.
   *
   * Measured from layout so a short sheet does not travel a whole screen.
   * `EXIT_TRAVEL_FALLBACK` covers the first frame before layout lands.
   */
  const sheetHeightRef = React.useRef(EXIT_TRAVEL_FALLBACK);

  React.useEffect(() => {
    if (!mounted) bodyScrollYRef.current = 0;
  }, [mounted]);

  /** Distance that puts the sheet fully below the screen edge. */
  const getExitTranslate = React.useCallback(
    () => Math.max(EXIT_TRAVEL_FALLBACK, sheetHeightRef.current + insets.bottom),
    [insets.bottom],
  );

  const dragHandlers = React.useMemo(
    () => ({
      onPanResponderMove: (_: unknown, gestureState: { dy: number }) => {
        const nextY = Math.max(0, gestureState.dy);
        translateY.value = nextY;
        opacity.value = Math.max(0.62, 1 - nextY / 420);
      },
      onPanResponderRelease: (
        _: unknown,
        gestureState: { dy: number; vy: number },
      ) => {
        if (gestureState.dy > 48 || gestureState.vy > 0.8) {
          Keyboard.dismiss();
          /*
            Carry the throw through, then tell the parent.

            This used to call `onClose()` and return, leaving `translateY`
            frozen wherever the finger let go until the `visible` prop made its
            way back down and the close effect picked it up — a beat of dead
            sheet, and then a jump. Starting the outward motion here means the
            gesture and the animation are one continuous movement, and the
            effect that follows re-issues the same target, so it changes
            nothing.

            Duration scales with what is left to travel and with how fast the
            finger was going, so a flick exits quickly and a slow drag does not
            snap.
          */
          const exitTranslate = getExitTranslate();
          const remaining = Math.max(0, exitTranslate - Math.max(0, gestureState.dy));
          const flickSpeed = Math.max(0.9, Math.min(gestureState.vy, 3));
          const duration = Math.round(
            Math.max(130, Math.min(260, remaining / flickSpeed)),
          );
          translateY.value = withTiming(exitTranslate, {
            duration,
            easing: Easing.out(Easing.cubic),
          });
          opacity.value = withTiming(0, {
            duration: Math.round(duration * 0.85),
            easing: Easing.out(Easing.cubic),
          });
          onClose();
          return;
        }
        translateY.value = withTiming(0, {
          duration: 140,
          easing: Easing.out(Easing.cubic),
        });
        opacity.value = withTiming(1, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        });
      },
      onPanResponderTerminate: () => {
        translateY.value = withTiming(0, {
          duration: 140,
          easing: Easing.out(Easing.cubic),
        });
        opacity.value = withTiming(1, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        });
      },
    }),
    [getExitTranslate, onClose, opacity, translateY],
  );

  /** Handle + header. Always draggable, whatever the body is doing. */
  const dragCloseResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        ...dragHandlers,
      }),
    [dragHandlers],
  );

  /**
   * Whole-sheet drag, claimed in the CAPTURE phase.
   *
   * Bubble-phase would be too late: the body is a ScrollView and a ScrollView
   * claims every vertical drag it is offered, so a swipe-down on the content
   * became a (no-op) scroll-up-past-the-top and the sheet never moved. Capture
   * runs parent-before-child, which lets the sheet take the gesture first —
   * but ONLY when the body is already scrolled to the top and the pull is
   * clearly downward. Anywhere else, the ScrollView keeps it and scrolling
   * behaves exactly as before.
   */
  const sheetDragResponder = React.useMemo(
    () =>
      PanResponder.create({
        /**
         * The threshold has to be tiny, and that is not sloppiness.
         *
         * React Native only re-runs capture negotiation while NO view owns the
         * responder, and a ScrollView claims it on the very first move event.
         * A `dy > 12` threshold therefore never got a second chance — by the
         * time the finger had travelled twelve points the ScrollView was
         * already the responder and the sheet was never asked again. That is
         * why swipe-to-dismiss still did nothing on the bagging measurement
         * sheet after the first fix.
         *
         * Stealing this early is safe precisely because of the scroll check:
         * at offset 0 a downward drag has nothing to scroll to, so the
         * ScrollView would have consumed it and done nothing anyway.
         */
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          bodyScrollYRef.current <= 0 &&
          gestureState.dy > 3 &&
          gestureState.dy > Math.abs(gestureState.dx),
        ...dragHandlers,
      }),
    [dragHandlers],
  );

  useEffect(() => {
    if (!visible) return;

    if (keyboardBehavior !== 'none' || !Keyboard.isVisible()) {
      setMounted(true);
      return;
    }

    Keyboard.dismiss();
    const hiddenSubscription = Keyboard.addListener('keyboardDidHide', () =>
      setMounted(true),
    );
    const fallbackTimer = setTimeout(() => setMounted(true), 320);

    return () => {
      hiddenSubscription.remove();
      clearTimeout(fallbackTimer);
    };
  }, [keyboardBehavior, visible]);

  useEffect(() => {
    if (!visible || keyboardBehavior !== 'auto') {
      setKeyboardVisible(false);
      setKeyboardEventHeight(0);
      return;
    }

    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardEventHeight(event.endCoordinates.height);
      setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardEventHeight(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardBehavior, visible]);

  useEffect(() => {
    if (!keyboardVisible && windowHeight > baseWindowHeightRef.current) {
      baseWindowHeightRef.current = windowHeight;
    }

    const resizedBySystem =
      Platform.OS === 'android' &&
      keyboardVisible &&
      keyboardEventHeight > 0 &&
      baseWindowHeightRef.current - windowHeight > keyboardEventHeight * 0.5;
    const shouldApplyInset =
      visible &&
      keyboardBehavior === 'auto' &&
      keyboardVisible &&
      (keyboardActive ?? true) &&
      !resizedBySystem;

    keyboardInset.value = withTiming(
      shouldApplyInset ? keyboardEventHeight : 0,
      {
        duration: shouldApplyInset ? 180 : 140,
        easing: Easing.out(Easing.cubic),
      },
    );
  }, [
    keyboardActive,
    keyboardBehavior,
    keyboardEventHeight,
    keyboardInset,
    keyboardVisible,
    visible,
    windowHeight,
  ]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      dismissCompletedRef.current = false;
      translateY.value = 28;
      opacity.value = 0;
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      return;
    }

    // Same outward target as the drag path, so a close that starts from a
    // dragged position never animates backwards up the screen.
    translateY.value = withTiming(getExitTranslate(), {
      duration: 200,
      easing: Easing.in(Easing.cubic),
    });
    opacity.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }, (finished) => {
      // Always unmount. Reanimated can report finished=false when a new timing
      // interrupts the close (rapid re-open/close, same-value reselect) and the
      // old path left the Modal mounted forever — "categories selector never
      // closes".
      runOnJS(finishDismiss)();
      if (!finished) {
        // no-op: finishDismiss already handles the unmount
      }
    });
    // Hard fallback if the UI-thread callback never fires.
    const forceUnmount = setTimeout(() => {
      finishDismiss();
    }, 320);
    return () => clearTimeout(forceUnmount);
  }, [finishDismiss, getExitTranslate, mounted, opacity, translateY, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const keyboardWrapStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardBehavior === 'auto' ? keyboardInset.value : 0,
  }));

  // Sheet-level lift (keyboardWrapStyle) owns IME clearance so the sticky
  // Done/footer stays above the keyboard. Body is a plain ScrollView so we
  // do not double-apply keyboard insets.
  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled' as const,
        keyboardDismissMode: 'interactive' as const,
        automaticallyAdjustKeyboardInsets: false,
        /**
         * `flexShrink: 1` keeps the footer on screen.
         *
         * The sheet is capped at `maxHeight: '88%'` and lays its children out in
         * a column: body, then footer. A ScrollView with no flex rule takes its
         * CONTENT height, so once the body outgrew the cap it pushed the footer
         * past the bottom edge and Cancel/Done simply were not there. The
         * non-scrollable branch below has always set this; the scrollable one
         * never did, and only showed the fault once a sheet body got tall
         * enough — which the paired fittings grid did.
         */
        style: { flexShrink: 1 },
        scrollEventThrottle: 16,
        // Feeds `sheetDragResponder`: a swipe-down only becomes a dismiss when
        // there is nothing left to scroll up to.
        onScroll: (event: {
          nativeEvent: { contentOffset: { y: number } };
        }) => {
          bodyScrollYRef.current = event.nativeEvent.contentOffset.y;
        },
        contentContainerStyle: [
          styles.bodyContent,
          keyboardBehavior === 'auto' ? styles.bodyContentKeyboard : null,
        ],
      }
    : { style: [styles.bodyContent, { flexShrink: 1 }] };

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={() => {
            Keyboard.dismiss();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              backdropStyle,
              { backgroundColor: theme.colors.backdrop },
            ]}
          />
        </Pressable>
        {/*
          `box-none` is load-bearing.

          This wrapper is `flex: 1` so it can pad the sheet up over the
          keyboard, which means it covers the whole screen — including the empty
          area above the sheet that the user reads as "outside". With the
          default `pointerEvents="auto"` it was the hit-test winner there and
          the backdrop `Pressable` behind it never received the tap, so tapping
          off the sheet did nothing at all. `box-none` makes the wrapper itself
          transparent to touches while its children stay interactive.
        */}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.keyboardWrap, keyboardWrapStyle]}
        >
          <Animated.View
            {...sheetDragResponder.panHandlers}
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              if (height > 0) sheetHeightRef.current = height;
            }}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.bottomSheetSurface,
                borderColor: theme.colors.border,
                paddingBottom: sheetPaddingBottom,
              },
              sheetStyle,
              style,
            ]}
          >
            <View {...dragCloseResponder.panHandlers} style={styles.dragArea}>
              <View style={[styles.handle, { backgroundColor: theme.colors.bottomSheetHandle }]} />

              {(title || subtitle || headerMeta || onDone) ? (
                <View style={styles.header}>
                <View style={styles.titleWrap}>
                  {title || headerMeta ? (
                    <View style={styles.titleRow}>
                      {title ? <AppText variant="title" style={styles.title}>{title}</AppText> : null}
                      {headerMeta ? (
                        <View
                          style={[
                            styles.headerMeta,
                            {
                              backgroundColor: theme.colors.primarySoft,
                              borderColor: theme.colors.focusRing,
                            },
                          ]}
                        >
                          <AppText variant="captionBold" tone="primary">{headerMeta}</AppText>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {subtitle ? <AppText variant="body" tone="muted">{subtitle}</AppText> : null}
                </View>
                {/*
                  One primary confirm, never a bare "X".

                  The close control was an unstyled glyph and Done was a
                  `secondary` button, so the sheet's only two exits both read as
                  flat text — nothing in the header looked like the thing to
                  press to commit. A sheet that has an `onDone` now shows a
                  solid primary button and no X, because Done IS the close. A
                  sheet with only `showCloseButton` gets a real Done-shaped
                  button rather than a glyph, since dismissing these sheets
                  keeps the selection anyway.

                  ...but NOT when the sheet draws its own `footer`. A footer is
                  always the sheet's real actions (Cancel / Save / Remove), so
                  synthesizing a header confirm on top of it gave five sheets
                  two "Done" buttons that did different things — the header one
                  dismissed, the footer one committed — with nothing to tell
                  them apart. The footer wins: it is the one the author wrote.
                */}
                <View style={styles.headerActions}>
                  {onDone ? (
                    <Button
                      title={doneLabel}
                      size="sm"
                      onPress={onDone}
                      disabled={doneDisabled}
                      loading={loading}
                      style={styles.doneButton}
                    />
                  ) : showCloseButton && !footer ? (
                    <Button
                      title={doneLabel}
                      size="sm"
                      onPress={onClose}
                      style={styles.doneButton}
                    />
                  ) : null}
                </View>
                </View>
              ) : null}
            </View>

            <Body {...bodyProps}>
              {typeof children === 'function' ? children() : children}
            </Body>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Fallback exit distance, used for the frame before the sheet has been laid out.
 * Comfortably past the bottom edge for any sheet we render.
 */
const EXIT_TRAVEL_FALLBACK = 420;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  sheetKeyboardOpen: {
    // Lifted by KeyboardAvoidingView padding; allow it to fill the remaining space above the keyboard
    maxHeight: '100%',
  },
  handle: {
    width: 46,
    height: 4,
    borderRadius: tokens.radius.full,
    alignSelf: 'center',
  },
  dragArea: {
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  titleWrap: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
  headerMeta: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.full,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  doneButton: {
    minWidth: 78,
    height: 44,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  bodyContent: {
    gap: tokens.spacing.md,
  },
  bodyContentKeyboard: {
    paddingBottom: tokens.spacing.lg,
  },
  footer: {
    paddingTop: tokens.spacing.sm,
  },
});

export default AppBottomSheet;
