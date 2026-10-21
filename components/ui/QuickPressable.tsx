import React from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
} from 'react-native';

/**
 * A finger that rests this long without drifting is a press, not a scroll.
 *
 * 60ms within 3px is 0.05px/ms — under half the speed of the gentlest scroll
 * start — and shorter than a quick tap, so a normal tap activates before the
 * finger lifts instead of after it.
 */
const EARLY_PRESS_MS = 60;
const EARLY_PRESS_SLOP_PX = 3;

type PressState = {
  x: number;
  y: number;
  fired: boolean;
  drifted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * `Pressable` that acts while the finger is still down.
 *
 * A plain `onPress` fires on RELEASE, so every link and header button waited
 * for the finger to lift before anything happened — the "press, lift, then
 * the screen" report (2026-10-20), on top of the screen's own render. This
 * fires `onPress` once the finger has held still for `EARLY_PRESS_MS`, or on
 * release if that comes first.
 *
 * Scroll-safe: moving past `EARLY_PRESS_SLOP_PX` forfeits the early press,
 * and a ScrollView that takes the gesture ends it without `onPress`, as
 * before. `onPress` runs at most once per touch. Anything with `onLongPress`
 * keeps the platform behaviour, since acting early would pre-empt the hold.
 */
type QuickPressableProps = PressableProps & {
  /**
   * Act on touch-down with no hold at all. Only for controls that cannot be
   * the start of a scroll — fixed chrome such as Runway's header, which sits
   * over the feed, not inside it. The hold exists to tell a press from a
   * scroll; where there is no scroll it is just 60ms of waiting.
   */
  actOnTouchDown?: boolean;
};

export const QuickPressable = React.forwardRef<View, QuickPressableProps>(function QuickPressable(
  { onPress, onPressIn, onPressOut, onTouchMove, onLongPress, actOnTouchDown = false, ...rest },
  ref,
) {
  const onPressRef = React.useRef(onPress);
  onPressRef.current = onPress;
  const stateRef = React.useRef<PressState | null>(null);

  React.useEffect(
    () => () => {
      const state = stateRef.current;
      if (state?.timer) clearTimeout(state.timer);
    },
    [],
  );

  const early = Boolean(onPress) && !onLongPress;

  const handlePressIn = React.useCallback(
    (event: GestureResponderEvent) => {
      onPressIn?.(event);
      if (!early) return;
      const previous = stateRef.current;
      if (previous?.timer) clearTimeout(previous.timer);
      const state: PressState = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
        fired: false,
        drifted: false,
        timer: null,
      };
      if (actOnTouchDown) {
        state.fired = true;
        stateRef.current = state;
        onPressRef.current?.(event);
        return;
      }
      state.timer = setTimeout(() => {
        state.timer = null;
        if (stateRef.current !== state || state.drifted || state.fired) return;
        state.fired = true;
        onPressRef.current?.(event);
      }, EARLY_PRESS_MS);
      stateRef.current = state;
    },
    [actOnTouchDown, early, onPressIn],
  );

  const handleTouchMove = React.useCallback(
    (event: GestureResponderEvent) => {
      onTouchMove?.(event);
      const state = stateRef.current;
      if (!state || state.drifted || state.fired) return;
      const touch = event.nativeEvent.touches?.[0] ?? event.nativeEvent;
      if (
        Math.abs(touch.pageX - state.x) > EARLY_PRESS_SLOP_PX ||
        Math.abs(touch.pageY - state.y) > EARLY_PRESS_SLOP_PX
      ) {
        state.drifted = true;
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
      }
    },
    [onTouchMove],
  );

  const handlePressOut = React.useCallback(
    (event: GestureResponderEvent) => {
      onPressOut?.(event);
      // Release or a scroll taking over: either way the early press is off.
      const state = stateRef.current;
      if (state?.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    },
    [onPressOut],
  );

  const handlePress = React.useCallback((event: GestureResponderEvent) => {
    const state = stateRef.current;
    stateRef.current = null;
    if (state?.fired) return;
    onPressRef.current?.(event);
  }, []);

  if (!early) {
    return (
      <Pressable
        ref={ref}
        {...rest}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onTouchMove={onTouchMove}
        onLongPress={onLongPress}
      />
    );
  }

  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onTouchMove={handleTouchMove}
    />
  );
});
