import type { StoreProduct } from '@/src/api/StoreApi';
import type { MarketItem } from '@/src/types/market';

export const DEFAULT_MARKET_FILTERS = {
  category: null,
  brand: null,
  minPrice: '',
  maxPrice: '',
  availability: 'all' as const,
  sort: 'newest' as const,
};

export function formatMarketPrice(value?: number | null, currency = 'NGN') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `NGN ${Math.round(value).toLocaleString('en-NG')}`;
  }
}

export function getProductDisplayPrice(product: StoreProduct) {
  const price = product.effectivePrice ?? product.salePrice ?? product.price;
  return formatMarketPrice(price, product.currency) ?? 'Price on request';
}

export function getDesignDisplayPrice(design: MarketItem) {
  const min = typeof design.saleMinPrice === 'number' ? design.saleMinPrice : design.minPrice;
  const max = typeof design.saleMaxPrice === 'number' ? design.saleMaxPrice : design.maxPrice;
  if (typeof min === 'number' && typeof max === 'number') {
    if (min === max) return formatMarketPrice(min) ?? 'Price on request';
    return `${formatMarketPrice(min) ?? 'From'} - ${formatMarketPrice(max) ?? 'custom'}`;
  }
  if (typeof min === 'number') return `From ${formatMarketPrice(min)}`;
  if (typeof max === 'number') return `Up to ${formatMarketPrice(max)}`;
  return 'Custom quote';
}

export function normalizeOption(value?: string | null) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

export function parsePriceFilter(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function productStock(product: StoreProduct) {
  const variantStock = product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  return Math.max(product.stock ?? 0, variantStock);
}
