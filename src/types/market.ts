export type MarketMediaType = 'POST_IMAGE' | 'POST_VIDEO' | string;

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
  collectionId: string;
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
