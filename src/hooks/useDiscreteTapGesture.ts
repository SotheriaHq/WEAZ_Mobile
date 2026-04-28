import { useCallback, useEffect, useRef } from 'react';
import type { NativeSyntheticEvent, NativeTouchEvent } from 'react-native';

type TapGestureOptions = {
  onTap: () => void;
  onDoubleTap?: () => void;
  maxDistancePx?: number;
  maxDurationMs?: number;
  doubleTapDelayMs?: number;
};

type TouchPoint = {
  x: number;
  y: number;
};

const readTouchPoint = (event: NativeSyntheticEvent<NativeTouchEvent>): TouchPoint => {
  const touch = event.nativeEvent.changedTouches?.[0] ?? event.nativeEvent.touches?.[0];
  return {
    x: touch?.pageX ?? 0,
    y: touch?.pageY ?? 0,
  };
};

export function useDiscreteTapGesture({
  onTap,
  onDoubleTap,
  maxDistancePx = 10,
  maxDurationMs = 240,
  doubleTapDelayMs = 220,
}: TapGestureOptions) {
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    startAt: 0,
    moved: false,
  });
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
    };
  }, []);

  const onTouchStart = useCallback((event: NativeSyntheticEvent<NativeTouchEvent>) => {
    const point = readTouchPoint(event);
    gestureRef.current = {
      startX: point.x,
      startY: point.y,
      startAt: Date.now(),
      moved: false,
    };
  }, []);

  const onTouchMove = useCallback((event: NativeSyntheticEvent<NativeTouchEvent>) => {
    const point = readTouchPoint(event);
    const distanceX = Math.abs(point.x - gestureRef.current.startX);
    const distanceY = Math.abs(point.y - gestureRef.current.startY);
    if (distanceX > maxDistancePx || distanceY > maxDistancePx) {
      gestureRef.current.moved = true;
    }
  }, [maxDistancePx]);

  const onTouchCancel = useCallback(() => {
    gestureRef.current.moved = true;
  }, []);

  const onTouchEnd = useCallback(() => {
    const gesture = gestureRef.current;
    const duration = Date.now() - gesture.startAt;

    if (gesture.moved || duration > maxDurationMs) {
      return;
    }

    if (!onDoubleTap) {
      onTap();
      return;
    }

    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      onDoubleTap();
      return;
    }

    tapTimeoutRef.current = setTimeout(() => {
      tapTimeoutRef.current = null;
      onTap();
    }, doubleTapDelayMs);
  }, [doubleTapDelayMs, maxDurationMs, onDoubleTap, onTap]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchCancel,
    onTouchEnd,
  };
}

export default useDiscreteTapGesture;
