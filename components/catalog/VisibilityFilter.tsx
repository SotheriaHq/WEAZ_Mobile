/**
 * VisibilityFilter - Mobile
 * Filter chips for collection visibility (Public/Private/Drafts)
 */

import React from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type VisibilityOption = 'Public' | 'Private' | 'Drafts';

interface VisibilityFilterProps {
  selected: VisibilityOption;
  onChange: (value: VisibilityOption) => void;
  showDrafts?: boolean;
  draftsCount?: number;
}

// ─────────────────────────────────────────────────────────────
// Filter Chip
// ─────────────────────────────────────────────────────────────

interface FilterChipProps {
  label: string;
  icon: string;
  isActive: boolean;
  onPress: () => void;
  badge?: number;
}

const FilterChip = ({ label, icon, isActive, onPress, badge }: FilterChipProps) => {
  const { theme } = useTheme();
  const scale = React.useRef(new Animated.Value(1)).current;
  const animatePress = React.useCallback(
    (toValue: number, duration: number) => {
      Animated.timing(scale, {
        toValue,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animatePress(0.96, 90)}
        onPressOut={() => animatePress(1, 140)}
        style={[
          styles.chip,
          {
            backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceAlt,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <AppText variant={isActive ? 'captionBold' : 'captionRegular'} tone={isActive ? 'inverse' : 'muted'}>
          {icon} {label}
        </AppText>
        {typeof badge === 'number' && badge > 0 && (
          <View style={[styles.badge, { backgroundColor: isActive ? theme.colors.onPrimary : theme.colors.primary }]}>
            <AppText variant="captionBold" tone={isActive ? 'primary' : 'inverse'}>
              {badge}
            </AppText>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export function VisibilityFilter({
  selected,
  onChange,
  showDrafts = false,
  draftsCount = 0,
}: VisibilityFilterProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <FilterChip
        label="Public"
        icon="🌐"
        isActive={selected === 'Public'}
        onPress={() => onChange('Public')}
      />
      <FilterChip
        label="Private"
        icon="🔒"
        isActive={selected === 'Private'}
        onPress={() => onChange('Private')}
      />
      {showDrafts && (
        <FilterChip
          label="Drafts"
          icon="📝"
          isActive={selected === 'Drafts'}
          onPress={() => onChange('Drafts')}
          badge={draftsCount}
        />
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    minHeight: 36,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default VisibilityFilter;
