import React from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navPerf } from '@/src/utils/navPerf';
import {
  getNativeIslandContentClearance,
  getNativeIslandLayout,
  NATIVE_ISLAND_NAV,
  useScreenChrome,
} from '@/src/system/ScreenChrome';

export { getNativeIslandContentClearance, getNativeIslandLayout, NATIVE_ISLAND_NAV };

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
  const chipStyle = [
    styles.tabChip,
    compact && styles.tabChipCompact,
    {
      backgroundColor: focused ? theme.colors.primarySoft : 'transparent',
      borderColor: focused ? theme.colors.primarySoft : 'transparent',
    },
  ];

  return (
    <View style={styles.tabIconWrap}>
      <View style={styles.tabGlyphWrap}>
        <View style={chipStyle}>
          <View style={styles.tabGlyphStack}>
            <View style={styles.tabEmojiWrap}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={[styles.tabAvatar, { opacity: focused ? 1 : 0.82 }]}
                  resizeMode="cover"
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
      ? 'rgba(10,12,20,0.58)'
      : 'rgba(255,255,255,0.66)'
    : scheme === 'dark'
      ? 'rgba(14,16,24,0.92)'
      : 'rgba(250,250,252,0.94)';

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
  const compact = items.length >= 6 || windowWidth < 380;
  const [pressedItemKey, setPressedItemKey] = React.useState<string | null>(null);
  const [immediateActiveKey, setImmediateActiveKey] = React.useState<string | null>(null);
  const [immediateActiveNavFlow, setImmediateActiveNavFlow] = React.useState<string | null>(null);

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

  const clearPressedItem = React.useCallback(() => {
    setPressedItemKey(null);
  }, []);

  const handleItemPressIn = React.useCallback(
    (item: NativeIslandNavItem) => {
      const navFlow = item.navFlow ?? item.key;
      const targetRoute = item.targetRoute ?? undefined;
      setPressedItemKey(item.key);
      setImmediateActiveKey(item.key);
      setImmediateActiveNavFlow(navFlow);
      navPerf.tapPressIn(navFlow, { target: targetRoute });
      navPerf.optimisticActiveSet(navFlow, { target: targetRoute });
      navPerf.tap(navFlow); // keep existing for compat
      navPerf.pressedFeedbackVisible(navFlow);
      navPerf.activeIndicatorIntent(navFlow);
      onPressIn?.(item);
      onSelect(item);
    },
    [onPressIn, onSelect],
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
            shadowColor: scheme === 'dark' ? '#000000' : 'rgba(15, 23, 42, 0.9)',
            shadowOpacity: scheme === 'dark' ? 0.42 : 0.24,
            shadowRadius: 28,
            elevation: 16,
          },
        ]}
      >
        <IslandGlass scheme={scheme} theme={theme} />
        <View style={styles.navItems}>
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
                onPressIn={item.disabled ? undefined : () => handleItemPressIn(item)}
                onPressOut={clearPressedItem}
                onPress={undefined}
                android_ripple={{
                  color: scheme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(147,51,234,0.14)',
                  borderless: false,
                  foreground: true,
                }}
                style={({ pressed }) => [styles.navItem, item.disabled && styles.navItemDisabled, pressed && styles.navItemPressed]}
              >
                {({ pressed }) => (
                  <NativeIslandTabIcon
                    label={item.label}
                    emoji={item.emoji}
                    avatarUri={item.avatarUri}
                    focused={Boolean((item.active || immediateActiveKey === item.key || pressedItemKey === item.key || pressed) && !item.disabled)}
                    badge={item.badge}
                    compact={compact}
                  />
                )}
              </Pressable>
            ))}
          </View>
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: 5,
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
