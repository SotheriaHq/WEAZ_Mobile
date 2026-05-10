import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { navDevLog } from '@/src/features/feed/utils/feedDiagnostics';

export const NATIVE_ISLAND_NAV = {
  height: 56,
  radius: 28,
  maxWidth: 420,
  minSideOffset: 16,
  safeAreaGap: 10,
  minBottomOffset: 14,
  horizontalPadding: 4,
  contentClearance: 88,
} as const;

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

export function getNativeIslandLayout(windowWidth: number, bottomInset: number) {
  const islandWidth = Math.min(
    Math.max(windowWidth - NATIVE_ISLAND_NAV.minSideOffset * 2, 0),
    NATIVE_ISLAND_NAV.maxWidth,
  );
  const sideOffset = Math.max(
    NATIVE_ISLAND_NAV.minSideOffset,
    Math.round((windowWidth - islandWidth) / 2),
  );
  const bottomOffset = Math.max(
    NATIVE_ISLAND_NAV.minBottomOffset,
    bottomInset + NATIVE_ISLAND_NAV.safeAreaGap,
  );

  return { bottomOffset, sideOffset, islandWidth };
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
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { width: windowWidth } = useWindowDimensions();
  const { bottomOffset, sideOffset, islandWidth } = getNativeIslandLayout(windowWidth, insets.bottom);
  const compact = items.length >= 6 || windowWidth < 380;
  const orderedItems = items;
  const activeIndex = Math.max(0, orderedItems.findIndex((item) => item.active && !item.disabled));
  const activeItem = orderedItems[activeIndex] ?? orderedItems[0];
  const visibleLeftItems = orderedItems.slice(0, activeIndex).filter((item) => !item.disabled);
  const visibleRightItems = orderedItems.slice(activeIndex + 1).filter((item) => !item.disabled);
  const deckItems = [...visibleLeftItems, ...visibleRightItems];
  const collapsedWidth = Math.min(islandWidth, Math.max(172, Math.min(238, Math.round(windowWidth * 0.52))));
  const collapsedSideOffset = Math.max(NATIVE_ISLAND_NAV.minSideOffset, Math.round((windowWidth - collapsedWidth) / 2));
  const [scrubMode, setScrubMode] = React.useState(false);
  const [scrubCandidateKey, setScrubCandidateKey] = React.useState<string | null>(null);
  const scrubModeRef = React.useRef(false);
  const scrubStartXRef = React.useRef<number | null>(null);
  const scrubMovedRef = React.useRef(false);
  const scrubCandidateRef = React.useRef<NativeIslandNavItem | null>(null);
  const suppressNextPressRef = React.useRef(false);

  const getCandidateFromX = React.useCallback(
    (x: number) => {
      if (!orderedItems.length) return null;
      const segmentWidth = collapsedWidth / orderedItems.length;
      const rawIndex = Math.max(0, Math.min(orderedItems.length - 1, Math.floor(x / Math.max(1, segmentWidth))));
      const candidate = orderedItems[rawIndex];
      return candidate && !candidate.disabled ? candidate : null;
    },
    [collapsedWidth, orderedItems],
  );

  const updateScrubCandidate = React.useCallback(
    (event: GestureResponderEvent) => {
      const locationX = event.nativeEvent.locationX;
      if (scrubStartXRef.current !== null && Math.abs(locationX - scrubStartXRef.current) >= 18) {
        scrubMovedRef.current = true;
      }
      if (!scrubModeRef.current) return;
      const candidate = getCandidateFromX(locationX);
      scrubCandidateRef.current = candidate;
      setScrubCandidateKey(candidate?.key ?? null);
    },
    [getCandidateFromX],
  );

  const resetScrub = React.useCallback(() => {
    scrubModeRef.current = false;
    scrubStartXRef.current = null;
    scrubMovedRef.current = false;
    scrubCandidateRef.current = null;
    setScrubMode(false);
    setScrubCandidateKey(null);
  }, []);

  const commitScrub = React.useCallback(() => {
    if (!scrubModeRef.current) return false;
    const candidate = scrubCandidateRef.current;
    const shouldNavigate = Boolean(candidate && scrubMovedRef.current && candidate.key !== activeItem?.key);
    suppressNextPressRef.current = true;
    resetScrub();
    if (shouldNavigate && candidate) {
      onSelect(candidate);
    }
    return true;
  }, [activeItem?.key, onSelect, resetScrub]);

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
      activeKey: items.find((item) => item.active)?.key ?? null,
    });
    navDevLog('collapsed-layout', {
      pathname,
      activeKey: activeItem?.key ?? null,
      activeIndex,
      visibleLeftKeys: visibleLeftItems.map((item) => item.key),
      visibleRightKeys: visibleRightItems.map((item) => item.key),
      deckKeys: deckItems.map((item) => item.key),
      collapsed,
    });
  }, [activeIndex, activeItem?.key, collapsed, compact, deckItems, islandWidth, items, pathname, visibleLeftItems, visibleRightItems, windowWidth]);
  if (items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      <View
        style={[
          styles.navWrap,
          {
            left: sideOffset,
            right: sideOffset,
            ...(collapsed
              ? {
                  left: collapsedSideOffset,
                  right: collapsedSideOffset,
                }
              : null),
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
              delayLongPress={260}
              onTouchStart={(event) => {
                scrubStartXRef.current = event.nativeEvent.locationX;
              }}
              onTouchMove={updateScrubCandidate}
              onLongPress={(event) => {
                scrubModeRef.current = true;
                setScrubMode(true);
                updateScrubCandidate(event);
              }}
              onPressOut={() => {
                commitScrub();
              }}
              onPress={() => {
                if (scrubModeRef.current || suppressNextPressRef.current) {
                  suppressNextPressRef.current = false;
                  return;
                }
                onCollapsedPress?.();
              }}
              style={({ pressed }) => [styles.collapsedButton, scrubMode && styles.collapsedButtonScrubbing, pressed && styles.navItemPressed]}
            >
              <View style={styles.collapsedSideDeck} pointerEvents="none">
                {visibleLeftItems.map((item, index) => {
                  const highlighted = scrubCandidateKey === item.key;
                  return (
                    <View
                      key={item.key}
                      style={[
                        styles.collapsedDeckItem,
                        { transform: [{ translateX: Math.max(-18, -6 * (visibleLeftItems.length - index)) }, { scale: highlighted ? 1.16 : 1 }] },
                      ]}
                    >
                      <Text style={[styles.collapsedDeckEmoji, highlighted && styles.collapsedDeckEmojiHighlighted]}>
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
                <Text style={styles.collapsedActiveEmoji}>{activeItem?.emoji ?? '•'}</Text>
                <AppText variant="captionBold" tone="primary" numberOfLines={1} style={styles.collapsedActiveLabel}>
                  {activeItem?.label ?? 'Menu'}
                </AppText>
              </View>
              <View style={styles.collapsedSideDeck} pointerEvents="none">
                {visibleRightItems.map((item, index) => {
                  const highlighted = scrubCandidateKey === item.key;
                  return (
                    <View
                      key={item.key}
                      style={[
                        styles.collapsedDeckItem,
                        { transform: [{ translateX: Math.min(18, 6 * (index + 1)) }, { scale: highlighted ? 1.16 : 1 }] },
                      ]}
                    >
                      <Text style={[styles.collapsedDeckEmoji, highlighted && styles.collapsedDeckEmojiHighlighted]}>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  collapsedButtonScrubbing: {
    opacity: 0.98,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minWidth: 36,
    flexShrink: 1,
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
  collapsedDeckEmojiHighlighted: {
    opacity: 1,
    fontSize: 15,
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
