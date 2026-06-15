/**
 * Tabs - Mobile
 * Tab navigation component with smooth underline animation.
 * The underline initialises immediately on first layout (no flicker),
 * then transitions with spring-eased timing on subsequent changes.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/src/theme/ThemeProvider';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Tab {
  key: string;
  label: string;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  scrollable?: boolean;
  swipeProgress?: SharedValue<number>;
}

// ─────────────────────────────────────────────────────────────
// TabItem Component
// ─────────────────────────────────────────────────────────────

interface TabItemProps {
  tab: Tab;
  tabIndex: number;
  activeTab: string;
  swipeProgress?: SharedValue<number>;
  handlePress: (key: string) => void;
  handleTabLayout: (key: string, x: number, width: number) => void;
  scrollable: boolean;
  theme: any;
}

function TabItem({ tab, tabIndex, activeTab, swipeProgress, handlePress, handleTabLayout, scrollable, theme }: TabItemProps) {
  const isActiveReact = tab.key === activeTab;

  const animatedLabelStyle = useAnimatedStyle(() => {
    let isActive = false;
    if (swipeProgress) {
      isActive = Math.round(swipeProgress.value) === tabIndex;
    } else {
      isActive = tab.key === activeTab;
    }

    return {
      fontFamily: isActive ? tokens.fontFamily.bold : tokens.fontFamily.medium,
      color: isActive ? theme.colors.primary : theme.colors.textMuted,
    };
  }, [activeTab, swipeProgress, tab.key, tabIndex, theme]);

  return (
    <Pressable
      key={tab.key}
      onPress={() => handlePress(tab.key)}
      onLayout={(e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        handleTabLayout(tab.key, x, width);
      }}
      style={({ pressed }) => [
        styles.tab,
        scrollable ? styles.tabScrollable : styles.tabFixed,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActiveReact }}
    >
      <Animated.Text
        style={[
          styles.tabLabel,
          { fontSize: tokens.typography.caption.size, lineHeight: tokens.typography.caption.lineHeight },
          animatedLabelStyle,
        ]}
      >
        {tab.label}
      </Animated.Text>

      {typeof tab.badge === 'number' && tab.badge > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <AppText variant="caption" tone="inverse" style={styles.badgeText}>
            {tab.badge > 99 ? '99+' : tab.badge}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export function Tabs({ tabs, activeTab, onTabChange, scrollable = false, swipeProgress }: TabsProps) {
  const { theme } = useTheme();

  // Mutable ref stores each tab's measured position/width.
  // Using ref (not state) prevents layout-triggered re-renders.
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});

  const underlineX = useSharedValue(-999);
  const underlineW = useSharedValue(0);
  const indicatorLayouts = useSharedValue<Array<{ x: number; width: number }>>([]);
  const initialised = useRef(false);

  const syncIndicatorLayouts = useCallback(() => {
    const next = tabs.map((tab) => tabLayouts.current[tab.key]);
    if (next.some((layout) => !layout)) return;
    indicatorLayouts.value = next as Array<{ x: number; width: number }>;
  }, [indicatorLayouts, tabs]);

  // Called when any tab is measured. If this is the active tab, snap or slide.
  const handleTabLayout = useCallback(
    (key: string, x: number, width: number) => {
      tabLayouts.current[key] = { x, width };
      syncIndicatorLayouts();

      if (key !== activeTab) return;

      if (!initialised.current) {
        // First paint: snap, no animation
        underlineX.value = x;
        underlineW.value = width;
        initialised.current = true;
      } else {
        underlineX.value = withTiming(x, { duration: 200, easing: Easing.out(Easing.cubic) });
        underlineW.value = withTiming(width, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    },
    [activeTab, syncIndicatorLayouts, underlineX, underlineW],
  );

  // Animate underline when the active tab key changes.
  const handlePress = useCallback(
    (key: string) => {
      onTabChange(key);
      const layout = tabLayouts.current[key];
      if (layout) {
        underlineX.value = withTiming(layout.x, { duration: 200, easing: Easing.out(Easing.cubic) });
        underlineW.value = withTiming(layout.width, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    },
    [onTabChange, underlineX, underlineW],
  );

  useEffect(() => {
    const layout = tabLayouts.current[activeTab];
    if (!layout) return;
    if (!initialised.current) {
      underlineX.value = layout.x;
      underlineW.value = layout.width;
      initialised.current = true;
      return;
    }
    underlineX.value = withTiming(layout.x, { duration: 200, easing: Easing.out(Easing.cubic) });
    underlineW.value = withTiming(layout.width, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [activeTab, underlineX, underlineW]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          swipeProgress && indicatorLayouts.value.length === tabs.length
            ? interpolate(
                swipeProgress.value,
                indicatorLayouts.value.map((_, index) => index),
                indicatorLayouts.value.map((layout) => layout.x),
                Extrapolation.CLAMP,
              )
            : underlineX.value,
      },
    ],
    width:
      swipeProgress && indicatorLayouts.value.length === tabs.length
        ? interpolate(
            swipeProgress.value,
            indicatorLayouts.value.map((_, index) => index),
            indicatorLayouts.value.map((layout) => layout.width),
            Extrapolation.CLAMP,
          )
        : underlineW.value,
  }));

  const TabContainer = scrollable ? ScrollView : View;
  const containerProps: any = scrollable
    ? { horizontal: true, showsHorizontalScrollIndicator: false, contentContainerStyle: styles.scrollContent }
    : { style: styles.tabsContainer };

  return (
    <View style={[styles.container, { borderBottomColor: theme.colors.border }]}>
      <TabContainer {...containerProps}>
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.key}
            tab={tab}
            tabIndex={index}
            activeTab={activeTab}
            swipeProgress={swipeProgress}
            handlePress={handlePress}
            handleTabLayout={handleTabLayout}
            scrollable={scrollable}
            theme={theme}
          />
        ))}
      </TabContainer>

      {/* Animated underline — primary accent */}
      <Animated.View
        style={[styles.underline, { backgroundColor: theme.colors.primary }, underlineStyle]}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderBottomWidth: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
  },
  scrollContent: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  // Equal-width when inside a non-scrollable container
  tabFixed: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  // Auto-width in scrollable mode
  tabScrollable: {
    paddingHorizontal: tokens.spacing.lg,
  },
  tabLabel: {
    textAlign: 'center',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    letterSpacing: 0.1,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    left: 0,
  },
});

export default Tabs;
