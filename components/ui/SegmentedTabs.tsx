/**
 * A row of labels with one rule that MOVES to the selected one.
 *
 * The app's tab rails drew the rule as a `borderBottomColor` on whichever item
 * was active, so switching tabs extinguished one line and lit another. Nothing
 * travels, so nothing connects the tab you left to the tab you are on — the
 * selection teleports, and at a glance it reads as two separate states rather
 * than one control.
 *
 * A single indicator that slides carries that relationship, and it is also the
 * cheaper thing to draw: the bar is ONE view, animated with `translateX` and
 * `scaleX`, so the whole movement runs on the native driver. Animating `left`
 * and `width` instead would be a layout pass per frame on the JS thread, which
 * is exactly where a tab press already competes with the work the new tab is
 * starting.
 *
 * The indicator is a glass pill laid out at the active segment's width;
 * `scaleX` (about the centre) bridges width changes while it glides.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type SegmentedTabItem<TKey extends string> = {
  key: TKey;
  label: string;
  /** Rendered after the label, dimmer — e.g. how many rows the tab holds. */
  count?: number | null;
};

type Segment = { x: number; width: number };

export function SegmentedTabs<TKey extends string>({
  items,
  value,
  onChange,
  style,
}: {
  /** Few enough to share the width — this rail does not scroll. */
  items: ReadonlyArray<SegmentedTabItem<TKey>>;
  value: TKey;
  onChange: (key: TKey) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [segments, setSegments] = useState<Record<string, Segment>>({});
  const translateX = useRef(new Animated.Value(0)).current;
  const scaleX = useRef(new Animated.Value(0)).current;
  // The first measurement should place the bar, not slide it in from the left.
  const placedRef = useRef(false);

  const handleSegmentLayout = useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      setSegments((current) => {
        const previous = current[key];
        if (previous && previous.x === x && previous.width === width) return current;
        return { ...current, [key]: { x, width } };
      });
    },
    [],
  );

  const active = segments[value];

  /*
    The indicator is a Strong Lens glass pill (system purple, low tint) behind
    the active segment, gliding like the island's indicator. The glass is laid
    out once at the active segment's width; while gliding between segments of a
    different width, scaleX bridges the difference so nothing re-lays-out per
    frame.
  */
  const [pillWidth, setPillWidth] = useState(0);
  const pillWidthRef = useRef(0);
  pillWidthRef.current = pillWidth;
  useEffect(() => {
    if (!active || active.width <= 0) return;
    const base = pillWidthRef.current > 0 ? pillWidthRef.current : active.width;
    // scaleX pivots on the centre, so aim the centre and back off half the base.
    const nextTranslate = active.x + active.width / 2 - base / 2;

    if (!placedRef.current) {
      placedRef.current = true;
      setPillWidth(active.width);
      translateX.setValue(active.x);
      scaleX.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.spring(translateX, {
        toValue: nextTranslate,
        useNativeDriver: true,
        damping: 20,
        stiffness: 220,
        mass: 0.7,
      }),
      Animated.spring(scaleX, {
        toValue: active.width / base,
        useNativeDriver: true,
        damping: 20,
        stiffness: 220,
        mass: 0.7,
      }),
    ]).start(({ finished }) => {
      if (!finished || active.width === base) return;
      // Re-lay the glass at the exact width once the glide lands.
      setPillWidth(active.width);
      translateX.setValue(active.x);
      scaleX.setValue(1);
    });
  }, [active, scaleX, translateX]);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.root, { borderBottomColor: 'transparent' }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            width: pillWidth,
            opacity: active && pillWidth > 0 ? 1 : 0,
            transform: [{ translateX }, { scaleX }],
          },
        ]}
      >
        {pillWidth > 0 ? (
          <LiquidGlassFill glassRole="brandSoft" borderRadius={tokens.radius.full} />
        ) : null}
      </Animated.View>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            onLayout={handleSegmentLayout(item.key)}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.count != null ? `${item.label}, ${item.count}` : item.label}
            style={({ pressed }) => [styles.segment, pressed ? styles.pressed : null]}
          >
            <AppText variant="captionBold" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
              {item.label}
            </AppText>
            {item.count != null ? (
              <AppText variant="small" tone={selected ? 'primary' : 'muted'}>
                {item.count}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderBottomWidth: 2,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
    minHeight: 44,
  },
  indicator: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 0,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
});

export default SegmentedTabs;
