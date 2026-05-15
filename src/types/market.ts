import type { CatalogEntityType } from '@/src/features/catalog/catalogDomain';

export type MarketMediaType = 'POST_IMAGE' | 'POST_VIDEO' | string;

export type FeedMediaAsset = {
  id: string;
  fileId: string | null;
  type: 'IMAGE' | 'VIDEO';
  displayUrl: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  blurHash: string | null;
  dominantColor: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number;
  status: 'READY';
  orderIndex: number;
};

export type MarketFeedBrand = {
  id: string;
  name: string;
  username: string | null;
  avatar: FeedMediaAsset | null;
};

export type MarketFeedStats = {
  likes: number;
  comments: number;
  threads: number;
  patches?: number;
};

export type MarketFeedViewerState = {
  isLiked: boolean;
  isThreaded: boolean;
  isPatched?: boolean;
  canBag?: boolean;
  isBagged?: boolean;
};

export type MarketMedia = {
  fileId: string;
  url?: string | null;
  previewUrl?: string | null;
  type: MarketMediaType;
  aspectRatio?: number | null;
  createdAt?: string | null;
};

export type MarketItem = {
  id: string;
  entityType: CatalogEntityType;
  collectionId: string;
  sourceType?: 'DESIGN' | 'STORE_COLLECTION' | 'COLLECTION_MEDIA';
  title?: string;
  description?: string | null;
  brand?: MarketFeedBrand;
  primaryMedia?: FeedMediaAsset;
  mediaItems?: FeedMediaAsset[];
  stats?: MarketFeedStats;
  viewerState?: MarketFeedViewerState;
  createdAt?: string;
  updatedAt?: string;
  collectionTitle: string;
  collectionDescription?: string | null;
  brandId: string;
  brandName?: string | null;
  username?: string | null;
  brandLogo?: string | null;
  brandLogoFileId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  saleMinPrice?: number | null;
  saleMaxPrice?: number | null;
  saleStartAt?: string | null;
  saleEndAt?: string | null;
  threadsCount?: number | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  combinedCommentsCount?: number | null;
  patchesCount?: number | null;
  tags: string[];
  media: MarketMedia;
  isLiked?: boolean;
  isThreaded?: boolean;
};

export type MarketFeedResponse = {
  items: MarketItem[];
  hasNextPage: boolean;
  nextCursor?: string | null;
};
