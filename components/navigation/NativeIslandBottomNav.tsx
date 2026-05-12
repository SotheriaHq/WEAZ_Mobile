import React from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
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
  const [itemLayouts, setItemLayouts] = React.useState<Record<string, { x: number; width: number }>>({});
  const compact = items.length >= 6 || windowWidth < 380;
  const orderedItems = items;
  const activeIndex = Math.max(0, orderedItems.findIndex((item) => item.active && !item.disabled));
  const activeItem = orderedItems[activeIndex] ?? orderedItems[0];
  const visibleLeftItems = orderedItems.slice(0, activeIndex).filter((item) => !item.disabled);
  const visibleRightItems = orderedItems.slice(activeIndex + 1).filter((item) => !item.disabled);
  const deckItems = [...visibleLeftItems, ...visibleRightItems];
  const collapsedWidth = Math.min(islandWidth, Math.max(144, Math.min(196, Math.round(windowWidth * 0.44))));
  const collapsedDeckOffset = Math.max(74, Math.min(98, collapsedWidth - 42));
  const measuredActiveLayout = activeItem ? itemLayouts[activeItem.key] : null;
  const fallbackItemWidth = orderedItems.length > 0 ? islandWidth / orderedItems.length : islandWidth;
  const activeTabCenterX = measuredActiveLayout
    ? sideOffset + measuredActiveLayout.x + measuredActiveLayout.width / 2
    : sideOffset + fallbackItemWidth * activeIndex + fallbackItemWidth / 2;
  const collapsedLeft = Math.min(
    Math.max(
      NATIVE_ISLAND_NAV.minSideOffset,
      Math.round(activeTabCenterX - collapsedWidth / 2),
    ),
    Math.max(NATIVE_ISLAND_NAV.minSideOffset, windowWidth - NATIVE_ISLAND_NAV.minSideOffset - collapsedWidth),
  );
  const handleItemLayout = React.useCallback((key: string, x: number, width: number) => {
    setItemLayouts((current) => {
      const previous = current[key];
      const nextX = Math.round(x);
      const nextWidth = Math.round(width);
      if (previous?.x === nextX && previous.width === nextWidth) return current;
      return {
        ...current,
        [key]: { x: nextX, width: nextWidth },
      };
    });
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  React.useEffect(() => {
    LayoutAnimation.configureNext({
      duration: 180,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
  }, [collapsed]);

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
      activeTabCenterX: Math.round(activeTabCenterX),
      measured: Boolean(measuredActiveLayout),
      activeKey: items.find((item) => item.active)?.key ?? null,
    });
    navDevLog('collapsed-layout', {
      pathname,
      activeKey: activeItem?.key ?? null,
      activeIndex,
      visibleLeftKeys: visibleLeftItems.map((item) => item.key),
      visibleRightKeys: visibleRightItems.map((item) => item.key),
      deckKeys: deckItems.map((item) => item.key),
      collapsedWidth,
      collapsedLeft,
      activeTabCenterX: Math.round(activeTabCenterX),
      collapsed,
    });
  }, [activeIndex, activeItem?.key, activeTabCenterX, collapsed, collapsedLeft, collapsedWidth, compact, deckItems, islandWidth, items, measuredActiveLayout, pathname, visibleLeftItems, visibleRightItems, windowWidth]);
  if (items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      <View
        style={[
          styles.navWrap,
          {
            left: collapsed ? collapsedLeft : sideOffset,
            width: collapsed ? collapsedWidth : islandWidth,
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
          {collapsed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Expand navigation. Current tab: ${activeItem?.label ?? 'Threadly'}`}
              onPress={() => {
                onCollapsedPress?.();
              }}
              style={({ pressed }) => [styles.collapsedButton, pressed && styles.navItemPressed]}
            >
              <View style={[styles.collapsedSideDeck, { right: collapsedDeckOffset }]} pointerEvents="none">
                {visibleLeftItems.map((item, index) => {
                  return (
                    <View
                      key={item.key}
                      style={[
                        styles.collapsedDeckItem,
                        { transform: [{ translateX: Math.max(-18, -6 * (visibleLeftItems.length - index)) }] },
                      ]}
                    >
                      <Text style={styles.collapsedDeckEmoji}>
                        {item.emoji}
                      </Text>
                      {typeof item.badge === 'number' && item.badge > 0 ? (
                        <View style={[styles.collapsedBadge, { backgroundColor: theme.colors.badgeRed }]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <View style={[styles.collapsedActiveChip, { backgroundColor: theme.colors.primarySoft }]}>
                <Text style={styles.collapsedActiveEmoji}>{activeItem?.emoji ?? String.fromCodePoint(0x2022)}</Text>
                <AppText variant="captionBold" tone="primary" numberOfLines={1} style={styles.collapsedActiveLabel}>
                  {activeItem?.label ?? 'Menu'}
                </AppText>
              </View>
              <View style={[styles.collapsedSideDeck, { left: collapsedDeckOffset }]} pointerEvents="none">
                {visibleRightItems.map((item, index) => {
                  return (
                    <View
                      key={item.key}
                      style={[
                        styles.collapsedDeckItem,
                        { transform: [{ translateX: Math.min(18, 6 * (index + 1)) }] },
                      ]}
                    >
                      <Text style={styles.collapsedDeckEmoji}>
                        {item.emoji}
                      </Text>
                      {typeof item.badge === 'number' && item.badge > 0 ? (
                        <View style={[styles.collapsedBadge, { backgroundColor: theme.colors.badgeRed }]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Pressable>
          ) : (
            items.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: Boolean(item.active && !item.disabled), disabled: item.disabled }}
                accessibilityLabel={item.label}
                disabled={item.disabled}
                onPressIn={item.disabled ? undefined : () => onPressIn?.(item)}
                onPress={item.disabled ? undefined : () => onSelect(item)}
                onLayout={(event) => {
                  handleItemLayout(item.key, event.nativeEvent.layout.x, event.nativeEvent.layout.width);
                }}
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
            ))
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: NATIVE_ISLAND_NAV.horizontalPadding,
    overflow: 'hidden',
  },
  collapsedButton: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'relative',
  },
  collapsedActiveChip: {
    minWidth: 78,
    maxWidth: 110,
    height: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    zIndex: 2,
  },
  collapsedActiveEmoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  collapsedActiveLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  collapsedSideDeck: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    zIndex: 1,
  },
  collapsedDeckItem: {
    width: 16,
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
