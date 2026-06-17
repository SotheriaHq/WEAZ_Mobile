import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
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
                <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.76 }]}>
                  {emoji}
                </Text>
              )}
            </View>
            <View style={styles.tabLabelWrap}>
              <AppText
                variant="captionBold"
                tone={focused ? 'primary' : 'secondary'}
                numberOfLines={1}
                style={focused ? styles.tabLabelActive : styles.tabLabelInactive}
              >
                {label}
              </AppText>
            </View>
          </View>
        </View>
        {typeof badge === 'number' && badge > 0 ? (
          <View style={styles.badgeWrap} pointerEvents="none">
            <View style={[styles.badge, { backgroundColor: theme.colors.badgeRed }]}>
              <AppText variant="captionBold" tone="inverse">
                {badge > 99 ? '99+' : badge}
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// Frosted-glass chrome (blur + milky fill). Extracted and memoized so it does
// NOT re-render when the active tab changes on navigation — re-rendering the
// (dimezis) BlurView on every route change is what made the bar visibly flicker
// / "disturb" the links. Its props (scheme/theme) only change on theme switch.
const IslandGlass = React.memo(function IslandGlass({
  scheme,
  theme,
}: {
  scheme: ReturnType<typeof useTheme>['scheme'];
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <>
      <BlurView
        tint={scheme === 'dark' ? 'dark' : 'light'}
        // Strong intensity so the island reads as bold frosted glass.
        // `experimentalBlurMethod` is required for the blur to render at all on
        // Android (otherwise only the tint fill shows, which looks flat).
        intensity={scheme === 'dark' ? 90 : 80}
        experimentalBlurMethod="dimezisBlurView"
        style={[StyleSheet.absoluteFill, styles.navBlur]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.navGlassFill,
          {
            // Bold milky frost layer over the blur. Heavier opacity gives the
            // bar a stronger frosted presence while staying flat (no depth).
            backgroundColor: scheme === 'dark' ? 'rgba(10,12,20,0.58)' : 'rgba(255,255,255,0.66)',
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
                accessibilityState={{ selected: Boolean(item.active && !item.disabled), disabled: item.disabled }}
                accessibilityLabel={item.label}
                disabled={item.disabled}
                onPressIn={item.disabled ? undefined : () => { onPressIn?.(item); onSelect(item); }}
                onPress={undefined}
                style={({ pressed }) => [styles.navItem, item.disabled && styles.navItemDisabled, pressed && styles.navItemPressed]}
              >
                <NativeIslandTabIcon
                  label={item.label}
                  emoji={item.emoji}
                  avatarUri={item.avatarUri}
                  focused={Boolean(item.active && !item.disabled)}
                  badge={item.badge}
                  compact={compact}
                />
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
    fontSize: 20,
    lineHeight: 20,
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
