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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import { useTheme } from '@/src/theme/ThemeProvider';
import { measurePressHandler, useCommitCost } from '@/src/perf/commitCost';
// Direct, not via `navPerf`: that facade reaches wiezPerf through
// `navPerfBridge` and deals only in named T-spine stages. The pre-handler queue
// is not a stage — it is the gap before the first one — so routing it through
// the bridge would mean teaching the stage vocabulary a non-stage.
import { perfRecordTouchQueue, perfTouchQueueMs } from '@/src/perf/wiezPerf';
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

/** Press-in and press both fire for one tap. Ignore the second. */
const COMMIT_DEDUPE_MS = 400;
/**
 * How long the UI-thread pressed key may outlive its press.
 *
 * The shared value exists only to bridge the gap until React's `focused`
 * catches up, so it must be given back. Without a bound it is never cleared
 * when a press leads nowhere — a navigation the central guard ignores as a
 * duplicate or a same-target tap changes no item, so the confirmation effect
 * below never re-runs and the chip stays lit for the rest of the session. That
 * is the "two chips active at once" report: a stale pressed key on one chip and
 * a real `focused` on another.
 *
 * Clearing is safe whenever it fires: if the press did arrive, `focused` is
 * already carrying the highlight and dropping the shared key changes nothing.
 * 1200ms comfortably covers the 345-428ms shell render measured on device.
 */
const PRESSED_KEY_MAX_MS = 1200;

/**
 * How the chip crosses between states.
 *
 * Every state the chip has — frosted fill, glyph brightness, glyph scale, and
 * both label tones — runs on this one curve, so a tap moves them as a single
 * gesture instead of as four things that happen to start together. Decelerating,
 * because the chip is arriving rather than leaving.
 *
 * 170ms is under the ~200ms at which a transition starts being perceived as a
 * wait in its own right, which matters more here than anywhere else in the app:
 * this is the acknowledgement that a press registered, and the whole point of
 * driving it from a shared value is that it cannot be made to wait for React.
 *
 * All of it is UI-thread work inside a worklet. None of it touches the JS
 * thread, so none of it can be delayed by the render pressure being
 * investigated — and none of it adds to that pressure either.
 */
const ACTIVE_TRANSITION = { duration: 170, easing: Easing.out(Easing.cubic) } as const;

/**
 * The selected glyph, slightly larger than its neighbours.
 *
 * 1.09 is the brief's "obvious but not too obvious" measured against the chip:
 * below about 1.05 it reads as a rendering inconsistency rather than a choice,
 * and past roughly 1.12 the emoji meets the pill's edge at this chip height.
 * Applied as a transform, so it changes no layout box — see `glyphStyle`.
 */
const ACTIVE_GLYPH_SCALE = 1.09;

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

