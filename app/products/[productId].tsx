import React from 'react';
import { useCommitCost } from '@/src/perf/commitCost';
import { useLocalSearchParams } from 'expo-router';

import MarketCommerceViewer from '@/src/features/market/components/MarketCommerceViewer';

export default function ProductRouteScreen() {
  // First, so it times the product screen's whole first render (commitCost.ts).
  useCommitCost('Product');
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;

  return (
    <MarketCommerceViewer
      sourceType="PRODUCT"
      sourceId={productId ?? ''}
      fallbackHref="/(tabs)/discover"
    />
  );
}
