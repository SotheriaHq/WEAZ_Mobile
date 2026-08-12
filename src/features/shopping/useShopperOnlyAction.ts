import { useCallback } from 'react';

import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { useToast } from '@/src/toast/ToastContext';

/**
 * One gate for every buyer-only action: bagging, saving, wishlisting.
 *
 * `BagFlowProvider` already refused bag flows for brand accounts, but SAVING
 * and WISHLISTING went straight to the API with no equivalent check — so a
 * brand could tap the heart on a product and receive a success toast for an
 * action their account type cannot perform. Guarding each call site
 * individually is what produced that gap in the first place: the bag path was
 * remembered, the wishlist path was not.
 *
 * `refuse()` returns true when it has handled the request, so a call site bails
 * in one line and cannot forget the toast:
 *
 *   if (refuseIfBrand('save designs')) return;
 *
 * This is a UX guard, not a security boundary — the API must reject these on
 * its own too. What it buys is that a brand never sees a confirmation for
 * something that did not, and must not, happen.
 */
export function useShopperOnlyAction() {
  const { user } = useAuth();
  const toast = useToast();
  const isBrandAccount = hasActiveBrandMembership(user);

  const refuseIfBrand = useCallback(
    (action = 'shop') => {
      if (!isBrandAccount) return false;
      toast.info(`Brand accounts sell on WIEZ — ${action} is a personal account feature.`);
      return true;
    },
    [isBrandAccount, toast],
  );

  return { isBrandAccount, refuseIfBrand };
}

export default useShopperOnlyAction;
