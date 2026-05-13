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
import { CollectionCard, CollectionCardSkeleton } from './CollectionCard';
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
}

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
}: CollectionsGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  
  const cardWidth = useMemo(
    () => (screenWidth - 16 * 2 - 12 * (numColumns - 1)) / numColumns,
    [numColumns, screenWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CollectionDto; index: number }) => {
      const isDraft = item.status === 'DRAFT' || showDrafts;

      return (
        <View style={[styles.cardWrapper, { marginLeft: index % numColumns === 0 ? 0 : 12 }]}>
          <CollectionCard
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
    [cardWidth, isOwner, numColumns, onCollectionPress, onComment, onDelete, onEdit, onLike, onShare, showDrafts],
  );

  const keyExtractor = useCallback((item: CollectionDto) => item.id, []);

  // Loading skeleton
  if (isLoading && collections.length === 0) {
    return (
      <View style={styles.skeletonGrid}>
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
      contentContainerStyle={styles.grid}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
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
    padding: 16,
    paddingBottom: tokens.spacing.xl,
  },
  row: {
    marginBottom: 12,
  },
  cardWrapper: {
    flex: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
});

export default CollectionsGrid;
