import { useCallback, useMemo, useState } from 'react';

import { MobileStoreApi, type CartState, type CustomBagState, type ProductBagStatus } from '@/src/api/StoreApi';
import { baggingService, type AddCustomOrderBagPayload, type AddStandardBagPayload } from '@/src/services/bagging';

export function useMobileBagging() {
  const [standardCart, setStandardCart] = useState<CartState | null>(null);
  const [customBag, setCustomBag] = useState<CustomBagState | null>(null);
  const [statusByProductId, setStatusByProductId] = useState<Record<string, ProductBagStatus>>({});
  const [loadingByProductId, setLoadingByProductId] = useState<Record<string, boolean>>({});

  const setLoading = useCallback((productId: string, loading: boolean) => {
    setLoadingByProductId((prev) => {
      const next = { ...prev };
      if (loading) next[productId] = true;
      else delete next[productId];
      return next;
    });
  }, []);

  const refreshBagState = useCallback(async () => {
    const [cart, custom] = await Promise.all([
      MobileStoreApi.getCart(),
      MobileStoreApi.listCustomBag(),
    ]);
    setStandardCart(cart);
    setCustomBag(custom);
    return { cart, custom };
  }, []);

  const prepareBag = useCallback(
    async (productId: string) => {
      setLoading(productId, true);
      try {
        const status = await baggingService.prepareBag(productId);
        setStatusByProductId((prev) => ({ ...prev, [productId]: status }));
        return status;
      } finally {
        setLoading(productId, false);
      }
    },
    [setLoading],
  );

  const addStandard = useCallback(
    async (payload: AddStandardBagPayload) => {
      setLoading(payload.productId, true);
      try {
        const result = await baggingService.addStandard(payload);
        await refreshBagState();
        const status = await baggingService.prepareBag(payload.productId);
        setStatusByProductId((prev) => ({ ...prev, [payload.productId]: status }));
        return result;
      } finally {
        setLoading(payload.productId, false);
      }
    },
    [refreshBagState, setLoading],
  );

  const addCustomOrder = useCallback(
    async (productId: string, payload: AddCustomOrderBagPayload) => {
      setLoading(productId, true);
      try {
        await baggingService.addCustomOrder(payload);
        await refreshBagState();
        const status = await baggingService.prepareBag(productId);
        setStatusByProductId((prev) => ({ ...prev, [productId]: status }));
      } finally {
        setLoading(productId, false);
      }
    },
    [refreshBagState, setLoading],
  );

  const counts = useMemo(() => {
    const standardCount = standardCart?.totalQuantity ?? 0;
    const customCount = customBag?.total ?? 0;
    return {
      standardCount,
      customCount,
      combinedCount: standardCount + customCount,
    };
  }, [customBag?.total, standardCart?.totalQuantity]);

  return {
    standardCart,
    customBag,
    counts,
    statusByProductId,
    loadingByProductId,
    refreshBagState,
    prepareBag,
    addStandard,
    addCustomOrder,
  };
}

export default useMobileBagging;
