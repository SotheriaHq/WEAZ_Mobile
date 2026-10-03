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
import { readWarmScreenState } from '@/src/state/screenWarmState';

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
    const [profileResult, sizeFitResult, computedSizeFitResult, savedResult, patchesResult, ordersResult] = await Promise.allSettled([
      ProfileApi.getMe(),
      ProfileApi.getSizeFit(),
      ProfileApi.getComputedSizeFit(),
      ProfileApi.getSaved(),
      ProfileApi.getPatches(userId),
      BuyerOrdersApi.list({ limit: 6 }),
    ]);

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
