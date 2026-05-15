import React from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navDevLog } from '@/src/features/feed/utils/feedDiagnostics';
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

const COLLAPSED_MIN_WIDTH = 144;
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

  let leftCount = before.length > 0 && after.length > 0
    ? Math.min(before.length, Math.floor(targetCount / 2))
    : Math.min(before.length, targetCount);
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
  focused,
  badge,
  compact,
}: {
  label: string;
  emoji: string;
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
              <Text style={[styles.tabEmoji, { fontSize: focused ? 20 : 19, opacity: focused ? 1 : 0.76 }]}>
                {emoji}
              </Text>
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
  const pathname = usePathname();
  const { bottomOffset, sideOffset, islandWidth } = islandLayout;
  const compact = items.length >= 6 || windowWidth < 380;
  const orderedItems = items;
  const activeIndex = Math.max(0, orderedItems.findIndex((item) => item.active && !item.disabled));
  const activeItem = orderedItems[activeIndex] ?? orderedItems[0];
  const collapsedPreviewLimit = compact ? COLLAPSED_MAX_PREVIEW_ITEMS_COMPACT : COLLAPSED_MAX_PREVIEW_ITEMS;
  const { leftItems: collapsedLeftItems, rightItems: collapsedRightItems } = React.useMemo(
    () => getCollapsedPreviewItems({ items: orderedItems, activeIndex, previewLimit: collapsedPreviewLimit }),
    [activeIndex, collapsedPreviewLimit, orderedItems],
  );
  const collapsedPreviewCount = collapsedLeftItems.length + collapsedRightItems.length;
  const collapsedActiveChipWidth = compact ? COLLAPSED_ACTIVE_CHIP_COMPACT_WIDTH : COLLAPSED_ACTIVE_CHIP_WIDTH;
  const collapsedPreviewWidth = compact ? COLLAPSED_PREVIEW_COMPACT_WIDTH : COLLAPSED_PREVIEW_WIDTH;
  const collapsedContentWidth =
    collapsedActiveChipWidth +
    collapsedPreviewCount * collapsedPreviewWidth +
    collapsedPreviewCount * COLLAPSED_ITEM_GAP +
    COLLAPSED_HORIZONTAL_PADDING * 2;
  const collapsedMaxWidth = Math.min(
    islandWidth,
    COLLAPSED_MAX_WIDTH,
    Math.max(COLLAPSED_MIN_WIDTH, Math.round(windowWidth * 0.58)),
  );
  const collapsedWidth = Math.min(collapsedMaxWidth, Math.max(COLLAPSED_MIN_WIDTH, collapsedContentWidth));
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
    const easing = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(navLeftAnim, {
        toValue: navLeft,
        duration: 220,
        easing,
        useNativeDriver: false,
      }),
      Animated.timing(navWidthAnim, {
        toValue: navWidth,
        duration: 220,
        easing,
        useNativeDriver: false,
      }),
      Animated.timing(collapsedOpacityAnim, {
        toValue: collapsed ? 1 : 0,
        duration: collapsed ? 180 : 120,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(expandedOpacityAnim, {
        toValue: collapsed ? 0 : 1,
        duration: collapsed ? 120 : 180,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(collapsedScaleAnim, {
        toValue: collapsed ? 1 : 0.96,
        duration: 220,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(expandedScaleAnim, {
        toValue: collapsed ? 0.98 : 1,
        duration: 220,
        easing,
        useNativeDriver: true,
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

  React.useEffect(() => {
    navDevLog('island-layout', {
      pathname,
      itemCount: items.length,
      keys: items.map((item) => item.key),
      labels: items.map((item) => item.label),
      compact,
      collapsed,
      windowWidth,
      islandWidth,
      collapsedWidth,
      collapsedLeft,
      activeKey: items.find((item) => item.active)?.key ?? null,
    });
    navDevLog('collapsed-layout', {
      pathname,
      activeKey: activeItem?.key ?? null,
      activeIndex,
      leftPreviewKeys: collapsedLeftItems.map((item) => item.key),
      rightPreviewKeys: collapsedRightItems.map((item) => item.key),
      collapsedWidth,
      collapsedLeft,
      collapsed,
    });
  }, [activeIndex, activeItem?.key, collapsed, collapsedLeft, collapsedLeftItems, collapsedRightItems, collapsedWidth, compact, islandWidth, items, pathname, windowWidth]);
  if (items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
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
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.navBaseFill,
            {
              backgroundColor: theme.colors.glassSurface,
            },
          ]}
        />
        <BlurView
          tint={scheme === 'dark' ? 'dark' : 'light'}
          intensity={theme.colors.glassBlur as number}
          style={[StyleSheet.absoluteFillObject, styles.navBlur]}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.navGlassFill,
            {
              backgroundColor: theme.colors.glassSurfaceStrong,
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
              accessibilityLabel={`Expand navigation. Current tab: ${activeItem?.label ?? 'Threadly'}`}
              onPress={() => {
                onCollapsedPress?.();
              }}
              style={({ pressed }) => [styles.collapsedButton, pressed && styles.navItemPressed]}
            >
              <View style={styles.collapsedContentRow} pointerEvents="none">
                {collapsedLeftItems.map((item) => (
                  <View key={item.key} style={[styles.collapsedDeckItem, { width: collapsedPreviewWidth }]}>
                    <Text style={styles.collapsedDeckEmoji}>
                      {item.emoji}
                    </Text>
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
                  <Text style={styles.collapsedActiveEmoji}>{activeItem?.emoji ?? String.fromCodePoint(0x2022)}</Text>
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
                    <Text style={styles.collapsedDeckEmoji}>
                      {item.emoji}
                    </Text>
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
                onPressIn={item.disabled ? undefined : () => onPressIn?.(item)}
                onPress={item.disabled ? undefined : () => onSelect(item)}
                style={({ pressed }) => [styles.navItem, item.disabled && styles.navItemDisabled, pressed && styles.navItemPressed]}
              >
                <NativeIslandTabIcon
                  label={item.label}
                  emoji={item.emoji}
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
    overflow: 'hidden',
    zIndex: 100,
  },
  navGlassFill: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  navBaseFill: {
    borderWidth: 0,
    borderRadius: NATIVE_ISLAND_NAV.radius,
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
    ...StyleSheet.absoluteFillObject,
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
  tabGlyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minWidth: 0,
  },
  tabGlyphStack: {
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
