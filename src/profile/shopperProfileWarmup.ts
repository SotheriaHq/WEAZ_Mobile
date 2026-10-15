/**
 * The shopper profile is a destination, not a loading exercise.
 *
 * A sign-in clears the previous account's private snapshot by design. Without
 * a fresh warm-up, the first trip to Me then starts six independent reads only
 * after the shopper has tapped the tab, which is why Saved, Patches and Orders
 * briefly looked empty. Start those reads as soon as the authenticated tab
 * shell is available and hand the complete, user-scoped snapshot to Me.
 */
import {
  ProfileApi,
  type ComputedSizeFitProfile,
  type PatchedBrand,
  type SavedItem,
  type SizeFitProfile,
  type UserProfile,
} from '@/src/api/ProfileApi';
import { BuyerOrdersApi, type BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import { perfEnabled, perfNote } from '@/src/perf/wiezPerf';
import { readWarmScreenState } from '@/src/state/screenWarmState';

const warmupNow: () => number = (() => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
})();

export type ShopperProfileWarmState = {
  profile: UserProfile | null;
  sizeFit: SizeFitProfile | null;
  computedSizeFit: ComputedSizeFitProfile | null;
  saved: SavedItem[];
  patches: PatchedBrand[];
  orders: BuyerOrderSummary[];
};

export const shopperProfileWarmStateKey = (userId: string): string => `me:v2:${userId}`;
const inFlightWarmups = new Map<string, Promise<ShopperProfileWarmState | null>>();

/**
 * Forget outstanding warm-up ownership when the authenticated identity ends.
 * Requests already on the wire cannot be cancelled reliably, but no later
 * session may join an old promise and publish its private snapshot.
 */
export function clearShopperProfileWarmups(): void {
  inFlightWarmups.clear();
}

/**
 * Fetch an all-tab profile snapshot without persisting it.
 *
 * The caller owns the identity check immediately before persistence. That
 * prevents an in-flight request belonging to a signed-out account from ever
 * writing private profile content back after session cleanup.
 */
export async function fetchShopperProfileWarmState(
  userId: string,
): Promise<ShopperProfileWarmState | null> {
  const key = shopperProfileWarmStateKey(userId);
  const cached = readWarmScreenState<ShopperProfileWarmState>(key);
  if (cached?.profile) return cached;

  const alreadyLoading = inFlightWarmups.get(key);
  if (alreadyLoading) return alreadyLoading;

  const warmup = (async (): Promise<ShopperProfileWarmState | null> => {
    /*
      `allSettled` waits for the slowest of the six.

      The profile header only needs the first of them. Resolving the batch as a
      unit means the shopper's own name cannot appear until the orders list and
      both size-fit reads have also come back, so first meaningful paint is
      pinned to max(six requests) rather than to the one request that produces
      the content at the top of the screen. The marks either side bound that
      cost; `fanout_slowest` names which request actually set it, because
      optimising the wrong one of six is the easy mistake here.
    */
    perfNote('API', 'profile_fanout_began', 'requests=6');
    const fanoutStartedAt = perfEnabled() ? warmupNow() : 0;
    const settleTimes = new Map<string, number>();
    const timed = <T,>(name: string, promise: Promise<T>): Promise<T> => {
      if (!perfEnabled()) return promise;
      return promise.finally(() => {
        settleTimes.set(name, warmupNow() - fanoutStartedAt);
      });
    };

    const [profileResult, sizeFitResult, computedSizeFitResult, savedResult, patchesResult, ordersResult] = await Promise.allSettled([
      timed('getMe', ProfileApi.getMe()),
      timed('getSizeFit', ProfileApi.getSizeFit()),
      timed('getComputedSizeFit', ProfileApi.getComputedSizeFit()),
      timed('getSaved', ProfileApi.getSaved()),
      timed('getPatches', ProfileApi.getPatches(userId)),
      timed('orders', BuyerOrdersApi.list({ limit: 6 })),
    ]);

    if (perfEnabled()) {
      const ranked = [...settleTimes.entries()].sort((a, b) => b[1] - a[1]);
      const slowest = ranked[0];
      const profileOnly = settleTimes.get('getMe');
      perfNote(
        'API',
        'profile_fanout_settled',
        `totalMs=${(warmupNow() - fanoutStartedAt).toFixed(1)}` +
          ` slowest=${slowest ? `${slowest[0]}:${slowest[1].toFixed(1)}ms` : 'n/a'}` +
          ` getMe=${profileOnly === undefined ? 'n/a' : `${profileOnly.toFixed(1)}ms`}`,
      );
    }

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;

    // A profile without its identity is not a usable warm snapshot. Let Me use
    // its normal partial-failure handling instead of persisting a false empty
    // state that could look like a real account with no content.
    if (!profile) return null;

    return {
      profile,
      sizeFit: sizeFitResult.status === 'fulfilled' ? sizeFitResult.value : null,
      computedSizeFit: computedSizeFitResult.status === 'fulfilled' ? computedSizeFitResult.value : null,
      saved: savedResult.status === 'fulfilled' ? savedResult.value : [],
      patches: patchesResult.status === 'fulfilled' ? patchesResult.value : [],
      orders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
    };
  })();

  inFlightWarmups.set(key, warmup);
  try {
    return await warmup;
  } finally {
    if (inFlightWarmups.get(key) === warmup) inFlightWarmups.delete(key);
  }
}
