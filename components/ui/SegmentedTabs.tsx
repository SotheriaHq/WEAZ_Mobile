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
 * `scaleX` is taken about the view's centre, which is why the bar is laid out
 * at a fixed `INDICATOR_BASIS` and the translation targets the centre of the
 * segment rather than its left edge.
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
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/** The indicator's laid-out width; every real width is a scale of this. */
const INDICATOR_BASIS = 100;

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

  useEffect(() => {
    if (!active || active.width <= 0) return;
    const nextScale = active.width / INDICATOR_BASIS;
    // scaleX pivots on the centre, so aim the centre and back off half a basis.
    const nextTranslate = active.x + active.width / 2 - INDICATOR_BASIS / 2;

    if (!placedRef.current) {
      placedRef.current = true;
      translateX.setValue(nextTranslate);
      scaleX.setValue(nextScale);
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
        toValue: nextScale,
        useNativeDriver: true,
        damping: 20,
        stiffness: 220,
        mass: 0.7,
      }),
    ]).start();
  }, [active, scaleX, translateX]);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.root, { borderBottomColor: theme.colors.border }, style]}
    >
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
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            backgroundColor: theme.colors.primary,
            opacity: active ? 1 : 0,
            transform: [{ translateX }, { scaleX }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    bottom: 0,
    left: 0,
    height: 2,
    width: INDICATOR_BASIS,
    borderRadius: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default SegmentedTabs;
