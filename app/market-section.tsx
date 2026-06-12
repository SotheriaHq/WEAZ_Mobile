import { useLocalSearchParams } from 'expo-router';

import {
  MarketSectionDetailScreen,
  readMarketSectionParam,
} from '@/src/features/market/components/MarketSectionDetailScreen';

export default function MarketSectionRoute() {
  const params = useLocalSearchParams<{ sectionKey?: string | string[] }>();
  return <MarketSectionDetailScreen sectionKey={readMarketSectionParam(params.sectionKey) ?? ''} />;
}
