import { useCallback, useMemo, useState } from 'react';

import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import { MobileStoreApi, type CartState, type CustomBagState, type ProductBagStatus } from '@/src/api/StoreApi';
import { baggingService, type AddCustomOrderBagPayload, type AddStandardBagPayload } from '@/src/services/bagging';

type BagProductInput = {
  id: string;
  name?: string;
};

type BagInteractionCallbacks = {
  onOpenSelector?: (status: ProductBagStatus, product: BagProductInput) => void;
  onOpenCustomFlow?: (status: ProductBagStatus, product: BagProductInput) => void;
  onOpenFittings?: (status: ProductBagStatus, product: BagProductInput) => void;
  onRequireAuth?: (product: BagProductInput, action: ProductBagStatus['ui']['defaultAction']) => void;
  onOpenExistingBag?: (status: ProductBagStatus, product: BagProductInput) => void;
};

export function useMobileBagging() {
  const { status: authStatus } = useAuth();
  const toast = useToast();
  const [standardCart, setStandardCart] = useState<CartState | null>(null);
  const [customBag, setCustomBag] = useState<CustomBagState | null>(null);
  const [statusByProductId, setStatusByProductId] = useState<Record<string, ProductBagStatus>>({});
  const [loadingByProductId, setLoadingByProductId] = useState<Record<string, boolean>>({});
  const [errorByProductId, setErrorByProductId] = useState<Record<string, string | null>>({});

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
      setErrorByProductId((prev) => ({ ...prev, [productId]: null }));
      try {
        const status = await baggingService.prepareBag(productId);
        setStatusByProductId((prev) => ({ ...prev, [productId]: status }));
        return status;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to check bag status.';
        setErrorByProductId((prev) => ({ ...prev, [productId]: message }));
        throw error;
      } finally {
        setLoading(productId, false);
      }
    },
    [setLoading],
  );

  const addStandard = useCallback(
    async (payload: AddStandardBagPayload) => {
      setLoading(payload.productId, true);
      setErrorByProductId((prev) => ({ ...prev, [payload.productId]: null }));
      try {
        const result = await baggingService.addStandard(payload);
        await refreshBagState();
        const status = await baggingService.prepareBag(payload.productId);
        setStatusByProductId((prev) => ({ ...prev, [payload.productId]: status }));
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update standard bag.';
        setErrorByProductId((prev) => ({ ...prev, [payload.productId]: message }));
        toast.error(message);
        throw error;
      } finally {
        setLoading(payload.productId, false);
      }
    },
    [refreshBagState, setLoading, toast],
  );

  const addCustomOrder = useCallback(
    async (productId: string, payload: AddCustomOrderBagPayload) => {
      setLoading(productId, true);
      setErrorByProductId((prev) => ({ ...prev, [productId]: null }));
      try {
        await baggingService.addCustomOrder(payload);
        await refreshBagState();
        const status = await baggingService.prepareBag(productId);
        setStatusByProductId((prev) => ({ ...prev, [productId]: status }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update custom bag.';
        setErrorByProductId((prev) => ({ ...prev, [productId]: message }));
        toast.error(message);
        throw error;
      } finally {
        setLoading(productId, false);
      }
    },
    [refreshBagState, setLoading, toast],
  );

  const getStatus = useCallback(
    (productId: string) => statusByProductId[productId] ?? null,
    [statusByProductId],
  );

  const getBagAction = useCallback(
    (productId: string, fallbackDisabled = false): ProductBagStatus['ui']['defaultAction'] => {
      const status = getStatus(productId);
      if (!status) return fallbackDisabled ? 'DISABLED' : 'ADD_STANDARD';
      return status.ui.defaultAction;
    },
    [getStatus],
  );

  const getPulseStatus = useCallback(
    (productId: string, fallbackDisabled = false): ProductBagStatus['ui']['heartbeatState'] => {
      if (loadingByProductId[productId]) return 'bagging';
      const status = getStatus(productId);
      if (!status) return fallbackDisabled ? 'disabled' : 'not_bagged';
      if (status.standard.inBag || status.custom.alreadyBagged) return 'currently_bagged';
      if (status.userState.hasPreviouslyBaggedOrOrdered) return 'previously_bagged';
      return status.ui.heartbeatState;
    },
    [getStatus, loadingByProductId],
  );

  const beginSelectorFlow = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks = {}) => {
      const status = await prepareBag(product.id);
      callbacks.onOpenSelector?.(status, product);
      return status;
    },
    [prepareBag],
  );

  const beginCustomFlow = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks = {}) => {
      const status = await prepareBag(product.id);
      if (status.custom.alreadyBagged) {
        callbacks.onOpenExistingBag?.(status, product);
        return status;
      }
      if (status.custom.fittingState === 'MISSING' || status.custom.fittingState === 'PARTIAL') {
        callbacks.onOpenFittings?.(status, product);
        return status;
      }
      if (!status.custom.available) {
        callbacks.onOpenFittings?.(status, product);
        return status;
      }
      callbacks.onOpenCustomFlow?.(status, product);
      return status;
    },
    [prepareBag],
  );

  const beginFittingsFlow = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks = {}) => {
      const status = await prepareBag(product.id);
      callbacks.onOpenFittings?.(status, product);
      return status;
    },
    [prepareBag],
  );

  const bagProduct = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks = {}) => {
      if (authStatus !== 'authenticated') {
        callbacks.onRequireAuth?.(product, 'DISABLED');
        toast.info('Please sign in to bag items.');
        return null;
      }

      const status = await prepareBag(product.id);

      if (!status.canBag || status.ui.defaultAction === 'DISABLED') {
        toast.error(status.ui.disabledReason || 'This product cannot be bagged.');
        return { action: 'DISABLED' as const, status };
      }

      if (status.standard.inBag || status.custom.alreadyBagged) {
        callbacks.onOpenExistingBag?.(status, product);
        return { action: status.ui.defaultAction, status };
      }

      if (status.ui.defaultAction === 'ADD_STANDARD') {
        await addStandard({ productId: product.id, qty: 1 });
        return { action: 'ADD_STANDARD' as const, status };
      }

      if (status.ui.defaultAction === 'OPEN_SELECTOR') {
        callbacks.onOpenSelector?.(status, product);
        return { action: 'OPEN_SELECTOR' as const, status };
      }

      if (status.ui.defaultAction === 'OPEN_FITTINGS') {
        callbacks.onOpenFittings?.(status, product);
        return { action: 'OPEN_FITTINGS' as const, status };
      }

      callbacks.onOpenCustomFlow?.(status, product);
      return { action: 'OPEN_CUSTOM_FLOW' as const, status };
    },
    [addStandard, authStatus, prepareBag, toast],
  );

  const clearBagStatus = useCallback((productId: string) => {
    setStatusByProductId((prev) => {
      if (!prev[productId]) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setErrorByProductId((prev) => {
      if (!prev[productId]) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

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
    errorByProductId,
    refreshBagState,
    prepareBag,
    addStandard,
    addCustomOrder,
    clearBagStatus,
    getStatus,
    getBagAction,
    getPulseStatus,
    beginSelectorFlow,
    beginCustomFlow,
    beginFittingsFlow,
    bagProduct,
  };
}

export default useMobileBagging;
