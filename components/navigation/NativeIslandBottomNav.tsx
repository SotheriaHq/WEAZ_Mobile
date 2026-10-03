import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navPerf } from '@/src/utils/navPerf';
import { tokens } from '@/src/styles/tokens';
import {
  getNativeIslandContentClearance,
  getNativeIslandLayout,
  NATIVE_ISLAND_NAV,
  useScreenChrome,
} from '@/src/system/ScreenChrome';

export { getNativeIslandContentClearance, getNativeIslandLayout, NATIVE_ISLAND_NAV };

/**
 * Movement past this is a scroll, not a tap.
 *
 * Ten points is the platform touch slop. A finger that stays inside it is a
 * press; a finger that leaves it is looking for a chip that is off-screen.
 */
const TAP_SLOP_PX = 10;

/**
 * How long a still finger waits before the scrolling dock treats it as a tap.
 *
 * The dock cannot route on touch-down: that is what made a swipe open the chip
 * the finger landed on. Waiting for finger-up makes a deliberate press feel
 * late. If the finger is still inside the slop after this delay, the press is
 * real and the route starts while the finger is still down.
 */
const SCROLL_DOCK_COMMIT_DELAY_MS = 90;

/** Press-in and press both fire for one tap. Ignore the second. */
const COMMIT_DEDUPE_MS = 400;

