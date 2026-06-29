import { useEffect } from 'react';

import { MarketFeedScreen } from '@/src/features/feed/components/MarketFeedScreen';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { warmPrimaryTabsAfterRunway } from '@/src/prefetch/tabWarming';

export default function HomeScreen() {
  // Phase 5: once Runway is past its first interactions, warm the likely next
  // tabs (Market / Messages / Profile) on a staggered idle schedule.
  const deferredReady = useDeferredScreenWork();
  useEffect(() => {
    if (deferredReady) warmPrimaryTabsAfterRunway();
  }, [deferredReady]);

  return <MarketFeedScreen />;
}
