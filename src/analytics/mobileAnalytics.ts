import { Platform } from 'react-native';

import { isThreadlyDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';

type BaseEventProperties = {
  sourceScreen: string;
  sessionId?: string;
  appVersion?: string;
};

export type MobileAnalyticsEventMap = {
  feed_item_viewed: BaseEventProperties & {
    itemId: string;
    itemType: string;
    feedPosition: number;
    collectionId?: string | null;
    mediaId?: string | null;
    brandId?: string | null;
    categoryFilter?: string | null;
  };
  feed_item_swiped: BaseEventProperties & {
    fromItemId: string | null;
    toItemId: string | null;
    direction: 'up' | 'down' | 'none';
    fromPosition: number;
    toPosition: number;
    categoryFilter?: string | null;
  };
  media_angle_swiped: BaseEventProperties & {
    itemId: string;
    mediaId: string | null;
    fromIndex: number;
    toIndex: number;
    mediaCount: number;
    aspectClass?: 'portrait' | 'square' | 'landscape' | 'unknown';
  };
  design_saved: BaseEventProperties & {
    targetType: 'DESIGN' | 'COLLECTION';
    targetId: string;
    collectionId?: string | null;
    mediaId?: string | null;
    brandId?: string | null;
    feedPosition?: number;
  };
  design_unsaved: BaseEventProperties & {
    targetType: 'DESIGN' | 'COLLECTION';
    targetId: string;
    collectionId?: string | null;
    mediaId?: string | null;
    brandId?: string | null;
    feedPosition?: number;
  };
  saved_looks_opened: BaseEventProperties & {
    savedCountBucket?: string;
  };
  thread_tapped: BaseEventProperties & {
    itemId: string;
    mediaId: string;
    collectionId?: string | null;
    currentThreaded: boolean;
    threadCount: number;
    feedPosition?: number;
  };
  thread_toggled: BaseEventProperties & {
    itemId: string;
    mediaId: string;
    collectionId?: string | null;
    nextThreaded: boolean;
    previousThreaded?: boolean;
    threadCount?: number;
    result: 'success' | 'failure' | 'queued';
    errorCode?: string;
  };
  brand_opened: BaseEventProperties & {
    brandId: string;
    itemId?: string | null;
    mediaId?: string | null;
    feedPosition?: number;
  };
  bag_tapped: BaseEventProperties & {
    sourceType: 'PRODUCT' | 'DESIGN' | 'COLLECTION';
    sourceId: string;
    productId?: string | null;
    designId?: string | null;
    collectionId?: string | null;
    eligibilityState?: string | null;
  };
  custom_order_tapped: BaseEventProperties & {
    sourceType: 'DESIGN' | 'PRODUCT';
    sourceId: string;
    brandId?: string | null;
    eligibilityState?: string | null;
  };
  new_drop_badge_seen: BaseEventProperties & {
    itemId: string;
    badgeRule: string;
    ageHours?: number;
    feedPosition?: number;
  };
  social_proof_seen: BaseEventProperties & {
    itemId: string;
    proofType: 'threads';
    countValue: number;
    threshold: number;
    mediaId?: string | null;
    feedPosition?: number;
  };
  social_proof_tapped: BaseEventProperties & {
    itemId: string;
    proofType: 'threads';
    countValue: number;
    mediaId?: string | null;
    feedPosition?: number;
  };
  moodboard_section_seen: BaseEventProperties & {
    itemCount: number;
    sectionId: string;
  };
  moodboard_suggestion_seen: BaseEventProperties & {
    itemId: string;
    collectionId?: string | null;
    brandId?: string | null;
    position: number;
    score?: number;
  };
  moodboard_suggestion_opened: BaseEventProperties & {
    itemId: string;
    collectionId?: string | null;
    brandId?: string | null;
    position?: number;
  };
  moodboard_suggestion_saved: BaseEventProperties & {
    itemId: string;
    collectionId?: string | null;
    brandId?: string | null;
    position?: number;
  };
};

export type MobileAnalyticsEventName = keyof MobileAnalyticsEventMap;

let analyticsEnabled = false;

export function configureMobileAnalytics(options: { enabled?: boolean } = {}) {
  analyticsEnabled = Boolean(options.enabled);
}

export function trackMobileEvent<Name extends MobileAnalyticsEventName>(
  name: Name,
  properties: MobileAnalyticsEventMap[Name],
) {
  const payload = {
    eventName: name,
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    ...properties,
  };

  setTimeout(() => {
    try {
      if (!analyticsEnabled) {
        if (isThreadlyDebugEnabled('analytics')) {
          console.log('[mobile-analytics:no-op]', payload);
        }
        return;
      }

      if (isThreadlyDebugEnabled('analytics')) {
        console.log('[mobile-analytics]', payload);
      }
    } catch {
      // Analytics must never affect product interactions.
    }
  }, 0);
}
