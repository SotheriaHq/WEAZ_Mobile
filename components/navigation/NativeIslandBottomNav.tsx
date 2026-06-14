import React from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
  collapsed?: boolean;
  onCollapsedPress?: () => void;
};

const COLLAPSED_MAX_WIDTH = 216;
const COLLAPSED_ACTIVE_CHIP_WIDTH = 96;
const COLLAPSED_ACTIVE_CHIP_COMPACT_WIDTH = 88;
const COLLAPSED_PREVIEW_WIDTH = 24;
const COLLAPSED_PREVIEW_COMPACT_WIDTH = 22;
const COLLAPSED_ITEM_GAP = 4;
const COLLAPSED_HORIZONTAL_PADDING = 10;
const COLLAPSED_MAX_PREVIEW_ITEMS = 3;
const COLLAPSED_MAX_PREVIEW_ITEMS_COMPACT = 2;

function getCollapsedPreviewItems({
  items,
  activeIndex,
  previewLimit,
}: {
  items: NativeIslandNavItem[];
  activeIndex: number;
  previewLimit: number;
}) {
  const before = items.slice(0, activeIndex).filter((item) => !item.disabled);
  const after = items.slice(activeIndex + 1).filter((item) => !item.disabled);
  const targetCount = Math.min(previewLimit, before.length + after.length);

  if (targetCount <= 0) {
    return { leftItems: [], rightItems: [] };
  }

  if (before.length === 0) {
    return { leftItems: [], rightItems: after.slice(0, targetCount) };
  }

  if (after.length === 0) {
    return { leftItems: before.slice(-targetCount), rightItems: [] };
  }

  let leftCount = Math.min(before.length, Math.floor(targetCount / 2));
  let rightCount = Math.min(after.length, targetCount - leftCount);

  const remaining = targetCount - leftCount - rightCount;
  if (remaining > 0) {
    const extraLeft = Math.min(before.length - leftCount, remaining);
    leftCount += extraLeft;
    rightCount += Math.min(after.length - rightCount, remaining - extraLeft);
  }

  return {
    leftItems: before.slice(-leftCount),
    rightItems: after.slice(0, rightCount),
  };
}