type ScrollDockGesture = {
  key: string;
  x: number;
  y: number;
  moved: boolean;
  committed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

export type NativeIslandNavItem = {
  key: string;
  label: string;
  emoji: string;
  // When set (e.g. the signed-in user's resolved profile photo for the "Me"
  // item), the island renders this image as a rounded-square glyph instead of
  // the emoji. Falls back to the emoji when null/undefined.
  avatarUri?: string | null;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  navFlow?: string;
  targetRoute?: string | null;
  /** Optional Expo Router params (e.g. Studio WebView `routeKey`). */
  targetParams?: Record<string, string>;
};

type NativeIslandBottomNavProps = {
  items: NativeIslandNavItem[];
  onSelect: (item: NativeIslandNavItem) => void;
  onPressIn?: (item: NativeIslandNavItem) => void;
};

export function NativeIslandTabIcon({
  label,
  emoji,
  avatarUri,
  focused,
  badge,
  compact,
}: {
  label: string;
  emoji: string;
  avatarUri?: string | null;
  focused: boolean;
  badge?: number;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  // The chip must stay structurally IDENTICAL whether focused or not — only
  // colors change. On Android, toggling `borderWidth`, `shadow*` props, or
  // `fontSize` on the chip whose `focused` flips true->false re-clips the view
  // (it has overflow:hidden) and momentarily blanks its glyph — that is the
  // "link disappears when navigating" bug. So: border width is always present
  // (transparent when inactive), no dynamic shadow, and a constant emoji size.
  /*
    The active chip is a PILL: a tint with a ring around it.

    `borderColor` was set to `navActiveSurface` — the same value as the fill —
    so the ring rendered invisible and the active state was a bare tinted blob
    with nothing defining its edge. On the frosted island, over whatever
    photograph happens to be behind it, that blob has no shape: it reads as a
    smudge rather than as the selected tab. The browser build has had the ring
    all along, which is why the same bar looks finished there and unfinished
    here.

    `focusRing` is the one token for "this is the selected thing" and it is the
    same lilac in both themes, so the pill keeps its edge on dark chrome too.
    Colour is the ONLY thing that may change on focus here — see the note above
    about Android re-clipping the glyph.
  */
  const chipStyle = [
    styles.tabChip,
    compact && styles.tabChipCompact,
    {
      backgroundColor: focused ? theme.colors.navActiveSurface : 'transparent',
      borderColor: focused ? theme.colors.focusRing : 'transparent',
    },
  ];

  return (
    <View style={styles.tabIconWrap}>
      <View style={styles.tabGlyphWrap}>
        <View style={chipStyle}>
          <View style={styles.tabGlyphStack}>
            <View style={styles.tabEmojiWrap}>
              {avatarUri ? (
                <StableImage
                  uri={avatarUri}
                  resizeMode="cover"
                  containerStyle={[styles.tabAvatar, { opacity: focused ? 1 : 0.82 }]}
                  imageStyle={styles.tabAvatarFill}
                />
              ) : (
                <AppText variant="title" style={[styles.tabEmoji, { opacity: focused ? 1 : 0.76 }]}>
                  {emoji}
                </AppText>
              )}
            </View>
            <View style={styles.tabLabelWrap}>
              <AppText
                variant="captionBold"
                tone={focused ? 'primary' : 'secondary'}
                numberOfLines={1}
                style={focused ? styles.tabLabelActive : styles.tabLabelInactive}
                maxFontSizeMultiplier={1.2}
              >
                {label}
              </AppText>
            </View>
          </View>
        </View>
        {typeof badge === 'number' && badge > 0 ? (
          <View style={styles.badgeWrap} pointerEvents="none">
            <View style={[styles.badge, { backgroundColor: theme.colors.badgeRed }]}>
              <AppText variant="badgeLabel" tone="inverse">
                {badge > 99 ? '99+' : badge}
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// Frosted-glass chrome. Extracted and memoized so it does NOT re-render when the
// active tab changes on navigation.
//
// PERFORMANCE: the Android `experimentalBlurMethod="dimezisBlurView"` blur is a
// LIVE blur — it re-samples whatever screen content sits behind the island every
// frame. During a tab switch the content behind the island is changing, so the
// GPU is busy re-compositing that blur at the exact moment the destination screen
// is trying to paint. On slow/old Android devices that GPU contention is a major
// cause of the "screen appears late after I tap" lag. iOS blur is GPU-accelerated
// by the OS and cheap, so we keep the real frosted look there. On Android we drop
// the live blur and use a slightly more opaque solid fill that reads as the same
// frosted bar but costs the GPU nothing per frame. The floating island shape,
// shadow and milky tint are unchanged on both platforms.
const USE_LIVE_BLUR = Platform.OS === 'ios';

const IslandGlass = React.memo(function IslandGlass({
  scheme,
  theme,
}: {
  scheme: ReturnType<typeof useTheme>['scheme'];
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  // Android (no live blur): bump the fill opacity so the bar still reads as a
  // solid frosted panel rather than a flat translucent sheet.
  const fillColor = USE_LIVE_BLUR
    ? scheme === 'dark'
      ? tokens.island.blurDark
      : tokens.island.blurLight
    : scheme === 'dark'
      ? tokens.island.solidDark
      : tokens.island.solidLight;

  return (
    <>
      {USE_LIVE_BLUR ? (
        <BlurView
          tint={scheme === 'dark' ? 'dark' : 'light'}
          // Strong intensity so the island reads as bold frosted glass (iOS only).
          intensity={scheme === 'dark' ? 90 : 80}
          style={[StyleSheet.absoluteFill, styles.navBlur]}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.navGlassFill,
          {
            backgroundColor: fillColor,
            borderColor: theme.colors.glassBorder,
            borderRadius: NATIVE_ISLAND_NAV.radius,
          },
        ]}
      />
    </>
  );
});

export function NativeIslandBottomNav({
  items,
  onSelect,
  onPressIn,
}: NativeIslandBottomNavProps) {
  const { scheme, theme } = useTheme();
  const { windowWidth, islandLayout } = useScreenChrome();
  const { bottomOffset, sideOffset, islandWidth } = islandLayout;
  // Studio docks have 9 chips — do not compress them into flex:1 slots.
  // Scroll horizontally with a fixed min width so spacing matches the main
  // 5-item dock instead of "crammed into the bar".
  //
  // The line is at SIX, not five. The shopper island is six with Charts, and
  // at `> 5` it tipped into the scrolling dock, which on a phone pushes "Me"
  // past the edge — the one tab you must never have to swipe to find. The
  // compact fixed layout below already existed for exactly six items (see the
  // `items.length >= 6` branch) and was simply unreachable.
  const scrollableDock = items.length > 6;
  const compact = !scrollableDock && (items.length >= 6 || windowWidth < 380);
  const [pressedItemKey, setPressedItemKey] = React.useState<string | null>(null);
  const [immediateActiveKey, setImmediateActiveKey] = React.useState<string | null>(null);
  const [immediateActiveNavFlow, setImmediateActiveNavFlow] = React.useState<string | null>(null);
  const lastCommitRef = React.useRef<{ key: string; at: number } | null>(null);
  const scrollGestureRef = React.useRef<ScrollDockGesture | null>(null);

  React.useEffect(() => {
    if (!immediateActiveKey || !immediateActiveNavFlow) return;
    navPerf.activeIndicatorVisible(immediateActiveNavFlow);
  }, [immediateActiveKey, immediateActiveNavFlow]);

  React.useEffect(() => {
    if (!immediateActiveKey) return;
    const confirmed = items.some((item) => item.key === immediateActiveKey && item.active);
    const stillExists = items.some((item) => item.key === immediateActiveKey);
    if (confirmed || !stillExists) {
      setImmediateActiveKey(null);
      setImmediateActiveNavFlow(null);
    }
  }, [immediateActiveKey, items]);

  React.useEffect(() => {
    return () => {
      const gesture = scrollGestureRef.current;
      if (gesture?.timer) clearTimeout(gesture.timer);
    };
  }, []);

  const clearPressedItem = React.useCallback(() => {
    setPressedItemKey(null);
  }, []);

  const paintCandidate = React.useCallback((item: NativeIslandNavItem) => {
    const navFlow = item.navFlow ?? item.key;
    const targetRoute = item.targetRoute ?? undefined;
    setPressedItemKey(item.key);
    setImmediateActiveKey(item.key);
    setImmediateActiveNavFlow(navFlow);
    navPerf.tapPressIn(navFlow, { target: targetRoute });
    navPerf.optimisticActiveSet(navFlow, { target: targetRoute });
    navPerf.tap(navFlow);
    navPerf.pressedFeedbackVisible(navFlow);
    navPerf.activeIndicatorIntent(navFlow);
  }, []);

  /**
   * Pill and route in the same turn.
   *
   * Painting the pill and waiting a frame for the route left Me lit while
   * Runway was still the screen. On a busy feed that frame did not come for
   * seconds. The highlight and the jump have to be one commit.
   */
  const commitSelection = React.useCallback(
    (item: NativeIslandNavItem) => {
      const now = Date.now();
      const last = lastCommitRef.current;
      if (last && last.key === item.key && now - last.at < COMMIT_DEDUPE_MS) return;
      lastCommitRef.current = { key: item.key, at: now };
      onPressIn?.(item);
      onSelect(item);
    },
    [onPressIn, onSelect],
  );

  const handleFixedPressIn = React.useCallback(
    (item: NativeIslandNavItem) => {
      paintCandidate(item);
      commitSelection(item);
    },
    [commitSelection, paintCandidate],
  );

  const handleFixedPress = React.useCallback(
    (item: NativeIslandNavItem) => {
      // Accessibility activate does not go through press-in. A finger tap
      // already committed in press-in; the dedupe ignores this second call.
      commitSelection(item);
    },
    [commitSelection],
  );

  const clearScrollTimer = React.useCallback((gesture: ScrollDockGesture | null) => {
    if (!gesture?.timer) return;
    clearTimeout(gesture.timer);
    gesture.timer = null;
  }, []);

  const cancelScrollCandidate = React.useCallback(() => {
    const gesture = scrollGestureRef.current;
    if (!gesture || gesture.committed) return;
    gesture.moved = true;
    clearScrollTimer(gesture);
    const key = gesture.key;
    setPressedItemKey((current) => (current === key ? null : current));
    setImmediateActiveKey((current) => (current === key ? null : current));
    setImmediateActiveNavFlow(null);
  }, [clearScrollTimer]);

  const commitScrollDockTap = React.useCallback(
    (item: NativeIslandNavItem) => {
      const gesture = scrollGestureRef.current;
      if (gesture && (gesture.moved || gesture.committed || gesture.key !== item.key)) return;
      if (gesture) {
        gesture.committed = true;
        clearScrollTimer(gesture);
      }
      scrollGestureRef.current = null;
      paintCandidate(item);
      commitSelection(item);
    },
    [clearScrollTimer, commitSelection, paintCandidate],
  );

  const beginScrollDockPress = React.useCallback(
    (item: NativeIslandNavItem, event: GestureResponderEvent) => {
      const previous = scrollGestureRef.current;
      if (previous && !previous.committed) clearScrollTimer(previous);
      const { pageX, pageY } = event.nativeEvent;
      const timer = setTimeout(() => {
        commitScrollDockTap(item);
      }, SCROLL_DOCK_COMMIT_DELAY_MS);
      scrollGestureRef.current = {
        key: item.key,
        x: pageX,
        y: pageY,
        moved: false,
        committed: false,
        timer,
      };
    },
    [clearScrollTimer, commitScrollDockTap],
  );

  const trackScrollDockMove = React.useCallback(
    (item: NativeIslandNavItem, event: NativeSyntheticEvent<NativeTouchEvent>) => {
      const gesture = scrollGestureRef.current;
      if (!gesture || gesture.moved || gesture.committed || gesture.key !== item.key) return;
      const touch = event.nativeEvent.changedTouches?.[0] ?? event.nativeEvent.touches?.[0];
      if (!touch) return;
      const movedPastSlop =
        Math.abs(touch.pageX - gesture.x) > TAP_SLOP_PX ||
        Math.abs(touch.pageY - gesture.y) > TAP_SLOP_PX;
      if (movedPastSlop) cancelScrollCandidate();
    },
    [cancelScrollCandidate],
  );

  if (items.length === 0) {
    return null;
  }

  // The island is permanently fixed and fully expanded — there is no collapse
  // state. A previous design collapsed the bar to a pill (and reset that pill on
  // every route change), which made the nav links visually disappear when
  // navigating between screens. Keeping it static also removes the JS-thread
  // width/opacity animations that competed with the navigation transition.
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.navWrap,
          {
            left: sideOffset,
            width: islandWidth,
            bottom: bottomOffset,
            height: NATIVE_ISLAND_NAV.height,
            borderRadius: NATIVE_ISLAND_NAV.radius,
            shadowColor: scheme === 'dark' ? tokens.colors.dark : tokens.island.shadowLight,
            shadowOpacity: scheme === 'dark' ? 0.42 : 0.24,
            shadowRadius: 28,
            elevation: 16,
          },
        ]}
      >
        <IslandGlass scheme={scheme} theme={theme} />
        <View style={styles.navItems}>
          {scrollableDock ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              directionalLockEnabled
              onScrollBeginDrag={cancelScrollCandidate}
              contentContainerStyle={styles.scrollDockContent}
              style={styles.scrollDock}
            >
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{
                    selected: Boolean((item.active || immediateActiveKey === item.key || pressedItemKey === item.key) && !item.disabled),
                    disabled: item.disabled,
                  }}
                  accessibilityLabel={item.label}
                  disabled={item.disabled}
                  onPressIn={item.disabled ? undefined : (event) => beginScrollDockPress(item, event)}
                  onTouchMove={item.disabled ? undefined : (event) => trackScrollDockMove(item, event)}
                  onTouchCancel={item.disabled ? undefined : () => cancelScrollCandidate()}
                  onPressOut={clearPressedItem}
                  onPress={item.disabled ? undefined : () => commitScrollDockTap(item)}
                  /**
                   * No `android_ripple`. A bounded ripple fills the PRESSABLE,
                   * and the pressable is a full-height flex column — so it
                   * painted a rectangle across a pill-shaped chip, the square
                   * that appeared under the finger on every tap. `borderless`
                   * would not fix it either: that spills a circle past the
                   * dock's rounded edge.
                   *
                   * Press feedback is the chip itself. Touch-down only lights
                   * it. The route waits until the finger stays inside the slop,
                   * so a swipe along this row does not open the chip it started
                   * on. `focused` is that light, and it is the same pill the
                   * destination settles into.
                   */
                  style={({ pressed }) => [
                    styles.navItemScroll,
                    item.disabled && styles.navItemDisabled,
                    pressed && styles.navItemPressed,
                  ]}
                >
                  {({ pressed }) => (
                    <NativeIslandTabIcon
                      label={item.label}
                      emoji={item.emoji}
                      avatarUri={item.avatarUri}
                      focused={Boolean((item.active || immediateActiveKey === item.key) && !item.disabled)}
                      badge={item.badge}
                      compact={false}
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.navModeLayer, styles.expandedItemsLayer]}>
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{
                    selected: Boolean((item.active || immediateActiveKey === item.key || pressedItemKey === item.key) && !item.disabled),
                    disabled: item.disabled,
                  }}
                  accessibilityLabel={item.label}
                  disabled={item.disabled}
                  onPressIn={item.disabled ? undefined : () => handleFixedPressIn(item)}
                  onPressOut={clearPressedItem}
                  onPress={item.disabled ? undefined : () => handleFixedPress(item)}
                  // No `android_ripple` — see the scrolling dock above: a
                  // bounded ripple paints a rectangle across a pill chip.
                  style={({ pressed }) => [styles.navItem, item.disabled && styles.navItemDisabled, pressed && styles.navItemPressed]}
                >
                  {({ pressed }) => (
                    <NativeIslandTabIcon
                      label={item.label}
                      emoji={item.emoji}
                      avatarUri={item.avatarUri}
                      focused={Boolean((item.active || immediateActiveKey === item.key) && !item.disabled)}
                      badge={item.badge}
                      compact={compact}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navWrap: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    shadowOffset: { width: 0, height: 8 },
    // overflow: 'hidden' intentionally absent — elevation + overflow:hidden on the
    // same animated view causes Android to drop child layers. navItems handles clipping.
    zIndex: 100,
  },
  navGlassFill: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  navBlur: {
    borderRadius: NATIVE_ISLAND_NAV.radius,
    overflow: 'hidden',
  },
  navItems: {
    flex: 1,
    overflow: 'hidden',
    /**
     * Clip to the island's SHAPE, not to its bounding box.
     *
     * `navWrap` draws the pill (radius 28 on a 56pt bar, so both ends are full
     * semicircles) but deliberately carries no `overflow: hidden` — pairing it
     * with elevation makes Android drop child layers. Clipping was therefore
     * delegated here, and this view had no radius, so it clipped to a
     * RECTANGLE: every scrolling chip was free to render across the curved ends
     * where the island's own background had already stopped. That is the
     * "icons overflow outside the borders of the island" report — the links
     * were not inside the bar, they were painted over the gap beside it.
     *
     * This view is `flex: 1` inside a fixed-height `navWrap`, so the same
     * radius reproduces the pill exactly.
     */
    borderRadius: NATIVE_ISLAND_NAV.radius,
    position: 'relative',
  },
  navModeLayer: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedItemsLayer: {
    paddingHorizontal: NATIVE_ISLAND_NAV.horizontalPadding,
  },
  navItem: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollDock: {
    flex: 1,
  },
  scrollDockContent: {
    flexGrow: 1,
    alignItems: 'center',
    /**
     * Enough inset to clear the pill's curved ends.
     *
     * The shared `horizontalPadding` is 4, which is right for the fixed dock
     * where `flex: 1` items are distributed and nothing sits hard against the
     * edge. A SCROLLING dock is different: its first and last chips travel all
     * the way to the content edge, and on a 56pt bar with a 28pt radius the arc
     * reaches about 8pt inward at the top and bottom of a chip's glyph box. At
     * 4pt those chips were landing inside the curve — so once the clip is
     * correct they would be sliced by it instead of spilling past it. 12pt
     * keeps the whole chip in the straight section of the pill.
     */
    paddingHorizontal: 12,
    gap: 2,
  },
  // Fixed chip width so Studio's 9 items keep the same breathing room as the
  // main 5-item dock; the bar scrolls instead of squashing labels.
  navItemScroll: {
    width: 72,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  navItemDisabled: {
    opacity: 0.5,
  },
  tabIconWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  tabChip: {
    width: 'auto',
    maxWidth: '100%',
    minWidth: 50,
    height: 38,
    borderRadius: 9999,
    // Border is always present (transparent when inactive) so the chip's box
    // model never changes on focus — prevents Android re-clipping the glyph.
    // A hairline ring disappears at this size on a busy backdrop; 1pt is the
    // thinnest that still draws an edge on a 3x screen. Constant in both
    // states, so the chip's box never changes on focus.
    borderWidth: 1,
    borderColor: 'transparent',
    // Was 5. The pill hugged the cell instead of its contents, so the tint ran
    // edge to edge and the label had nowhere to breathe.
    paddingHorizontal: 9,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  tabChipCompact: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 2,
  },
  tabChipInactive: {
    backgroundColor: 'transparent',
  },
  tabEmoji: {
    textAlign: 'center',
  },
  // Rule 6: avatars are rounded-square, never circles.
  tabAvatarFill: {
    width: '100%',
    height: '100%',
  },
  tabAvatar: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  tabGlyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minWidth: 0,
  },
  tabGlyphStack: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minWidth: 0,
  },
  tabEmojiWrap: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabelInactive: {
    opacity: 0.9,
    textAlign: 'center',
    flexShrink: 1,
  },
  tabLabelActive: {
    opacity: 1,
    textAlign: 'center',
    flexShrink: 1,
  },
  tabLabelWrap: {
    minHeight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    width: '100%',
    paddingHorizontal: 2,
  },
  // Badge sits just outside the top-right of the chip but within the island's safe area.
  // top: 6, right: 8 keeps it safely inside the navWrap's borderRadius: 28 corner arc.
  badgeWrap: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
