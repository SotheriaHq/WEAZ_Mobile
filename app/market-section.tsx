import { useLocalSearchParams } from 'expo-router';
import { useCommitCost } from '@/src/perf/commitCost';

import {
  MarketSectionDetailScreen,
  readMarketSectionParam,
} from '@/src/features/market/components/MarketSectionDetailScreen';

export default function MarketSectionRoute() {
  // First, so it times the section screen's whole first render (commitCost.ts).
  useCommitCost('MarketSection');
  const params = useLocalSearchParams<{ sectionKey?: string | string[]; parentKey?: string | string[] }>();
  return (
    <MarketSectionDetailScreen
      sectionKey={readMarketSectionParam(params.sectionKey) ?? ''}
      parentKey={readMarketSectionParam(params.parentKey) ?? null}
    />
  );
}
