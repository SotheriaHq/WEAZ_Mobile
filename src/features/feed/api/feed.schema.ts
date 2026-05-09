import type { MarketItem } from '@/src/types/market';

const trim = (value?: string | null) => (typeof value === 'string' ? value.trim() : '');

const isUsableHttpUrl = (value?: string | null) => {
  const url = trim(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

export const isDisplayReadyFeedItem = (item: MarketItem | null | undefined) => {
  if (!item?.id || !item.collectionId) return false;
  const primary = item.primaryMedia;
  if (primary) {
    return primary.status === 'READY' && isUsableHttpUrl(primary.displayUrl);
  }
  return isUsableHttpUrl(item.media?.url);
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
