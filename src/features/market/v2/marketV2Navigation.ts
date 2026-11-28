import { drillDownPush } from '@/src/utils/mobileNavigation';
import { flushMarketSignals } from '@/src/services/marketSignals';
import { navPerf } from '@/src/utils/navPerf';

import {
  encodeMarketV2FilterParam,
  marketV2PriceLabel,
  type MarketV2Filters,
  type MarketV2Item,
  type MarketV2Sort,
} from './marketV2Contract';
import { formatMarketV2Price, trackMarketV2CardSignal, type MarketV2SignalContext } from './marketV2Runtime';

/** See All for a server section, carrying any filters the shopper applied. */
export function openMarketV2Section(sectionKey: string, filters: MarketV2Filters, sort: MarketV2Sort | null = null) {
  navPerf.tap('market→section');
  navPerf.navigationCalled();
  const encoded = encodeMarketV2FilterParam(filters);
  drillDownPush({
    pathname: '/market-section',
    params: { sectionKey, ...(encoded ? { filters: encoded } : {}), ...(sort ? { sort } : {}) },
  } as never);
}

/** The whole catalogue as a page, preset with filters (a category chip, a style tile). */
export function openMarketV2Catalogue(title: string, filters: MarketV2Filters) {
  navPerf.tap('market→section');
  navPerf.navigationCalled();
  drillDownPush({
    pathname: '/market-section',
    params: { catalogue: '1', title, filters: encodeMarketV2FilterParam(filters) },
  } as never);
}

/**
 * Open a card where it lives: a product page, the Runway design viewer, a
 * collection, a brand's catalogue, or a category page of the Market.
 */
export function openMarketV2Item(item: MarketV2Item, context: MarketV2SignalContext, position: number) {
  trackMarketV2CardSignal(item, 'OPEN', context, position);
  void flushMarketSignals();
  const id = item.target.id ?? item.id;
  switch (item.target.type) {
    case 'PRODUCT':
      drillDownPush({ pathname: '/products/[productId]', params: { productId: id } } as never);
      return;
    case 'DESIGN':
      drillDownPush({
        pathname: '/market-viewer',
        params: {
          sourceType: 'DESIGN',
          sourceId: id,
          brandId: item.brand?.id ?? undefined,
          title: item.title,
          brandName: item.brand?.name ?? '',
          priceLabel: marketV2PriceLabel(item, (amount, currency) => formatMarketV2Price(amount, currency)) ?? '',
        },
      } as never);
      return;
    case 'COLLECTION':
      drillDownPush({ pathname: '/collection-viewer', params: { collectionId: id, returnTo: '/(tabs)/discover' } } as never);
      return;
    case 'BRAND':
      drillDownPush({ pathname: '/catalog/[brandId]', params: { brandId: id } } as never);
      return;
    case 'CATEGORY': {
      const categoryId = item.category?.id ?? id;
      openMarketV2Catalogue(item.title, { categoryIds: [categoryId] });
      return;
    }
    default:
      return;
  }
}
