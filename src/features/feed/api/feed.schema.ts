import type { MarketItem } from '@/src/types/market';

const trim = (value?: string | null) => (typeof value === 'string' ? value.trim() : '');

export const isDisplayReadyFeedItem = (item: MarketItem | null | undefined) => {
  if (!item?.id || !item.collectionId) return false;
  const primary = item.primaryMedia;
  if (primary) {
    return primary.status === 'READY' && Boolean(trim(primary.displayUrl));
  }
  return Boolean(trim(item.media?.url));
};

export const sanitizeFeedItems = (items: MarketItem[]) => {
  const seen = new Set<string>();
  const next: MarketItem[] = [];

  items.forEach((item) => {
    if (!isDisplayReadyFeedItem(item)) return;
    const key = item.collectionId || item.id;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });

  return next;
};
