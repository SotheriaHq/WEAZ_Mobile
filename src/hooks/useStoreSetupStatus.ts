import { useQuery } from '@tanstack/react-query';

import { brandApi } from '@/src/api/BrandApi';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { queryKeys } from '@/src/query/queryKeys';

const STORE_STATUS_STALE_TIME_MS = 60_000;

export type StoreSetupStatus = {
  /**
   * `true` — the store wizard is finished and published.
   * `false` — the brand still has setup to do.
   * `null` — not known yet (first fetch in flight, or the request failed).
   *
   * Callers must treat `null` as "don't know", never as "not set up": the
   * native counterpart of the lesson recorded in web's `useStoreSetupStatus`,
   * where a single failed `/store/status` call presented a fully published
   * brand with a dead Studio.
   */
  isSetupComplete: boolean | null;
  isLoading: boolean;
};

/**
 * Whether the signed-in brand has COMPLETED store setup. Non-brand accounts get
 * `true` (nothing here restricts them). This is the signal that decides whether
 * a brand is offered "Store" or "Set up store", and whether the Studio WebView
 * may open a trading route at all.
 */
export function useStoreSetupStatus(): StoreSetupStatus {
  const { user, status } = useAuth();
  const isBrand = hasActiveBrandMembership(user);
  const enabled = status === 'authenticated' && isBrand;

  const query = useQuery({
    queryKey: queryKeys.store.status(),
    queryFn: () => brandApi.getStoreStatus(),
    enabled,
    staleTime: STORE_STATUS_STALE_TIME_MS,
  });

  if (!enabled) {
    return { isSetupComplete: isBrand ? null : true, isLoading: false };
  }

  return {
    isSetupComplete: query.data ? query.data.isSetupComplete : null,
    isLoading: query.isPending,
  };
}

export default useStoreSetupStatus;
