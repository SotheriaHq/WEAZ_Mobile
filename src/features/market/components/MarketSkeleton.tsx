import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

const SIDE_PADDING = tokens.spacing.lg;
const CARD_GAP = tokens.spacing.md;

function getSkeletonColumns(width: number) {
  const availableWidth = width - SIDE_PADDING * 2;
  const threeColumnWidth = Math.floor((availableWidth - CARD_GAP * 2) / 3);
  return threeColumnWidth >= 168 ? 3 : 2;
}

export function MarketSkeleton({ bottomPadding = tokens.spacing.md }: { bottomPadding?: number }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const columnCount = getSkeletonColumns(width);
  const cardWidth = Math.floor((width - SIDE_PADDING * 2 - CARD_GAP * (columnCount - 1)) / columnCount);
  const heroHeight = Math.min(236, Math.max(176, Math.round(height * 0.24)));

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg, paddingBottom: bottomPadding }]}>
      <View style={styles.header}>
        <Skeleton width={44} height={44} borderRadius={tokens.radius.md} />
        <View style={styles.headerTitle}>
          <Skeleton width={118} height={26} borderRadius={tokens.radius.sm} />
          <Skeleton width={188} height={14} borderRadius={tokens.radius.sm} />
        </View>
        <Skeleton width={44} height={44} borderRadius={tokens.radius.md} />
      </View>

      <Skeleton width="100%" height={52} borderRadius={tokens.radius.lg} />

      <View style={styles.chips}>
        <Skeleton width={58} height={36} borderRadius={tokens.radius.full} />
        <Skeleton width={132} height={36} borderRadius={tokens.radius.full} />
        <Skeleton width={96} height={36} borderRadius={tokens.radius.full} />
      </View>

      <Skeleton width="100%" height={heroHeight} borderRadius={tokens.radius.lg} />

      <View style={styles.sectionHeader}>
        <Skeleton width={156} height={22} borderRadius={tokens.radius.sm} />
        <Skeleton width={52} height={14} borderRadius={tokens.radius.sm} />
      </View>

      <View style={styles.blazingRow}>
        <Skeleton width={176} height={62} borderRadius={tokens.radius.lg} />
        <Skeleton width={176} height={62} borderRadius={tokens.radius.lg} />
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.headerTitle}>
          <Skeleton width={152} height={22} borderRadius={tokens.radius.sm} />
          <Skeleton width={214} height={14} borderRadius={tokens.radius.sm} />
        </View>
        <Skeleton width={52} height={14} borderRadius={tokens.radius.sm} />
      </View>

      <View style={styles.horizontalRow}>
        <Skeleton width={Math.min(184, Math.max(150, Math.round(width * 0.42)))} height={230} borderRadius={tokens.radius.lg} />
        <Skeleton width={Math.min(184, Math.max(150, Math.round(width * 0.42)))} height={230} borderRadius={tokens.radius.lg} />
      </View>

      <View style={styles.sectionHeader}>
        <Skeleton width={132} height={22} borderRadius={tokens.radius.sm} />
      </View>

      <View style={styles.grid}>
        {Array.from({ length: columnCount * 2 }).map((_, index) => (
          <Skeleton
            key={index}
            width={cardWidth}
            height={Math.round(cardWidth * 1.58)}
            borderRadius={tokens.radius.lg}
          />
        ))}
      </View>

      <View style={styles.editorial}>
        <Skeleton width={108} height={24} borderRadius={tokens.radius.full} />
        <SkeletonText lines={2} lineHeight={18} spacing={8} lastLineWidth="58%" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: SIDE_PADDING,
    gap: tokens.spacing.md,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  blazingRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  horizontalRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  editorial: {
    minHeight: 148,
    borderRadius: tokens.radius.lg,
    gap: tokens.spacing.md,
    justifyContent: 'flex-end',
    padding: tokens.spacing.lg,
  },
});
