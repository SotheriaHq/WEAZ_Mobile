/**
 * CollectionsGrid - Mobile
 * Grid display for collections with masonry-like layout
 */

import React, { useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { CollectionCardSkeleton } from './CollectionCard';
import { CatalogEntityCard } from './CatalogEntityCard';
import type { CollectionDto } from '@/src/api/BrandApi';
import { tokens } from '@/src/styles/tokens';
import { useFrameBatchedItems } from '@/src/hooks/useFrameBatchedItems';

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
  onSave?: (collection: CollectionDto) => void;
  onClientRetry?: (collection: CollectionDto) => void;
  onClientDismiss?: (collection: CollectionDto) => void;
  savedById?: Record<string, boolean>;
  saveBusyById?: Record<string, boolean>;
  isOwner?: boolean;
  showDrafts?: boolean;
  emptyComponent?: React.ReactNode;
  numColumns?: number;
  initialRenderCount?: number;
  batchRenderCount?: number;
  renderKey?: string;
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
  onSave,
  onClientRetry,
  onClientDismiss,
  savedById,
  saveBusyById,
  isOwner = false,
  showDrafts = false,
  emptyComponent,
  numColumns,
  initialRenderCount = 6,
  batchRenderCount = 6,
  renderKey,
}: CollectionsGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  
  const screenPadding = GRID_LAYOUT.screenPadding;
  const columnGap = GRID_LAYOUT.columnGap;
  const resolvedNumColumns = useMemo(() => {
    // Phase 4 uses a balanced responsive grid; true uneven-column masonry should be a dedicated catalog layout pass.
    if (typeof numColumns === 'number' && numColumns > 0) return numColumns;
    if (screenWidth >= 1024) return 4;
    if (screenWidth >= 700) return 3;
    return 2;
  }, [numColumns, screenWidth]);
  const rowGap = GRID_LAYOUT.rowGap;
  const cardWidth = useMemo(() => {
    const totalColumnGap = columnGap * Math.max(0, resolvedNumColumns - 1);
    const availableWidth = screenWidth - screenPadding * 2 - totalColumnGap;
    return Math.floor(availableWidth / resolvedNumColumns);
  }, [columnGap, resolvedNumColumns, screenPadding, screenWidth]);
  const visibleCollections = useFrameBatchedItems(collections, {
    initialCount: initialRenderCount,
    batchCount: batchRenderCount,
    resetKey: renderKey ?? `${resolvedNumColumns}:${collections.length}`,
  });

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
            onPress={onCollectionPress}
            onEdit={onEdit}
            onDelete={onDelete}
            onLike={onLike}
            onComment={onComment}
            onShare={onShare}
            onSave={onSave}
            onClientRetry={onClientRetry}
            onClientDismiss={onClientDismiss}
            isSaved={Boolean(savedById?.[item.id])}
            saveBusy={Boolean(saveBusyById?.[item.id])}
          />
        </View>
      );
    },
    [cardWidth, isOwner, onClientDismiss, onClientRetry, onCollectionPress, onComment, onDelete, onEdit, onLike, onSave, onShare, saveBusyById, savedById, showDrafts],
  );

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
    <View
      style={[
        styles.grid,
        {
          paddingHorizontal: screenPadding,
          paddingVertical: GRID_LAYOUT.verticalPadding,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: columnGap,
          rowGap: rowGap,
        },
      ]}
    >
      {visibleCollections.map((item, index) => (
        <React.Fragment key={item.id}>
          {renderItem({ item, index })}
        </React.Fragment>
      ))}
    </View>
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
