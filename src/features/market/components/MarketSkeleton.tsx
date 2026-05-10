import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export function MarketSkeleton() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const gap = tokens.spacing.sm;
  const side = tokens.spacing.md;
  const columnCount = width >= 620 ? 4 : width >= 330 ? 3 : 2;
  const cardWidth = Math.floor((width - side * 2 - gap * (columnCount - 1)) / columnCount);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.header}>
        <Skeleton width={112} height={30} borderRadius={8} />
        <View style={styles.headerActions}>
          <Skeleton width={44} height={44} borderRadius={tokens.radius.md} />
          <Skeleton width={44} height={44} borderRadius={tokens.radius.md} />
        </View>
      </View>
      <Skeleton width="100%" height={52} borderRadius={16} />
      <View style={styles.chips}>
        <Skeleton width={58} height={36} borderRadius={999} />
        <Skeleton width={112} height={36} borderRadius={999} />
        <Skeleton width={92} height={36} borderRadius={999} />
      </View>
      <View style={styles.hero}>
        <Skeleton width={140} height={20} borderRadius={6} />
        <SkeletonText lines={2} lineHeight={14} spacing={8} lastLineWidth="58%" />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 9 }).map((_, index) => (
          <View key={index} style={[styles.card, { width: cardWidth, backgroundColor: theme.colors.surface }]}>
            <Skeleton width="100%" height={Math.round(cardWidth / 0.82)} borderRadius={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  hero: {
    borderRadius: tokens.radius.lg,
    gap: tokens.spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  card: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
});
