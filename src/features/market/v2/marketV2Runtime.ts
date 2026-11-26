/**
 * App wiring for the server-composed Market: the availability answer, the
 * viewer, the guest session, signals and the shopper's own card state (bag,
 * clips). The rules themselves live in the framework-free modules beside this
 * file; this one only connects them to the app.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { MobileStoreApi } from '@/src/api/StoreApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import type { MarketSignalEvent } from '@/src/api/MarketApi';
import { useAuthSession } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { trackMarketSignal } from '@/src/services/marketSignals';
import { persistScreenState } from '@/src/state/persistentScreenCache';
import { readWarmScreenState } from '@/src/state/screenWarmState';
import { useToast } from '@/src/toast/ToastContext';
import { getCachedDeviceId } from '@/src/utils/deviceId';
import { getMediaSessionEpoch } from '@/src/utils/mediaUrlSession';
import { formatMoney } from '@/src/utils/money';

import { createMarketV2Availability } from './marketV2Availability';
import {
  marketV2GuestSession,
  marketV2ViewerKey,
  type MarketV2Item,
} from './marketV2Contract';

const AVAILABILITY_KEY = 'market-mode:v2';

/**
 * One answer for the whole app. Persisted through the warm screen cache, which
 * sign-out clears, so a new account asks the server afresh.
 */
export const marketV2Availability = createMarketV2Availability({
  now: () => Date.now(),
  read: () => readWarmScreenState<unknown>(AVAILABILITY_KEY),
  write: (value) => persistScreenState(AVAILABILITY_KEY, value),
});

export function useMarketV2Mode() {
  return useSyncExternalStore(
    marketV2Availability.subscribe,
    marketV2Availability.getMode,
    marketV2Availability.getMode,
  );
}

/** The viewer this Market belongs to; null until the session is known. */
export function useMarketV2Viewer() {
  const { status, userId, userType, activeBrandId } = useAuthSession();
  return {
    viewerKey: marketV2ViewerKey(status, userId),
    isBrandAccount: String(userType ?? '').toUpperCase() === 'BRAND',
    activeBrandId,
    signedIn: status === 'authenticated',
  };
}

export const marketV2GuestSessionFor = (viewerKey: string) =>
  marketV2GuestSession(viewerKey, getCachedDeviceId());

export const marketV2SessionEpoch = getMediaSessionEpoch;

export const formatMarketV2Price = (amount: number, currency = 'NGN') =>
  formatMoney(amount, currency) ?? '';

type TargetType = MarketSignalEvent['targetType'];

/** The signal target for a card; null for something signals cannot name. */
export function marketV2SignalTarget(item: MarketV2Item): { targetType: TargetType; targetId: string } | null {
  const type = item.target.type;
  const id = item.target.id ?? item.id;
  if (!id) return null;
  if (type === 'PRODUCT' || type === 'DESIGN' || type === 'COLLECTION' || type === 'BRAND' || type === 'CATEGORY') {
    return { targetType: type, targetId: id };
  }
  return null;
}

export type MarketV2SignalContext = {
  surface: 'MARKET_HOME' | 'MARKET_SECTION_DETAIL';
  sectionKey: string;
  policyVersion?: string | null;
  epoch?: string;
};

/** A card signal with the optional telemetry the server can use; unknown fields stay out. */
export function trackMarketV2CardSignal(
  item: MarketV2Item,
  signalType: 'IMPRESSION' | 'OPEN',
  context: MarketV2SignalContext,
  position: number,
  visibleMs?: number,
) {
  const target = marketV2SignalTarget(item);
  if (!target) return;
  trackMarketSignal({
    ...target,
    signalType,
    surface: context.surface,
    sectionKey: context.sectionKey,
    position,
    occurredAt: new Date().toISOString(),
    ...(visibleMs !== undefined ? { visibleMs: Math.min(3_600_000, Math.max(0, Math.round(visibleMs))) } : {}),
    ...(context.epoch ? { epoch: context.epoch } : {}),
    ...(context.policyVersion ? { policyVersion: context.policyVersion } : {}),
  });
}

// ─── Clips (wishlist for products, saved designs) ──────────────────────────

const CLIPS_TTL_MS = 5 * 60 * 1000;
type ClipState = { viewerKey: string; loadedAt: number; products: Set<string>; designs: Map<string, boolean> };
let clipState: ClipState | null = null;
let clipLoad: Promise<void> | null = null;
const clipListeners = new Set<() => void>();
const emitClips = () => clipListeners.forEach((listener) => listener());
const subscribeClips = (listener: () => void) => {
  clipListeners.add(listener);
  return () => {
    clipListeners.delete(listener);
  };
};
let clipVersion = 0;
const getClipVersion = () => clipVersion;

function updateClips(mutate: (state: ClipState) => void) {
  if (!clipState) return;
  mutate(clipState);
  clipVersion += 1;
  emitClips();
}

