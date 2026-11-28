import React, { memo, useCallback } from 'react';

import { UnifiedProductCard } from '@/components/commerce/UnifiedProductCard';
import { BAG_IT_LABEL } from '@/src/constants/bagging';
import { clipAccessibilityLabel } from '@/src/constants/clipping';
import {
  BrandTile,
  CategoryTile,
  CollectionShelfCard,
} from '@/src/features/market/components/MarketEntityCards';
import { prefetchMedia } from '@/src/prefetch/navPrefetch';

import {
  isMarketV2Buyable,
  isMarketV2SoldOut,
  marketV2ImageCacheKey,
  marketV2PriceLabel,
  type MarketV2Item,
} from '../marketV2Contract';
import { formatMarketV2Price } from '../marketV2Runtime';

/**
 * Everything a card needs from its screen. One object, built once per screen
 * render, so a rail does not take a dozen props it only passes through.
 */
export type MarketV2CardContext = {
  isClipped: (item: MarketV2Item) => boolean;
  busy: Record<string, true>;
  /** Brand accounts sell; they never bag (the button stays, disabled). */
  canBag: boolean;
  /** The brand viewing its own pieces has nothing to clip. */
  ownBrandId: string | null;
  /** Saved cards whose picture addresses expired wait for the refresh. */
  mediaPending: boolean;
  onOpen: (item: MarketV2Item, position: number, rowKey: string) => void;
  onBag: (item: MarketV2Item) => void;
  onClip: (item: MarketV2Item, clipped: boolean) => void;
};

const formatPrice = (amount: number, currency: string) => formatMarketV2Price(amount, currency) || null;

const piecesLabel = (count: number | null) =>
  typeof count === 'number' && count > 0 ? `${count} ${count === 1 ? 'piece' : 'pieces'}` : null;

const mediaSource = (item: MarketV2Item) => item.media?.thumbnailUrl ?? item.media?.url ?? null;

type CardProps = {
  item: MarketV2Item;
  position: number;
  /** The section (or list) the card was shown in, for the open signal. */
  rowKey: string;
  width: number;
  /** Photo height for products and designs; the card's own frame otherwise. */
  height?: number;
  wrapTitle?: boolean;
  context: MarketV2CardContext;
};

/** A product or a Runway design: the one product card, with Bag It and Clip. */
const MarketV2PieceCard = memo(function MarketV2PieceCard({ item, position, rowKey, width, height, wrapTitle, context }: CardProps) {
  const { onOpen, onBag, onClip, isClipped, busy, canBag, ownBrandId, mediaPending } = context;
  const clipped = isClipped(item);
  const soldOut = isMarketV2SoldOut(item);
  const buyable = isMarketV2Buyable(item);
  const ownPiece = Boolean(ownBrandId && item.brand?.id === ownBrandId);
  const src = mediaSource(item);
  const pending = mediaPending && !src;
  const open = useCallback(() => onOpen(item, position, rowKey), [item, onOpen, position, rowKey]);
  const bag = useCallback(() => onBag(item), [item, onBag]);
  const clip = useCallback(() => onClip(item, clipped), [clipped, item, onClip]);
  const warm = useCallback(() => prefetchMedia({ src, fileId: item.media?.fileId ?? null }, 'tap'), [item.media?.fileId, src]);

  return (
    <UnifiedProductCard
      width={width}
      height={height}
      title={item.title}
      brandName={item.brand?.name ?? null}
      priceLabel={marketV2PriceLabel(item, formatPrice) ?? (item.entityType === 'DESIGN' ? 'Made to order' : null)}
      customOrder={Boolean(item.availability?.customOrderEnabled)}
      mediaSrc={pending ? null : src}
      mediaFileId={item.media?.fileId ?? null}
      mediaPending={pending}
      imageCacheKey={marketV2ImageCacheKey(item.media)}
      wrapTitle={wrapTitle}
      newDropItemId={item.entityType === 'PRODUCT' ? item.id : undefined}
      newDropCreatedAt={item.createdAt}
      analyticsSourceScreen="market"
      feedPosition={position}
      unavailable={soldOut}
      favorite={clipped}
      favoriteBusy={Boolean(busy[`clip:${item.entityType}:${item.id}`])}
      favoriteAccessibilityLabel={clipAccessibilityLabel(clipped)}
      actionLabel={buyable ? BAG_IT_LABEL : undefined}
      actionBusy={Boolean(busy[`bag:${item.entityType}:${item.id}`])}
      actionDisabled={!canBag || soldOut}
      onPressIn={warm}
      onPress={open}
      onActionPress={buyable ? bag : undefined}
      onFavoritePress={ownPiece ? undefined : clip}
    />
  );
});

/** Any Market card, in the shape that suits what it is. */
export const MarketV2Card = memo(function MarketV2Card(props: CardProps) {
  const { item, position, rowKey, width, context } = props;
  const open = useCallback(() => context.onOpen(item, position, rowKey), [context, item, position, rowKey]);
  if (item.entityType === 'PRODUCT' || item.entityType === 'DESIGN') return <MarketV2PieceCard {...props} />;
  const cover = { src: mediaSource(item), fileId: item.media?.fileId ?? null };
  if (item.entityType === 'COLLECTION') {
    const pieces = piecesLabel(item.stats.products);
    return (
      <CollectionShelfCard
        width={width}
        title={item.title}
        facts={[item.brand?.name ?? item.subtitle, pieces].filter(Boolean).join(' · ')}
        priceLabel={marketV2PriceLabel(item, formatPrice)}
        piecesLabel={pieces}
        covers={[cover]}
        onPress={open}
      />
    );
  }
  if (item.entityType === 'BRAND') {
    return (
      <BrandTile
        width={width}
        name={item.brand?.name ?? item.title}
        logo={{ src: item.brand?.logoUrl ?? cover.src, fileId: cover.fileId }}
        piecesLabel={piecesLabel(item.stats.products)}
        onPress={open}
      />
    );
  }
  return <CategoryTile width={width} title={item.title} cover={cover} onPress={open} />;
});
