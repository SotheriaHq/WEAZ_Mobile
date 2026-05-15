import React from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type VisibilityOption = 'Public' | 'Private' | 'Drafts';

interface VisibilityFilterProps {
  selected: VisibilityOption;
  onChange: (value: VisibilityOption) => void;
  showDrafts?: boolean;
  draftsCount?: number;
}

interface SegmentProps {
  label: VisibilityOption;
  isActive: boolean;
  onPress: () => void;
  badge?: number;
}

function VisibilitySegment({ label, isActive, onPress, badge }: SegmentProps) {
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
          styles.segment,
          {
            backgroundColor: isActive ? theme.colors.surface : 'transparent',
            borderColor: isActive ? theme.colors.border : 'transparent',
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <AppText
          variant={isActive ? 'captionBold' : 'captionRegular'}
          tone={isActive ? 'default' : 'muted'}
          numberOfLines={1}
        >
          {label}
        </AppText>
        {typeof badge === 'number' && badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: isActive ? theme.colors.primary : theme.colors.surface }]}>
            <AppText variant="captionBold" tone={isActive ? 'inverse' : 'primary'} numberOfLines={1}>
              {badge > 99 ? '99+' : badge}
            </AppText>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function VisibilityFilter({
  selected,
  onChange,
  showDrafts = false,
  draftsCount = 0,
}: VisibilityFilterProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.outer}>
      <View style={[styles.container, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
        <VisibilitySegment
          label="Public"
          isActive={selected === 'Public'}
          onPress={() => onChange('Public')}
        />
        <VisibilitySegment
          label="Private"
          isActive={selected === 'Private'}
          onPress={() => onChange('Private')}
        />
        {showDrafts ? (
          <VisibilitySegment
            label="Drafts"
            isActive={selected === 'Drafts'}
            onPress={() => onChange('Drafts')}
            badge={draftsCount}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
  },
  container: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.xs,
  },
  segment: {
    minHeight: 32,
    minWidth: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.sm,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default VisibilityFilter;
