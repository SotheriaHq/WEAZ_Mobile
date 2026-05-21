import { getDesignFilterDimensions } from '@/src/api/DesignApi';
import { getMarketFilterChips } from '@/src/api/MarketApi';
import { queryClient, THREADLY_CATEGORY_FILTER_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

export const fetchMarketFilterChipsQuery = () =>
  queryClient.fetchQuery({
    queryKey: queryKeys.categories.filters('market-chips'),
    queryFn: getMarketFilterChips,
    staleTime: THREADLY_CATEGORY_FILTER_STALE_TIME_MS,
  });

export const fetchDesignFilterDimensionsQuery = () =>
  queryClient.fetchQuery({
    queryKey: queryKeys.categories.filters('design-dimensions'),
    queryFn: getDesignFilterDimensions,
    staleTime: THREADLY_CATEGORY_FILTER_STALE_TIME_MS,
  });