/*
  Memoized. The dock renders three times per tab press (press, pathname,
  confirmation), and the device capture had `Island` at 25-96ms self on each —
  every one of those re-rendered all six chips with their animated styles,
  AppText nodes and avatar image, though only the chip leaving and the chip
  arriving change `focused`. Every prop is a primitive or the stable
  `pressedKey` shared value, so the default shallow compare is exact.
*/
export const NativeIslandTabIcon = React.memo(function NativeIslandTabIcon({
  label,
  emoji,
  avatarUri,
  focused,
  badge,
  compact,
  itemKey,
  pressedKey,
}: {
  label: string;
  emoji: string;
  avatarUri?: string | null;
  focused: boolean;
  badge?: number;
  compact?: boolean;
  /** This chip's identity, compared against `pressedKey` on the UI thread. */
  itemKey?: string;
  /**
   * The key the user last pressed, written straight to the UI thread.
   *
   * `focused` arrives through React, and React cannot deliver it before the
   * destination's own render. Measured, that commit landed with `screen_mount`,
   * so a pill that waited for `focused` did "press, then active" together with
   * the screen. The shared value is written in the press handler and the UI
   * thread reads `.value` directly — optional chaining here is not a shared
   * value subscription, so the style would only rebuild when `focused` changed.
   *
   * While a press is set, it is the ONLY active key. ORing it with `focused`
   * lit the chip being left and the chip being pressed at the same time.
   */
  pressedKey: SharedValue<string | null>;
}) {
  const { theme } = useTheme();
  // The chip must stay structurally IDENTICAL whether focused or not — only
  // colors change. On Android, toggling `borderWidth`, `shadow*` props, or
  // `fontSize` on the chip whose `focused` flips true->false re-clips the view
  // (it has overflow:hidden) and momentarily blanks its glyph — that is the
  // "link disappears when navigating" bug. So: border width is always present
  // (transparent when inactive), no dynamic shadow, and a constant emoji size.
  /*
    The active chip is frosted glass. No ring.

    It previously needed one. The fill was `navActiveSurface`, which is opaque,
    so the selected chip covered the island's blur and sat on the glass as a
    flat lozenge — and a flat lozenge over an arbitrary photograph has no shape,
    which is why an edge had to be drawn around it to look deliberate.

    A translucent fill removes the cause instead of outlining it. The island's
    blur reads THROUGH the chip, so it looks like a thicker piece of the same
    glass, and a piece of glass does not need a border to have an edge — the
    density change is the edge. `navActiveGlass` carries the alpha per theme;
    see its note in `tokens.ts`.

    The border is gone from the box entirely rather than made transparent. That
    is still safe under the Android rule above: the rule is that the box must
    not CHANGE on focus, and a border that no longer exists in either state
    cannot change. Removing it also returns 2dp of inner height, which is what
    pays for the glyph scale below.

    `focused` stays in every condition so the chip is correct once React catches
    up, and so a chip that was never pressed — deep link, back, restored route —
    still lights. The shared value only ever makes it EARLIER.
  */
  const activeGlass = theme.colors.navActiveGlass;
  /*
    Opacity, not a colour interpolation.

    Fading a translucent fill in and out is one GPU property on a layer that is
    always mounted, so there is no colour maths on the UI thread and nothing
    structural moves. Interpolating `backgroundColor` from `'transparent'`
    instead would have travelled through transparent BLACK and dirtied the
    lilac on the way in.
  */
  const pillStyle = useAnimatedStyle(() => {
    const pressed = pressedKey.value;
    const isActive = pressed != null ? pressed === itemKey : focused;
    return {
      backgroundColor: activeGlass,
      opacity: withTiming(isActive ? 1 : 0, ACTIVE_TRANSITION),
    };
  }, [activeGlass, focused, itemKey, pressedKey]);

  /*
    The glyph and the label brighten on the UI thread too.

    Moving only the chip's fill was a half fix, and the device capture showed
    exactly what that feels like. The chip tinted within a frame while the
    emoji stayed at 0.76 and the label at 0.9 until React committed — and the
    tab shell that owns `focused` does not re-render until 345-428ms after the
    tap (measured: T2 `path_changed` lands there, while the destination screen
    mounts at 22-60ms). So a press lit the pill immediately and then the icon
    snapped brighter a third of a second later, which reads as "press, pause,
    active" however fast the pill itself was.

    Same `isActive` expression as the pill, same shared value, so the glyph,
    the label brightness, and the label hue land on one frame. The inactive
    glyph values are the previous literals, kept per-glyph: an avatar sat at
    0.82 and an emoji at 0.76.

    AppText resolves colour from variant/tone only and `sanitizeStyle` strips
    a colour override, so the hue cannot be animated on one text node. Two
    tones are mounted and crossfaded by opacity. The press is the only thing
    that decides which one is visible.

    Opacity only — nothing structural. The note above still applies: toggling
    `borderWidth`, `shadow*` or `fontSize` on focus re-clips the chip and blanks
    the glyph. These wrappers are always present and only their alpha changes.
  */
  const inactiveGlyphOpacity = avatarUri ? 0.82 : 0.76;
  /*
    The selected glyph is slightly larger. `transform`, never `fontSize`.

    `fontSize` would re-measure the text node and reflow the stack inside a
    chip with `overflow: hidden` — the exact thing that blanks the glyph on
    Android, per the note at the top of this component. A transform is applied
    at paint and changes no layout box at all, so the chip's geometry is as
    constant as it was before.

    `ACTIVE_GLYPH_SCALE` is 1.09 because the brief is "obvious but not too
    obvious": at 1.05 it reads as a rendering artefact next to the other chips,
    and much past 1.12 it clips against the pill at this chip height.
  */
  const glyphStyle = useAnimatedStyle(() => {
    const pressed = pressedKey.value;
    const isActive = pressed != null ? pressed === itemKey : focused;
    return {
      opacity: withTiming(isActive ? 1 : inactiveGlyphOpacity, ACTIVE_TRANSITION),
      transform: [{ scale: withTiming(isActive ? ACTIVE_GLYPH_SCALE : 1, ACTIVE_TRANSITION) }],
    };
  }, [focused, inactiveGlyphOpacity, itemKey, pressedKey]);

  const activeLabelStyle = useAnimatedStyle(() => {
    const pressed = pressedKey.value;
    const isActive = pressed != null ? pressed === itemKey : focused;
    return { opacity: withTiming(isActive ? 1 : 0, ACTIVE_TRANSITION) };
  }, [focused, itemKey, pressedKey]);

  const inactiveLabelStyle = useAnimatedStyle(() => {
    const pressed = pressedKey.value;
    const isActive = pressed != null ? pressed === itemKey : focused;
    return { opacity: withTiming(isActive ? 0 : 1, ACTIVE_TRANSITION) };
  }, [focused, itemKey, pressedKey]);

  // Static now: the chip's box never changes, and the only animated thing
  // inside it is the frosted fill below.
  const chipStyle = [styles.tabChip, compact && styles.tabChipCompact];

  return (
    <View style={styles.tabIconWrap}>
      <View style={styles.tabGlyphWrap}>
        <View style={chipStyle}>
          {/* The frosted fill, always mounted and crossfaded underneath the
              glyph. Absolutely filled so it cannot affect the stack's layout,
              and clipped to the pill by the chip's own radius. */}
          <Animated.View style={[styles.tabChipFill, pillStyle]} pointerEvents="none" />
          <View style={styles.tabGlyphStack}>
            <Animated.View style={[styles.tabEmojiWrap, glyphStyle]}>
              {avatarUri ? (
                <StableImage
                  uri={avatarUri}
                  resizeMode="cover"
                  containerStyle={styles.tabAvatar}
                  imageStyle={styles.tabAvatarFill}
                />
              ) : (
                <AppText variant="title" style={styles.tabEmoji}>
                  {emoji}
                </AppText>
              )}
            </Animated.View>
            <View style={styles.tabLabelWrap}>
              <Animated.View style={inactiveLabelStyle}>
                <AppText
                  variant="captionBold"
                  tone="secondary"
                  numberOfLines={1}
                  style={styles.tabLabelBase}
                  maxFontSizeMultiplier={1.2}
                >
                  {label}
                </AppText>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[styles.tabLabelActive, activeLabelStyle]}
              >
                <AppText
                  variant="captionBold"
                  tone="primary"
                  numberOfLines={1}
                  style={styles.tabLabelBase}
                  maxFontSizeMultiplier={1.2}
                >
                  {label}
                </AppText>
              </Animated.View>
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
});

