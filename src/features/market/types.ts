import type { StoreProduct } from '@/src/api/StoreApi';
import type { MarketItem } from '@/src/types/market';

export type MarketSortKey = 'newest' | 'popular' | 'price_asc' | 'price_desc';
export type MarketAvailabilityKey = 'all' | 'in_stock' | 'custom_ready';

export type MarketContentItem =
  | {
      key: string;
      entityType: 'PRODUCT';
      kind: 'product';
      product: StoreProduct;
    }
  | {
      key: string;
      entityType: 'DESIGN';
      kind: 'design';
      design: MarketItem;
    };

export type MarketFilters = {
  category: string | null;
  brand: string | null;
  minPrice: string;
  maxPrice: string;
  availability: MarketAvailabilityKey;
  sort: MarketSortKey;
};
