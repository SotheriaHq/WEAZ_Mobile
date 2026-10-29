import { clearMobileMarketSignalQueue } from '@/src/services/marketSignals';
import { clearDeviceId } from '@/src/utils/deviceId';

import { analyticsPermitted, loadConsent, subscribeConsent } from './consent';

/**
 * Without analytics this install keeps no discovery signals and no analytics
 * id, including anything an earlier app version stored before the choice
 * existed. Sentry tracing needs nothing here: it samples per transaction.
 */
const forgetAnalyticsData = () => {
  void clearMobileMarketSignalQueue();
  void clearDeviceId();
};

let started = false;

export function startConsentEffects() {
  if (started) return;
  started = true;
  void loadConsent().then(() => {
    let previous = analyticsPermitted();
    if (!previous) forgetAnalyticsData();
    subscribeConsent(() => {
      const next = analyticsPermitted();
      if (previous && !next) forgetAnalyticsData();
      previous = next;
    });
  });
}