/**
 * Which visible pieces this shopper has clipped. Read once per viewer after
 * the Market has painted (never before), and only for a signed-in shopper.
 */
export function useMarketV2Clips(viewerKey: string | null, signedIn: boolean, enabled: boolean, designIds: ReadonlyArray<string>) {
  useSyncExternalStore(subscribeClips, getClipVersion, getClipVersion);
  const designKey = designIds.join(',');

  useEffect(() => {
    if (!enabled || !signedIn || !viewerKey) return;
    const epoch = getMediaSessionEpoch();
    if (clipState?.viewerKey !== viewerKey) {
      clipState = { viewerKey, loadedAt: 0, products: new Set(), designs: new Map() };
    }
    const fresh = Date.now() - clipState.loadedAt < CLIPS_TTL_MS;
    if (!fresh && !clipLoad) {
      clipLoad = MobileStoreApi.getWishlist()
        .then((wishlist) => {
          if (epoch !== getMediaSessionEpoch()) return;
          if (clipState?.viewerKey !== viewerKey) return;
          updateClips((state) => {
            state.loadedAt = Date.now();
            state.products = new Set(wishlist.items.map((item) => item.productId));
          });
        })
        .catch(() => undefined)
        .finally(() => {
          clipLoad = null;
        });
    }
    const unknown = designKey ? designKey.split(',').filter((id) => !clipState?.designs.has(id)) : [];
    if (!unknown.length) return;
    SavedItemsApi.checkBatch('COLLECTION', unknown)
      .then((saved) => {
        if (epoch !== getMediaSessionEpoch() || clipState?.viewerKey !== viewerKey) return;
        updateClips((state) => {
          for (const id of unknown) state.designs.set(id, Boolean(saved[id]));
        });
      })
      .catch(() => undefined);
  }, [designKey, enabled, signedIn, viewerKey]);

  const forViewer = clipState?.viewerKey === viewerKey ? clipState : null;
  return useCallback(
    (item: MarketV2Item) =>
      item.entityType === 'PRODUCT'
        ? Boolean(forViewer?.products.has(item.id))
        : item.entityType === 'DESIGN'
          ? Boolean(forViewer?.designs.get(item.id))
          : false,
    // clipVersion changes the answer without changing the state object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forViewer, clipVersion],
  );
}

/**
 * Bag It and Clip for Market cards. The handlers are stable, so a bag or
 * clip change re-renders only the card it touched.
 */
export function useMarketV2CardActions(viewerKey: string | null, signedIn: boolean) {
  const toast = useToast();
  const { bagProduct, bagSource } = useMobileBagging();
  const latest = useRef({ bagProduct, bagSource, toast, viewerKey, signedIn });
  latest.current = { bagProduct, bagSource, toast, viewerKey, signedIn };
  const [busy, setBusy] = useState<Record<string, true>>({});

  const mark = useCallback((key: string, on: boolean) => {
    setBusy((current) => {
      if (on === Boolean(current[key])) return current;
      const next = { ...current };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const bag = useCallback(
    async (item: MarketV2Item) => {
      const key = `bag:${item.entityType}:${item.id}`;
      mark(key, true);
      try {
        if (item.entityType === 'PRODUCT') {
          await latest.current.bagProduct({ id: item.id, name: item.title });
        } else if (item.entityType === 'DESIGN') {
          await latest.current.bagSource({ sourceType: 'DESIGN', sourceId: item.id, name: item.title });
        }
      } catch (error) {
        latest.current.toast.error(error instanceof Error ? error.message : 'Could not bag this piece.');
      } finally {
        mark(key, false);
      }
    },
    [mark],
  );

  const clip = useCallback(
    async (item: MarketV2Item, clipped: boolean) => {
      if (!latest.current.signedIn) {
        latest.current.toast.info('Sign in to clip pieces.');
        return;
      }
      const key = `clip:${item.entityType}:${item.id}`;
      mark(key, true);
      const apply = (value: boolean) =>
        updateClips((state) => {
          if (item.entityType === 'PRODUCT') {
            if (value) state.products.add(item.id);
            else state.products.delete(item.id);
          } else {
            state.designs.set(item.id, value);
          }
        });
      apply(!clipped);
      try {
        if (item.entityType === 'PRODUCT') {
          if (clipped) await MobileStoreApi.removeFromWishlist(item.id);
          else await MobileStoreApi.addToWishlist(item.id);
        } else if (clipped) {
          await SavedItemsApi.unsaveCatalogTarget({ targetType: 'DESIGN', designId: item.id, legacyCollectionId: item.id });
        } else {
          await SavedItemsApi.saveCatalogTarget({ targetType: 'DESIGN', designId: item.id, legacyCollectionId: item.id });
        }
      } catch (error) {
        apply(clipped);
        latest.current.toast.error(error instanceof Error ? error.message : 'Could not update your clips.');
      } finally {
        mark(key, false);
      }
    },
    [mark],
  );

  return { bag, clip, busy };
}