function getCenteredLeft(windowWidth: number, width: number) {
  const minLeft = NATIVE_ISLAND_NAV.minSideOffset;
  const maxLeft = Math.max(minLeft, windowWidth - minLeft - width);
  const centeredLeft = Math.round((windowWidth - width) / 2);
  return Math.min(Math.max(minLeft, centeredLeft), maxLeft);
}

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
  const chipStyle = [
    styles.tabChip,
    compact && styles.tabChipCompact,
    focused
        ? {
          backgroundColor: theme.colors.primarySoft,
          borderColor: theme.colors.primarySoft,
          borderWidth: StyleSheet.hairlineWidth,
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 18,
          // No elevation: on Android, elevation raises z-order and its shadow layer
          // covers adjacent chips, making their emojis invisible on tab switch.
          // The primarySoft background is sufficient as the active indicator.
        }
      : styles.tabChipInactive,
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
                <Text style={[styles.tabEmoji, { fontSize: focused ? 20 : 19, opacity: focused ? 1 : 0.76 }]}>
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

export function NativeIslandBottomNav({
  items,
  onSelect,
  onPressIn,
  collapsed = false,
  onCollapsedPress,
}: NativeIslandBottomNavProps) {
  const { scheme, theme } = useTheme();
  const { windowWidth, islandLayout } = useScreenChrome();
  const { bottomOffset, sideOffset, islandWidth } = islandLayout;
  const compact = items.length >= 6 || windowWidth < 380;
  const orderedItems = items;
  const activeIndex = Math.max(0, orderedItems.findIndex((item) => item.active && !item.disabled));
  const activeItem = orderedItems[activeIndex] ?? orderedItems[0];
  const collapsedActiveChipWidth = compact ? COLLAPSED_ACTIVE_CHIP_COMPACT_WIDTH : COLLAPSED_ACTIVE_CHIP_WIDTH;
  const collapsedPreviewWidth = compact ? COLLAPSED_PREVIEW_COMPACT_WIDTH : COLLAPSED_PREVIEW_WIDTH;
  const collapsedMaxWidth = Math.min(
    islandWidth,
    COLLAPSED_MAX_WIDTH,
    Math.max(
      collapsedActiveChipWidth + COLLAPSED_HORIZONTAL_PADDING * 2,
      Math.round(windowWidth * 0.58),
    ),
  );
  const collapsedPreviewCapacity = Math.max(
    0,
    Math.floor(
      (collapsedMaxWidth -
        collapsedActiveChipWidth -
        COLLAPSED_HORIZONTAL_PADDING * 2 +
        COLLAPSED_ITEM_GAP) /
        (collapsedPreviewWidth + COLLAPSED_ITEM_GAP),
    ),
  );
  const desiredCollapsedPreviewLimit = compact
    ? COLLAPSED_MAX_PREVIEW_ITEMS_COMPACT
    : COLLAPSED_MAX_PREVIEW_ITEMS;
  const collapsedPreviewLimit = Math.min(desiredCollapsedPreviewLimit, collapsedPreviewCapacity);
  const { leftItems: collapsedLeftItems, rightItems: collapsedRightItems } = React.useMemo(
    () => getCollapsedPreviewItems({ items: orderedItems, activeIndex, previewLimit: collapsedPreviewLimit }),
    [activeIndex, collapsedPreviewLimit, orderedItems],
  );
  const collapsedPreviewCount = collapsedLeftItems.length + collapsedRightItems.length;
  const collapsedContentWidth =
    collapsedActiveChipWidth +
    collapsedPreviewCount * collapsedPreviewWidth +
    collapsedPreviewCount * COLLAPSED_ITEM_GAP +
    COLLAPSED_HORIZONTAL_PADDING * 2;
  const collapsedWidth = Math.min(collapsedMaxWidth, collapsedContentWidth);
  const collapsedLeft = getCenteredLeft(windowWidth, collapsedWidth);
  const navLeft = collapsed ? collapsedLeft : sideOffset;
  const navWidth = collapsed ? collapsedWidth : islandWidth;
  const navLeftAnim = React.useRef(new Animated.Value(navLeft)).current;
  const navWidthAnim = React.useRef(new Animated.Value(navWidth)).current;
  const collapsedOpacityAnim = React.useRef(new Animated.Value(collapsed ? 1 : 0)).current;
  const expandedOpacityAnim = React.useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const collapsedScaleAnim = React.useRef(new Animated.Value(collapsed ? 1 : 0.96)).current;
  const expandedScaleAnim = React.useRef(new Animated.Value(collapsed ? 0.98 : 1)).current;

  React.useEffect(() => {
    const containerEasing = Easing.out(Easing.cubic);
    const fadeEasing = Easing.out(Easing.quad);
    navLeftAnim.stopAnimation();
    navWidthAnim.stopAnimation();
    collapsedOpacityAnim.stopAnimation();
    expandedOpacityAnim.stopAnimation();
    collapsedScaleAnim.stopAnimation();
    expandedScaleAnim.stopAnimation();

    // All animations use useNativeDriver: false so they run on the same JS thread
    // as the layout (width/left) animations. Mixing drivers causes desync that
    // produces the "shaking" effect where items clip before they finish fading.
    Animated.parallel([
      Animated.timing(navLeftAnim, {
        toValue: navLeft,
        duration: 160,
        easing: containerEasing,
        useNativeDriver: false,
      }),
      Animated.timing(navWidthAnim, {
        toValue: navWidth,
        duration: 160,
        easing: containerEasing,
        useNativeDriver: false,
      }),
      // Collapse: show collapsed chip quickly (140ms). Expand: hide it fast (80ms).
      Animated.timing(collapsedOpacityAnim, {
        toValue: collapsed ? 1 : 0,
        duration: collapsed ? 140 : 80,
        easing: fadeEasing,
        useNativeDriver: false,
      }),
      // Collapse: fade items out fast (80ms) BEFORE container finishes shrinking (160ms)
      // so items never get visibly clipped. Expand: delay 20ms then fade in over 140ms
      // so items reach full opacity as the container reaches full width.
      Animated.timing(expandedOpacityAnim, {
        toValue: collapsed ? 0 : 1,
        duration: collapsed ? 80 : 140,
        delay: collapsed ? 0 : 20,
        easing: fadeEasing,
        useNativeDriver: false,
      }),
      Animated.timing(collapsedScaleAnim, {
        toValue: collapsed ? 1 : 0.96,
        duration: 160,
        easing: containerEasing,
        useNativeDriver: false,
      }),
      Animated.timing(expandedScaleAnim, {
        toValue: collapsed ? 0.98 : 1,
        duration: 160,
        easing: containerEasing,
        useNativeDriver: false,
      }),
    ]).start();
  }, [
    collapsed,
    collapsedOpacityAnim,
    collapsedScaleAnim,
    expandedOpacityAnim,
    expandedScaleAnim,
    navLeft,
    navLeftAnim,
    navWidth,
    navWidthAnim,
  ]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.navWrap,
          {
            left: navLeftAnim,
            width: navWidthAnim,
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
        <BlurView
          tint={scheme === 'dark' ? 'dark' : 'light'}
          intensity={theme.colors.glassBlur as number}
          style={[StyleSheet.absoluteFill, styles.navBlur]}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.navGlassFill,
            {
              backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)',
              borderColor: theme.colors.glassBorder,
              borderRadius: NATIVE_ISLAND_NAV.radius,
            },
          ]}
        />
        <View style={styles.navItems}>
          <Animated.View
            pointerEvents={collapsed ? 'auto' : 'none'}
            accessibilityElementsHidden={!collapsed}
            importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.navModeLayer,
              {
                opacity: collapsedOpacityAnim,
                transform: [{ scale: collapsedScaleAnim }],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Expand navigation. Current tab: ${activeItem?.label ?? 'WEAZ'}`}
              onPressIn={() => onCollapsedPress?.()}
              style={({ pressed }) => [styles.collapsedButton, pressed && styles.navItemPressed]}
            >
              <View style={styles.collapsedContentRow} pointerEvents="none">
                {collapsedLeftItems.map((item) => (
                  <View key={item.key} style={[styles.collapsedDeckItem, { width: collapsedPreviewWidth }]}>
                    {item.avatarUri ? (
                      <Image
                        source={{ uri: item.avatarUri }}
                        style={styles.collapsedDeckAvatar}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.collapsedDeckEmoji}>
                        {item.emoji}
                      </Text>
                    )}
                    {typeof item.badge === 'number' && item.badge > 0 ? (
                      <View style={[styles.collapsedBadge, { backgroundColor: theme.colors.badgeRed }]} />
                    ) : null}
                  </View>
                ))}
                <View
                  style={[
                    styles.collapsedActiveChip,
                    {
                      backgroundColor: theme.colors.primarySoft,
                      width: collapsedActiveChipWidth,
                    },
                  ]}
                >
                  {activeItem?.avatarUri ? (
                    <Image
                      source={{ uri: activeItem.avatarUri }}
                      style={styles.collapsedActiveAvatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.collapsedActiveEmoji}>{activeItem?.emoji ?? String.fromCodePoint(0x2022)}</Text>
                  )}
                  <AppText
                    variant="captionBold"
                    tone="primary"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.collapsedActiveLabel}
                  >
                    {activeItem?.label ?? 'Menu'}
                  </AppText>
                </View>
                {collapsedRightItems.map((item) => (
                  <View key={item.key} style={[styles.collapsedDeckItem, { width: collapsedPreviewWidth }]}>
                    {item.avatarUri ? (
                      <Image
                        source={{ uri: item.avatarUri }}
                        style={styles.collapsedDeckAvatar}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.collapsedDeckEmoji}>
                        {item.emoji}
                      </Text>
                    )}
                    {typeof item.badge === 'number' && item.badge > 0 ? (
                      <View style={[styles.collapsedBadge, { backgroundColor: theme.colors.badgeRed }]} />
                    ) : null}
                  </View>
                ))}
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View
            pointerEvents={collapsed ? 'none' : 'auto'}
            accessibilityElementsHidden={collapsed}
            importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
            style={[
              styles.navModeLayer,
              styles.expandedItemsLayer,
              {
                opacity: expandedOpacityAnim,
                transform: [{ scale: expandedScaleAnim }],
              },
            ]}
          >
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
          </Animated.View>
        </View>
      </Animated.View>
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
  collapsedButton: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: COLLAPSED_HORIZONTAL_PADDING,
    position: 'relative',
  },
  collapsedContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: COLLAPSED_ITEM_GAP,
    maxWidth: '100%',
  },
  collapsedActiveChip: {
    height: 42,
    borderRadius: 21,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 6,
    zIndex: 2,
    overflow: 'hidden',
  },
  collapsedActiveEmoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  collapsedActiveLabel: {
    maxWidth: '100%',
    minWidth: 0,
    textAlign: 'center',
  },
  collapsedDeckItem: {
    width: COLLAPSED_PREVIEW_WIDTH,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  collapsedDeckEmoji: {
    fontSize: 12,
    lineHeight: 14,
    opacity: 0.62,
  },
  collapsedBadge: {
    position: 'absolute',
    right: 1,
    top: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
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
    lineHeight: 20,
    textAlign: 'center',
  },
  // Rule 6: avatars are rounded-square, never circles.
  tabAvatar: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  collapsedActiveAvatar: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  collapsedDeckAvatar: {
    width: 16,
    height: 16,
    borderRadius: 5,
    opacity: 0.7,
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
