import { useLocalSearchParams } from 'expo-router';
import { env } from '@/src/config/env';
import { useCommitCost } from '@/src/perf/commitCost';

import {
  MarketSectionDetailScreen,
  readMarketSectionParam,
} from '@/src/features/market/components/MarketSectionDetailScreen';
import { MarketV2ListScreen } from '@/src/features/market/v2/components/MarketV2ListScreen';

type Param = string | string[];

export default function MarketSectionRoute() {
  // First, so it times the section screen's whole first render (commitCost.ts).
  useCommitCost('MarketSection');
  const params = useLocalSearchParams<{
    sectionKey?: Param;
    parentKey?: Param;
    catalogue?: Param;
    title?: Param;
    filters?: Param;
    sort?: Param;
  }>();
  if (env.marketV2.enabled) {
    // Server-composed See All and category pages; a section the server still
    // serves from its retained reader falls back inside the screen.
    const catalogue = readMarketSectionParam(params.catalogue) === '1';
    return (
      <MarketV2ListScreen
        sectionKey={catalogue ? null : (readMarketSectionParam(params.sectionKey) ?? null)}
        title={readMarketSectionParam(params.title) ?? null}
        filters={readMarketSectionParam(params.filters) ?? null}
        sort={readMarketSectionParam(params.sort) ?? null}
        parentKey={readMarketSectionParam(params.parentKey) ?? null}
      />
    );
  }
  return (
    <MarketSectionDetailScreen
      sectionKey={readMarketSectionParam(params.sectionKey) ?? ''}
      parentKey={readMarketSectionParam(params.parentKey) ?? null}
    />
  );
}