type FixedDockHandlers = {
  pressIn: (item: NativeIslandNavItem, event?: GestureResponderEvent) => void;
  press: (item: NativeIslandNavItem) => void;
};

/**
 * One button of the fixed (non-scrolling) dock, memoized on what it SHOWS.
 *
 * The dock re-rendered all six buttons — Pressable, style callback, icon —
 * twice per tap, at 40-190ms self on the A17 (2026-10-17 capture). The shell
 * rebuilds `items` on every route change, so object identity always differs;
 * this compares the fields that actually draw or route, and reads the press
 * handlers through a stable ref. A tap now re-renders the button losing focus
 * and the one gaining it.
 */
const FixedDockButton = React.memo(
  function FixedDockButton({
    item,
    focused,
    compact,
    pressedKey,
    handlersRef,
  }: {
    item: NativeIslandNavItem;
    focused: boolean;
    compact: boolean;
    pressedKey: SharedValue<string | null>;
    handlersRef: React.MutableRefObject<FixedDockHandlers>;
  }) {
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused, disabled: item.disabled }}
        accessibilityLabel={item.label}
        disabled={item.disabled}
        onPressIn={item.disabled ? undefined : (event) => handlersRef.current.pressIn(item, event)}
        onPress={item.disabled ? undefined : () => handlersRef.current.press(item)}
        // No `android_ripple` — a bounded ripple paints a rectangle across a pill chip.
        style={({ pressed }) => [styles.navItem, item.disabled && styles.navItemDisabled, pressed && styles.navItemPressed]}
      >
        <NativeIslandTabIcon
          label={item.label}
          emoji={item.emoji}
          avatarUri={item.avatarUri}
          focused={focused}
          itemKey={item.disabled ? undefined : item.key}
          pressedKey={pressedKey}
          badge={item.badge}
          compact={compact}
        />
      </Pressable>
    );
  },
  (prev, next) =>
    prev.focused === next.focused &&
    prev.compact === next.compact &&
    prev.pressedKey === next.pressedKey &&
    prev.handlersRef === next.handlersRef &&
    prev.item.key === next.item.key &&
    prev.item.label === next.item.label &&
    prev.item.emoji === next.item.emoji &&
    prev.item.avatarUri === next.item.avatarUri &&
    prev.item.badge === next.item.badge &&
    prev.item.disabled === next.item.disabled &&
    prev.item.navFlow === next.item.navFlow &&
    prev.item.targetRoute === next.item.targetRoute &&
    JSON.stringify(prev.item.targetParams ?? null) === JSON.stringify(next.item.targetParams ?? null),
);

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
  useCommitCost('Island');
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
  /*
    `pressedItemKey` used to live here. It was write-only — set on press-in,
    cleared on press-out, cleared again on a swipe-cancel, and read by nothing:
    not a style, not a render branch, not a dependency array. The pill paints
    from the UI-thread `pressedKey` shared value below, which is what made the
    React copy redundant.

    It was not free. `onPressOut` was wired to its setter on both pressables, so
    every finger-lift committed a fresh render of the whole dock to store a
    value no one consumed — on a thread whose saturation is the latency being
    investigated. Removed rather than left in looking load-bearing.
  */
  const [immediateActiveKey, setImmediateActiveKey] = React.useState<string | null>(null);
  const [immediateActiveNavFlow, setImmediateActiveNavFlow] = React.useState<string | null>(null);
  /**
   * The pressed key, on the UI thread.
   *
   * Written synchronously in the press handler so the pill can paint without
   * waiting for a React commit it would otherwise share with the destination's
   * render. See the note on `pressedKey` in `NativeIslandTabIcon`.
   */
  const pressedKey = useSharedValue<string | null>(null);
  const pressedKeyResetRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Hand the UI-thread key back as soon as React's own `active` agrees, so the
  // pill is only ever painted from one source of truth at a time. Reading
  // `.value` here does not subscribe, which is fine: `items` changing IS the
  // signal that the authoritative state moved.
  React.useEffect(() => {
    const pressed = pressedKey.value;
    if (!pressed) return;
    const confirmed = items.some((item) => item.key === pressed && item.active);
    const stillExists = items.some((item) => item.key === pressed);
    if (confirmed || !stillExists) {
      pressedKey.value = null;
      if (pressedKeyResetRef.current) {
        clearTimeout(pressedKeyResetRef.current);
        pressedKeyResetRef.current = null;
      }
    }
  }, [items, pressedKey]);

  React.useEffect(() => {
    return () => {
      const gesture = scrollGestureRef.current;
      if (gesture?.timer) clearTimeout(gesture.timer);
      if (pressedKeyResetRef.current) clearTimeout(pressedKeyResetRef.current);
    };
  }, []);

  const paintCandidate = React.useCallback((item: NativeIslandNavItem) => {
    const navFlow = item.navFlow ?? item.key;
    const targetRoute = item.targetRoute ?? undefined;
    // First, and outside React: this is the write the pill actually paints
    // from. Everything below it is bookkeeping that may take a commit to land.
    pressedKey.value = item.key;
    // Bounded, so a press that leads nowhere cannot leave the chip lit. See
    // `PRESSED_KEY_MAX_MS`.
    if (pressedKeyResetRef.current) clearTimeout(pressedKeyResetRef.current);
    pressedKeyResetRef.current = setTimeout(() => {
      pressedKeyResetRef.current = null;
      if (pressedKey.value === item.key) {
        pressedKey.value = null;
        navPerf.mark('optimistic_active_expired', item.key);
      }
      // Drop the React override with the shared value. A press that never
      // becomes `item.active` must not keep a second chip lit.
      setImmediateActiveKey((current) => (current === item.key ? null : current));
      setImmediateActiveNavFlow((current) => (current === navFlow ? null : current));
    }, PRESSED_KEY_MAX_MS);
    // No React state here any more. `pressedKey` above already paints the
    // pill, glyph and label on the UI thread; mirroring it into
    // `immediateActiveKey` forced a full dock commit on press and another to
    // clear it — two renders per tap (25-100ms each on the A17) competing with
    // the destination screen for the JS thread, for no pixel the shared value
    // had not drawn.
    navPerf.tapPressIn(navFlow, { target: targetRoute });
    navPerf.optimisticActiveSet(navFlow, { target: targetRoute });
    navPerf.tap(navFlow);
    navPerf.pressedFeedbackVisible(navFlow);
    navPerf.activeIndicatorIntent(navFlow);
    // The pill reads `pressedKey` on the UI thread, written above. This is
    // that paint, not the later React commit of `immediateActiveKey`.
    navPerf.activeIndicatorVisible(navFlow);
  }, [pressedKey]);

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
    (item: NativeIslandNavItem, event?: GestureResponderEvent) => {
      // First statement in the handler, deliberately: it reads the clock, so
      // every line above it would be counted as queueing that JS actually
      // spent. The flow does not exist yet, so the reading is recorded a few
      // lines down once `paintCandidate` has opened it.
      const queuedMs = perfTouchQueueMs(event?.nativeEvent?.timestamp);
      // `paintCandidate` writes `pressedKey` before anything else, and the pill
      // reads that on the UI thread, so the highlight no longer depends on this
      // commit at all.
      //
      // This previously wrapped `commitSelection` in a React transition to keep
      // the pill out of the navigation's commit. That cannot work: expo-router
      // holds route state in a `useSyncExternalStore`, and React forces
      // external-store updates to sync to avoid tearing, so the navigation
      // render is never deferred. The measurement said so plainly — the pill
      // landed within a few ms of `screen_mount` on every single flow — and the
      // indirection is removed rather than left in looking load-bearing.
      paintCandidate(item);
      perfRecordTouchQueue(queuedMs);
      /*
        Timed, because its duration is the latency being investigated.

        `commitSelection` runs the navigation dispatch, and expo-router holds
        route state in a `useSyncExternalStore`, which React must update
        synchronously to avoid tearing. So the navigator's re-render and the
        destination's first render happen INSIDE this call, before the handler
        returns. There is no gesture-handler in this project, so a touch is
        observable only from JavaScript — which means the next press cannot be
        seen until this returns. This number is that blind window.

        Nothing in the T0-T10 spine can measure it: T0 is recorded inside the
        handler, so the spine starts after the queueing delay has been paid and
        ends before the block it causes.
      */
      measurePressHandler(() => {
        commitSelection(item);
      });
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

  // Latest press handlers behind a stable ref, so the memoized fixed-dock
  // buttons do not re-render every time the shell hands down new callbacks
  // (it does on every route change) — only a button whose own fields changed.
  const fixedHandlersRef = React.useRef<FixedDockHandlers>({
    pressIn: handleFixedPressIn,
    press: handleFixedPress,
  });
  fixedHandlersRef.current = { pressIn: handleFixedPressIn, press: handleFixedPress };

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
    setImmediateActiveKey((current) => (current === key ? null : current));
    setImmediateActiveNavFlow(null);
    // The highlight painted on touch-down is being taken back, because this
    // turned out to be a scroll rather than a tap. Record it, or a trace shows
    // an indicator that appeared and then silently vanished.
    if (pressedKey.value === key) pressedKey.value = null;
    navPerf.mark('optimistic_active_cancelled', key);
  }, [clearScrollTimer, pressedKey]);

  const commitScrollDockTap = React.useCallback(
    (item: NativeIslandNavItem) => {
      const gesture = scrollGestureRef.current;
      if (gesture && (gesture.moved || gesture.committed || gesture.key !== item.key)) return;
      if (gesture) {
        gesture.committed = true;
        clearScrollTimer(gesture);
      }
      scrollGestureRef.current = null;
      // Already painted on touch-down for a finger press; still needed for the
      // accessibility activate path, which never goes through press-in. The
      // setState calls are no-ops when the values match.
      paintCandidate(item);
      commitSelection(item);
    },
    [clearScrollTimer, commitSelection, paintCandidate],
  );

  const beginScrollDockPress = React.useCallback(
    (item: NativeIslandNavItem, event: GestureResponderEvent) => {
      // Read before anything else, for the reason given in `handleFixedPressIn`.
      const queuedMs = perfTouchQueueMs(event.nativeEvent.timestamp);
      const previous = scrollGestureRef.current;
      if (previous && !previous.committed) clearScrollTimer(previous);
      const { pageX, pageY } = event.nativeEvent;
      /*
        Highlight on touch-down; route still waits out the slop timer.

        The 90ms gate exists so a SWIPE across the dock does not open the chip
        the finger happened to land on. It was gating the highlight as well,
        which made every deliberate press on the Studio dock feel dead for its
        first 90ms — on top of the batching delay fixed above.

        A highlight is allowed to be wrong for 90ms, because
        `cancelScrollCandidate` takes it straight back the moment the finger
        passes the slop. A route is not, which is why only the route is gated.
      */
      paintCandidate(item);
      perfRecordTouchQueue(queuedMs);
      /*
        The route opens on RELEASE, never on a timer.

        This used to commit the chip 90ms after touch-down unless the finger
        had already moved 10px — but a swipe that starts gently has not moved
        that far in 90ms, so swiping along the Studio dock opened the chip the
        finger STARTED on. Now `onPress` (release, and only when the ScrollView
        did not take the gesture) commits; a swipe cancels the highlight via
        `trackScrollDockMove` / `onScrollBeginDrag`. The chip still lights on
        touch-down, so the press is acknowledged instantly.
      */
      scrollGestureRef.current = {
        key: item.key,
        x: pageX,
        y: pageY,
        moved: false,
        committed: false,
        timer: null,
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

  // One key. `item.active` is the route; `immediateActiveKey` is the press
  // that has not been confirmed yet. ORing them lit both chips.
  const settledKey =
    immediateActiveKey ??
    items.find((item) => item.active && !item.disabled)?.key ??
    null;

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
                    selected: item.key === settledKey && !item.disabled,
                    disabled: item.disabled,
                  }}
                  accessibilityLabel={item.label}
                  disabled={item.disabled}
                  onPressIn={item.disabled ? undefined : (event) => beginScrollDockPress(item, event)}
                  onTouchMove={item.disabled ? undefined : (event) => trackScrollDockMove(item, event)}
                  onTouchCancel={item.disabled ? undefined : () => cancelScrollCandidate()}
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
                      focused={item.key === settledKey && !item.disabled}
                      itemKey={item.disabled ? undefined : item.key}
                      pressedKey={pressedKey}
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
                <FixedDockButton
                  key={item.key}
                  item={item}
                  focused={item.key === settledKey && !item.disabled}
                  compact={compact}
                  pressedKey={pressedKey}
                  handlersRef={fixedHandlersRef}
                />
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
    // No border in either state. The active chip is frosted glass now, and a
    // density change is its own edge — see the note on `pillStyle`. Dropping it
    // also returns the 2dp of inner height that the active glyph's scale uses.
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
  // The frosted pane. Absolutely filled so it is outside the glyph stack's
  // layout entirely, and radius-matched to the chip so the crossfade is clipped
  // to the pill rather than showing its square corners.
  tabChipFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 9999,
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
  // One style for both states. The active/inactive pair differed only in
  // opacity, which is now driven on the UI thread by `labelStyle` so the label
  // brightens on the same frame as the pill instead of on React's commit.
  tabLabelBase: {
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
  tabLabelActive: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
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
