import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

/**
 * A card grid whose height stops growing.
 *
 * The Catalogue's Content and Shop tabs drew every card in a two-column wrap,
 * so the profile got one row taller per two cards — a brand with 50 pieces
 * had a 25-row screen (owner, Nov 2026: "we don't want very very long
 * screens"). Up to `inlineAfter` cards keep the grid. Beyond that the cards
 * become a fixed two-row strip that scrolls sideways, the same inline rule as
 * Market: the screen is as tall for 50 cards as for 5.
 *
 *  - Columns are a little narrower than the grid's so the next one peeks in:
 *    the edge is the cue that there is more, with no scrollbar drawn.
 *  - Snaps per column; no indicator, no overscroll glow.
 *  - Virtualized (FlatList): 50 cards cost about what 6 do.
 *  - A fixed height also means the strip can never feed the Catalogue pager's
 *    measure-then-resize loop (see BagItButton.tsx).
 */
export type InlineCardGridProps<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderCard: (item: T, width: number) => React.ReactNode;
  /** The card width the two-column grid uses. */
  gridCardWidth: number;
  sidePadding: number;
  columnGap: number;
  rowGap: number;
  /** Cards stacked per column in the strip. */
  rows?: number;
  /** Above this many cards the grid becomes the strip. */
  inlineAfter?: number;
  /** Card width in the strip as a share of the grid's (the peek). */
  inlineWidthRatio?: number;
  paddingVertical?: number;
  accessibilityLabel?: string;
};

export function shouldUseInlineStrip(count: number, inlineAfter = 4): boolean {
  return count > inlineAfter;
}

export function chunkIntoColumns<T>(items: readonly T[], rows: number): T[][] {
  const columns: T[][] = [];
  for (let index = 0; index < items.length; index += rows) {
    columns.push(items.slice(index, index + rows));
  }
  return columns;
}

export function InlineCardGrid<T>({
  items,
  keyOf,
  renderCard,
  gridCardWidth,
  sidePadding,
  columnGap,
  rowGap,
  rows = 2,
  inlineAfter = 4,
  inlineWidthRatio = 0.86,
  paddingVertical = 0,
  accessibilityLabel,
}: InlineCardGridProps<T>) {
  const inline = shouldUseInlineStrip(items.length, inlineAfter);
  const inlineWidth = Math.floor(gridCardWidth * inlineWidthRatio);
  const columns = useMemo(() => (inline ? chunkIntoColumns(items, rows) : []), [inline, items, rows]);
  const interval = inlineWidth + columnGap;

  const renderColumn = useCallback(
    ({ item: column }: ListRenderItemInfo<T[]>) => (
      <View style={[styles.column, { width: inlineWidth, gap: rowGap }]}>
        {column.map((card) => (
          <React.Fragment key={keyOf(card)}>{renderCard(card, inlineWidth)}</React.Fragment>
        ))}
      </View>
    ),
    [inlineWidth, keyOf, renderCard, rowGap],
  );

  if (!inline) {
    return (
      <View
        style={[
          styles.grid,
          { paddingHorizontal: sidePadding, paddingVertical, gap: columnGap, rowGap },
        ]}
      >
        {items.map((card) => (
          <React.Fragment key={keyOf(card)}>{renderCard(card, gridCardWidth)}</React.Fragment>
        ))}
      </View>
    );
  }

  return (
    <FlatList
      horizontal
      data={columns}
      keyExtractor={(column, index) => (column[0] ? keyOf(column[0]) : `column-${index}`)}
      renderItem={renderColumn}
      accessibilityLabel={accessibilityLabel}
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      decelerationRate="fast"
      snapToInterval={interval}
      snapToAlignment="start"
      disableIntervalMomentum
      nestedScrollEnabled
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      contentContainerStyle={{ paddingHorizontal: sidePadding, paddingVertical, gap: columnGap }}
      getItemLayout={(_, index) => ({ length: interval, offset: sidePadding + interval * index, index })}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  column: {
    flexDirection: 'column',
  },
});
