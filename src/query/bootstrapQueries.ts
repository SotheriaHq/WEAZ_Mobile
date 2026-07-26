import {
  getDesignCategories,
  getDesignFilterDimensions,
  getMeasurementPoints,
  type MeasurementPointOption,
} from '@/src/api/DesignApi';
import { getMarketFilterChips } from '@/src/api/MarketApi';
import { queryClient, WIEZ_CATEGORY_FILTER_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

export const fetchMarketFilterChipsQuery = () =>
  queryClient.fetchQuery({
    queryKey: queryKeys.categories.filters('market-chips'),
    queryFn: getMarketFilterChips,
    staleTime: WIEZ_CATEGORY_FILTER_STALE_TIME_MS,
  });

export const fetchDesignFilterDimensionsQuery = () =>
  queryClient.fetchQuery({
    queryKey: queryKeys.categories.filters('design-dimensions'),
    queryFn: getDesignFilterDimensions,
    staleTime: WIEZ_CATEGORY_FILTER_STALE_TIME_MS,
  });

export const fetchDesignCategoriesQuery = () =>
  queryClient.fetchQuery({
    queryKey: queryKeys.categories.designCategories(),
    queryFn: getDesignCategories,
    staleTime: WIEZ_CATEGORY_FILTER_STALE_TIME_MS,
  });

export const fetchMeasurementPointsQuery = (gender?: 'MEN' | 'WOMEN' | 'UNISEX') =>
  queryClient.fetchQuery<MeasurementPointOption[]>({
    queryKey: queryKeys.measurementPoints.byGender(gender ?? null),
    queryFn: () => getMeasurementPoints(gender ? { gender } : undefined),
    staleTime: WIEZ_CATEGORY_FILTER_STALE_TIME_MS,
  });
