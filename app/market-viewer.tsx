import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import MarketCommerceViewer from '@/src/features/market/components/MarketCommerceViewer';

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function MarketViewerRoute() {
  const params = useLocalSearchParams<{
    sourceType?: string | string[];
    sourceId?: string | string[];
    brandId?: string | string[];
    title?: string | string[];
    brandName?: string | string[];
    priceLabel?: string | string[];
  }>();
  const sourceType = firstParam(params.sourceType) === 'PRODUCT' ? 'PRODUCT' : 'DESIGN';

  return (
    <MarketCommerceViewer
      sourceType={sourceType}
      sourceId={firstParam(params.sourceId) ?? ''}
      initialBrandId={firstParam(params.brandId) ?? null}
      initialTitle={firstParam(params.title) ?? null}
      initialBrandName={firstParam(params.brandName) ?? null}
      initialPriceLabel={firstParam(params.priceLabel) ?? null}
      fallbackHref="/(tabs)/discover"
    />
  );
}
