import type React from 'react';

import type { MarketItem } from '@/src/types/market';

export type FeedViewerMedia = {
  id: string;
  collectionId: string;
  mediaIndex: number;
  url: string;
  displayUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  fileId: string | null;
  type: 'image' | 'video';
  label: string;
  threadsCount: number;
  orderIndex?: number | null;
  blurHash?: string | null;
  dominantColor?: string | null;
};

export type FeedCarouselMedia = FeedViewerMedia & {
  virtualKey: string;
};

export type FeedListEntry = {
  item: MarketItem;
  listKey: string;
  realIndex: number;
  isGhost: boolean;
};

export type FeedRenderItem = ({ item }: { item: FeedListEntry }) => React.ReactElement | null;
