import React from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { LiquidGlassFill } from '@/components/ui/LiquidGlassFill';
import { QuickPressable } from '@/components/ui/QuickPressable';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type VisibilityOption = 'Public' | 'Private' | 'Drafts' | 'In Review' | 'Changes Requested' | 'Rejected' | 'Needs Attention';

interface VisibilityFilterProps {
  selected: VisibilityOption;
  onChange: (value: VisibilityOption) => void;
  showDrafts?: boolean;
  draftsCount?: number;
  needsAttentionCount?: number;
  inReviewCount?: number;
}

type SegmentFrame = { x: number; y: number; width: number; height: number };

/** Same quick, smooth glide as the island's active droplet (~240ms, no bounce). */
const DROPLET_SPRING = { duration: 240, dampingRatio: 0.85 } as const;

interface SegmentProps {
  label: VisibilityOption;
  isActive: boolean;
  onPress: () => void;
  onLayout: (label: VisibilityOption, frame: SegmentFrame) => void;
  badge?: number;
}

/*
  One chip. It never draws its own selection: a single shared droplet glides
  behind the active chip (see `VisibilityFilter`). The label keeps ONE weight in
  both states, so selecting a chip never changes any chip's width and the row
  never shifts under the finger; the active state is colour plus the droplet.
*/
const VisibilitySegment = React.memo(function VisibilitySegment({
  label,
  isActive,
  onPress,
  onLayout,
  badge,
}: SegmentProps) {
  const { theme } = useTheme();
  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => onLayout(label, event.nativeEvent.layout),
    [label, onLayout],
  );

  return (
    // Acts while the finger is down, scroll-safe (see QuickPressable).
    <QuickPressable
      onPress={onPress}
      onLayout={handleLayout}
      style={({ pressed }) => [styles.segment, pressed && styles.segmentPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <AppText variant="captionBold" tone={isActive ? 'default' : 'muted'} numberOfLines={1}>
        {label}
      </AppText>
      {typeof badge === 'number' && badge > 0 ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: isActive
                ? (theme.colors.actionBrand ?? theme.colors.primary)
                : (theme.colors.surfaceCard ?? theme.colors.surface),
            },
          ]}
        >
          <AppText variant="captionBold" tone={isActive ? 'inverse' : 'primary'} numberOfLines={1}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
    </QuickPressable>
  );
});

export function VisibilityFilter({
  selected,
  onChange,
  showDrafts = false,
  draftsCount = 0,
  needsAttentionCount = 0,
  inReviewCount = 0,
}: VisibilityFilterProps) {
  const reduceMotion = useReducedMotion();

  /*
    The gliding droplet. Chips are direct children of the scroll content, so
    their `onLayout` frames share the droplet's coordinates and it scrolls with
    them. Position and width spring on the UI thread; the glass is laid out once
    at the active chip's width (`baseWidth`) and `scaleX` bridges the difference
    mid-glide, so no glass is re-laid-out per frame.
  */
  const framesRef = React.useRef<Partial<Record<VisibilityOption, SegmentFrame>>>({});
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const visible = useSharedValue(0);
  const baseWidthSV = useSharedValue(0);
  const [baseWidth, setBaseWidth] = React.useState(0);

  const glideTo = React.useCallback(
    (frame: SegmentFrame | undefined) => {
      if (!frame || frame.width <= 0) return;
      y.value = frame.y;
      h.value = frame.height;
      if (visible.value === 0 || reduceMotion) {
        x.value = frame.x;
        w.value = frame.width;
        visible.value = withTiming(1, { duration: 140 });
      } else {
        x.value = withSpring(frame.x, DROPLET_SPRING);
        w.value = withSpring(frame.width, DROPLET_SPRING);
      }
      baseWidthSV.value = frame.width;
      setBaseWidth((current) => (Math.abs(current - frame.width) < 0.5 ? current : frame.width));
    },
    [baseWidthSV, h, reduceMotion, visible, w, x, y],
  );

  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;
  const handleSegmentLayout = React.useCallback(
    (label: VisibilityOption, frame: SegmentFrame) => {
      framesRef.current[label] = frame;
      if (label === selectedRef.current) glideTo(frame);
    },
    [glideTo],
  );

  React.useEffect(() => {
    glideTo(framesRef.current[selected]);
  }, [glideTo, selected]);

  // Glide on the press itself, before the parent re-renders with `selected`.
  const select = React.useCallback(
    (value: VisibilityOption) => {
      glideTo(framesRef.current[value]);
      onChange(value);
    },
    [glideTo, onChange],
  );

  const dropletStyle = useAnimatedStyle(() => {
    const base = baseWidthSV.value > 0 ? baseWidthSV.value : Math.max(w.value, 1);
    return {
      opacity: visible.value,
      top: y.value,
      height: h.value,
      width: base,
      transform: [{ translateX: x.value + (w.value - base) / 2 }, { scaleX: w.value > 0 ? w.value / base : 1 }],
    };
  });

  const segment = (label: VisibilityOption, badge?: number) => (
    <VisibilitySegment
      label={label}
      isActive={selected === label}
      onPress={() => select(label)}
      onLayout={handleSegmentLayout}
      badge={badge}
    />
  );

  return (
    <View style={styles.outer}>
      {/* pillFrame is a static wrapper so the pill background stays fixed while
          chips scroll inside. Moving these styles out of contentContainerStyle
          prevents the Android bug where borderRadius on a ScrollView content
          container renders as a rectangle. nestedScrollEnabled allows this
          horizontal scroll to work correctly inside the horizontal tab pager. */}
      <View style={styles.pillFrame}>
        <LiquidGlassFill glassRole="control" inset={2} borderRadius={tokens.radius.full} />
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {/* One brand-tinted droplet that glides to the active chip (painted
              first, so the labels sit on it). */}
          <Animated.View pointerEvents="none" style={[styles.droplet, dropletStyle]}>
            {baseWidth > 0 ? <LiquidGlassFill glassRole="brandSoft" borderRadius={tokens.radius.full} /> : null}
          </Animated.View>
          {segment('Public')}
          {segment('Private')}
          {showDrafts ? (
            <>
              {segment('Needs Attention', needsAttentionCount)}
              {segment('Drafts', draftsCount)}
              {segment('In Review', inReviewCount)}
              {/* "Changes Requested" was its own chip here. It is now folded
                  into Needs Attention — same demand on the owner, one place to
                  answer it. 'Changes Requested' survives as a deep-link value
                  and normalizes onto Needs Attention. */}
              {segment('Rejected')}
            </>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  pillFrame: {
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xs,
    overflow: 'hidden',
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  droplet: {
    position: 'absolute',
    left: 0,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  segment: {
    minHeight: 32,
    minWidth: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    // Transparent, kept for the chip's box (Rule 35 size); the droplet is the selection.
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: tokens.spacing.sm,
  },
  segmentPressed: {
    opacity: 0.8,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default VisibilityFilter;
