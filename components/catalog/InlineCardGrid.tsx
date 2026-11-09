import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View, type LayoutChangeEvent, type ListRenderItemInfo } from 'react-native';

/**
 * A two-column card grid whose height stops growing.
 *
 * The Catalogue's Content and Shop tabs drew every card in the page, so the
 * profile got one row taller per two cards — 50 pieces made a 25-row screen
 * (owner, Nov 2026: "the height is the most important issue"). Up to
 * `inlineAfter` cards the grid draws normally. Beyond that the grid keeps its
 * two cards per row but sits in a fixed-height area about two and a half rows
 * tall that scrolls UP AND DOWN inside itself. The half-visible row is the cue
 * that there is more; no scrollbar is drawn.
 *
 * (A sideways two-row strip was tried first and rejected: it put three cards
 * across the screen and made people scroll sideways.)
 *
 *  - Same card width as the grid: two per row, always.
 *  - Virtualized (FlatList): 50 cards cost about what 6 do.
 *  - Nested scrolling hands back to the page at the ends.
 *  - A fixed height also means it can never feed the Catalogue pager's
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
  /** Above this many cards the grid gets a fixed height and scrolls inside. */
  inlineAfter?: number;
  /** Rows visible in the capped area; a fraction leaves the next row peeking. */
  visibleRows?: number;
  /** Card height before the first card has been measured. */
  estimatedCardHeight?: number;
  paddingVertical?: number;
  accessibilityLabel?: string;
};

export function shouldCapGridHeight(count: number, inlineAfter = 4): boolean {
  return count > inlineAfter;
}

/** The capped area's height: whole rows plus the gaps between them, plus padding. */
export function cappedGridHeight(args: {
  cardHeight: number;
  rowGap: number;
  visibleRows: number;
  paddingVertical: number;
}): number {
  const { cardHeight, rowGap, visibleRows, paddingVertical } = args;
  return Math.round(cardHeight * visibleRows + rowGap * Math.floor(visibleRows) + paddingVertical);
}

export function InlineCardGrid<T>({
  items,
  keyOf,
  renderCard,
  gridCardWidth,
  sidePadding,
  columnGap,
  rowGap,
  inlineAfter = 4,
  visibleRows = 2.5,
  estimatedCardHeight,
  paddingVertical = 0,
  accessibilityLabel,
}: InlineCardGridProps<T>) {
  const capped = shouldCapGridHeight(items.length, inlineAfter);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const onFirstCardLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next > 0) setCardHeight((current) => (current === next ? current : next));
  }, []);

  const renderCell = useCallback(
    ({ item, index }: ListRenderItemInfo<T>) => (
      <View style={{ width: gridCardWidth }} onLayout={index === 0 ? onFirstCardLayout : undefined}>
        {renderCard(item, gridCardWidth)}
      </View>
    ),
    [gridCardWidth, onFirstCardLayout, renderCard],
  );

  if (!capped) {
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

  const height = cappedGridHeight({
    cardHeight: cardHeight ?? estimatedCardHeight ?? Math.round(gridCardWidth * 1.6),
    rowGap,
    visibleRows,
    paddingVertical,
  });

  return (
    <View style={{ height }}>
      <FlatList
        data={items as T[]}
        numColumns={2}
        keyExtractor={keyOf}
        renderItem={renderCell}
        accessibilityLabel={accessibilityLabel}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        nestedScrollEnabled
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        columnWrapperStyle={{ gap: columnGap }}
        contentContainerStyle={{ paddingHorizontal: sidePadding, paddingTop: paddingVertical / 2, paddingBottom: paddingVertical / 2, gap: rowGap }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
