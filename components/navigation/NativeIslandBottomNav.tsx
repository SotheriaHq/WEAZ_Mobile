import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
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

  return { bottomOffset, sideOffset };
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

export function NativeIslandBottomNav({ items, onSelect, onPressIn }: NativeIslandBottomNavProps) {
  const { scheme, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { bottomOffset, sideOffset } = getNativeIslandLayout(windowWidth, insets.bottom);
  const compact = items.length >= 6 || windowWidth < 380;
  React.useEffect(() => {
    navDevLog('island-items', {
      keys: items.map((item) => item.key),
      labels: items.map((item) => item.label),
      compact,
      width: windowWidth,
      activeKey: items.find((item) => item.active)?.key ?? null,
    });
  }, [compact, items, windowWidth]);
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
          style={StyleSheet.absoluteFillObject}
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
  },
  navItems: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: NATIVE_ISLAND_NAV.horizontalPadding,
    overflow: 'hidden',
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
