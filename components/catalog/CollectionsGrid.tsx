/**
 * CollectionsGrid - Mobile
 * Grid display for collections with masonry-like layout
 */

import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { CollectionCardSkeleton } from './CollectionCard';
import { CatalogEntityCard } from './CatalogEntityCard';
import type { CollectionDto } from '@/src/api/BrandApi';
import { tokens } from '@/src/styles/tokens';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CollectionsGridProps {
  collections: CollectionDto[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onCollectionPress?: (collection: CollectionDto) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onLike?: (id: string) => void;
  onComment?: (id: string) => void;
  onShare?: (id: string) => void;
  isOwner?: boolean;
  showDrafts?: boolean;
  emptyComponent?: React.ReactNode;
  numColumns?: number;
  containerWidth?: number;
}

const GRID_LAYOUT = {
  screenPadding: tokens.spacing.lg,
  columnGap: tokens.spacing.md,
  rowGap: tokens.spacing.md,
  verticalPadding: tokens.spacing.lg,
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export const CollectionsGrid = React.memo(function CollectionsGrid({
  collections,
  isLoading = false,
  isRefreshing = false,
  onRefresh,
  onEndReached,
  onCollectionPress,
  onEdit,
  onDelete,
  onLike,
  onComment,
  onShare,
  isOwner = false,
  showDrafts = false,
  emptyComponent,
  numColumns = 2,
  containerWidth,
}: CollectionsGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const measuredWidth = containerWidth && containerWidth > 0 ? containerWidth : screenWidth;
  
  const screenPadding = GRID_LAYOUT.screenPadding;
  const columnGap = GRID_LAYOUT.columnGap;
  const rowGap = GRID_LAYOUT.rowGap;
  const cardWidth = useMemo(() => {
    const totalColumnGap = columnGap * Math.max(0, numColumns - 1);
    const availableWidth = measuredWidth - screenPadding * 2 - totalColumnGap;
    return availableWidth / numColumns;
  }, [columnGap, measuredWidth, numColumns, screenPadding]);

  const renderItem = useCallback(
    ({ item, index }: { item: CollectionDto; index: number }) => {
      const isDraft = item.status === 'DRAFT' || showDrafts;

      return (
        <View style={[styles.cardWrapper, { width: cardWidth }]}>
          <CatalogEntityCard
            collection={item}
            cardWidth={cardWidth}
            isDraft={isDraft}
            isOwner={isOwner}
            onPress={() => onCollectionPress?.(item)}
            onEdit={onEdit}
            onDelete={onDelete}
            onLike={onLike}
            onComment={onComment}
            onShare={onShare}
          />
        </View>
      );
    },
    [cardWidth, isOwner, onCollectionPress, onComment, onDelete, onEdit, onLike, onShare, showDrafts],
  );

  const keyExtractor = useCallback((item: CollectionDto) => item.id, []);

  // Loading skeleton
  if (isLoading && collections.length === 0) {
    return (
      <View
        style={[
          styles.skeletonGrid,
          {
            paddingHorizontal: screenPadding,
            paddingVertical: GRID_LAYOUT.verticalPadding,
            gap: columnGap,
          },
        ]}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <CollectionCardSkeleton key={i} width={cardWidth} />
        ))}
      </View>
    );
  }

  // Empty state
  if (!isLoading && collections.length === 0 && emptyComponent) {
    return <>{emptyComponent}</>;
  }

  return (
    <FlatList
      data={collections}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={numColumns}
      scrollEnabled={false}
      contentContainerStyle={[
        styles.grid,
        {
          paddingHorizontal: screenPadding,
          paddingVertical: GRID_LAYOUT.verticalPadding,
        },
      ]}
      columnWrapperStyle={numColumns > 1 ? [styles.row, { gap: columnGap, marginBottom: rowGap }] : undefined}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        ) : undefined
      }
    />
  );
});

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  grid: {
  },
  row: {
  },
  cardWrapper: {
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

export default CollectionsGrid;
