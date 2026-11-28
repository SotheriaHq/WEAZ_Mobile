import { env } from '@/src/config/env';
import { MarketScreen } from '@/src/features/market/components/MarketScreen';
import { MarketV2Gate } from '@/src/features/market/v2/components/MarketV2HomeScreen';

// EXPO_PUBLIC_MARKET_V2 (off by default) shows the server-composed Market;
// off keeps the established Market exactly as it was.
const MarketTab = env.marketV2.enabled ? MarketV2Gate : MarketScreen;

export default function DiscoverScreen() {
  return <MarketTab />;
}
