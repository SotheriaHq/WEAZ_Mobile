import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import { useBagFlow } from '@/src/features/bagging/BagFlowProvider';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { MobileStoreApi, type BagSourceType, type CartState, type CustomBagState, type ProductBagStatus } from '@/src/api/StoreApi';
import { baggingService, type AddCustomOrderBagPayload, type AddStandardBagPayload } from '@/src/services/bagging';

type BagProductInput = {
  id: string;
  name?: string;
  sourceType?: BagSourceType;
  sourceId?: string;
};

type BagInteractionCallbacks = {
  onOpenSelector?: (status: ProductBagStatus, product: BagProductInput) => void;
  onOpenCustomFlow?: (status: ProductBagStatus, product: BagProductInput) => void;
  onOpenFittings?: (status: ProductBagStatus, product: BagProductInput) => void;
  onRequireAuth?: (product: BagProductInput, action: ProductBagStatus['ui']['defaultAction']) => void;
  onOpenExistingBag?: (status: ProductBagStatus, product: BagProductInput) => void;
};

type BagFlowBagOptions = {
  suppressAuthPrompt?: boolean;
};

const BAG_STATUS_CACHE_TTL_MS = 8_000;

const cachedBagStatusByKey = new Map<string, { status: ProductBagStatus; expiresAt: number }>();
const inflightBagStatusByKey = new Map<string, Promise<ProductBagStatus>>();

const toSourceKey = (sourceType: BagSourceType, sourceId: string) => `${sourceType}:${sourceId}`;
const toProductKey = (productId: string) => toSourceKey('PRODUCT', productId);

const getCachedBagStatus = (key: string) => {
  const cached = cachedBagStatusByKey.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cachedBagStatusByKey.delete(key);
    return null;
  }
  return cached.status;
};

const setCachedBagStatus = (key: string, status: ProductBagStatus) => {
  cachedBagStatusByKey.set(key, {
    status,
    expiresAt: Date.now() + BAG_STATUS_CACHE_TTL_MS,
  });
};

const clearCachedBagStatus = (key?: string) => {
  if (key) {
    cachedBagStatusByKey.delete(key);
    inflightBagStatusByKey.delete(key);
    return;
  }
  cachedBagStatusByKey.clear();
  inflightBagStatusByKey.clear();
};

const resolveBagStatus = (
  key: string,
  fetcher: () => Promise<ProductBagStatus>,
  options?: { forceRefresh?: boolean },
) => {
  if (options?.forceRefresh) {
    clearCachedBagStatus(key);
  } else {
    const cached = getCachedBagStatus(key);
    if (cached) return Promise.resolve(cached);

    const inflight = inflightBagStatusByKey.get(key);
    if (inflight) return inflight;
  }

  const request = fetcher().then((status) => {
    setCachedBagStatus(key, status);
    return status;
  });
  inflightBagStatusByKey.set(key, request);
  void request.finally(() => {
    if (inflightBagStatusByKey.get(key) === request) {
      inflightBagStatusByKey.delete(key);
    }
  });
  return request;
};

export function useMobileBagging() {
  const { status: authStatus } = useAuth();
  const toast = useToast();
  const bagFlow = useBagFlow();
  const { count: globalBagCount, refreshGlobalBagCount } = useBagCount();
  const [standardCart, setStandardCart] = useState<CartState | null>(null);
  const [customBag, setCustomBag] = useState<CustomBagState | null>(null);
  const [statusByProductId, setStatusByProductId] = useState<Record<string, ProductBagStatus>>({});
  const [statusBySourceKey, setStatusBySourceKey] = useState<Record<string, ProductBagStatus>>({});
  const [loadingByProductId, setLoadingByProductId] = useState<Record<string, boolean>>({});
  const [errorByProductId, setErrorByProductId] = useState<Record<string, string | null>>({});
  const authStatusRef = useRef(authStatus);

  const sourceKey = useCallback((sourceType: BagSourceType, sourceId: string) => toSourceKey(sourceType, sourceId), []);

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
      refreshGlobalBagCount({ forceRefresh: true }),
    ]);
    setStandardCart(cart);
    setCustomBag(custom);
    return { cart, custom };
  }, [refreshGlobalBagCount]);

  useEffect(() => {
    if (authStatusRef.current !== authStatus) {
      clearCachedBagStatus();
      authStatusRef.current = authStatus;
    }
  }, [authStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        clearCachedBagStatus();
      }
    });

    return () => subscription.remove();
  }, []);

  const prepareBag = useCallback(
    async (productId: string, options?: { forceRefresh?: boolean }) => {
      setLoading(productId, true);
      setErrorByProductId((prev) => ({ ...prev, [productId]: null }));
      try {
        const status = await resolveBagStatus(
          toProductKey(productId),
          () => baggingService.prepareBag(productId),
          options,
        );
        setStatusByProductId((prev) => ({ ...prev, [productId]: status }));
        const nextSourceType = status.sourceType;
        const nextSourceId = status.sourceId;
        if (nextSourceType && nextSourceId) {
          setStatusBySourceKey((prev) => ({ ...prev, [sourceKey(nextSourceType, nextSourceId)]: status }));
        }
        return status;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to check bag status.';
        setErrorByProductId((prev) => ({ ...prev, [productId]: message }));
        throw error;
      } finally {
        setLoading(productId, false);
      }
    },
    [setLoading, sourceKey],
  );

  const prepareSourceBag = useCallback(
    async (sourceType: BagSourceType, sourceId: string, options?: { forceRefresh?: boolean }) => {
      const key = sourceKey(sourceType, sourceId);
      setLoading(key, true);
      setErrorByProductId((prev) => ({ ...prev, [key]: null }));
      try {
        const status = await resolveBagStatus(
          key,
          () => baggingService.prepareSourceBag(sourceType, sourceId),
          options,
        );
        setStatusBySourceKey((prev) => ({ ...prev, [key]: status }));
        if (sourceType === 'PRODUCT') {
          setStatusByProductId((prev) => ({ ...prev, [sourceId]: status }));
        }
        return status;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to check bag status.';
        setErrorByProductId((prev) => ({ ...prev, [key]: message }));
        throw error;
      } finally {
        setLoading(key, false);
      }
    },
    [setLoading, sourceKey],
  );

  const addStandard = useCallback(
    async (payload: AddStandardBagPayload) => {
      setLoading(payload.productId, true);
      setErrorByProductId((prev) => ({ ...prev, [payload.productId]: null }));
      try {
        clearCachedBagStatus(toProductKey(payload.productId));
        const result = await baggingService.addStandard(payload);
        await refreshBagState();
        const status = await prepareBag(payload.productId, { forceRefresh: true });
        setStatusByProductId((prev) => ({ ...prev, [payload.productId]: status }));
        const nextSourceType = status.sourceType;
        const nextSourceId = status.sourceId;
        if (nextSourceType && nextSourceId) {
          setStatusBySourceKey((prev) => ({ ...prev, [sourceKey(nextSourceType, nextSourceId)]: status }));
        }
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
    [prepareBag, refreshBagState, setLoading, sourceKey, toast],
  );

  const addCustomOrder = useCallback(
    async (productId: string, payload: AddCustomOrderBagPayload, sourceType: BagSourceType = 'PRODUCT', sourceId = productId) => {
      const key = sourceType === 'PRODUCT' ? productId : sourceKey(sourceType, sourceId);
      setLoading(key, true);
      setErrorByProductId((prev) => ({ ...prev, [key]: null }));
      try {
        clearCachedBagStatus(key);
        await baggingService.addCustomOrder(payload);
        await refreshBagState();
        const status = sourceType === 'PRODUCT'
          ? await prepareBag(productId, { forceRefresh: true })
          : await prepareSourceBag(sourceType, sourceId, { forceRefresh: true });
        if (sourceType === 'PRODUCT') {
          setStatusByProductId((prev) => ({ ...prev, [productId]: status }));
        }
        setStatusBySourceKey((prev) => ({ ...prev, [sourceKey(sourceType, sourceId)]: status }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update custom bag.';
        setErrorByProductId((prev) => ({ ...prev, [key]: message }));
        toast.error(message);
        throw error;
      } finally {
        setLoading(key, false);
      }
    },
    [prepareBag, prepareSourceBag, refreshBagState, setLoading, sourceKey, toast],
  );

  const getStatus = useCallback(
    (productId: string) => statusByProductId[productId] ?? null,
    [statusByProductId],
  );

  const getSourceStatus = useCallback(
    (sourceType: BagSourceType, sourceId: string) => statusBySourceKey[sourceKey(sourceType, sourceId)] ?? null,
    [sourceKey, statusBySourceKey],
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
      if (bagFlow) {
        bagFlow.openSelector(product, status);
      } else {
        callbacks.onOpenSelector?.(status, product);
      }
      return status;
    },
    [bagFlow, prepareBag],
  );

  const beginCustomFlow = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks = {}) => {
      if (authStatus !== 'authenticated') {
        if (bagFlow) {
          const resume = () => {
            void beginCustomFlow(product, callbacks);
          };
          bagFlow.openAuthPrompt(product, 'OPEN_CUSTOM_FLOW', resume);
        } else {
          callbacks.onRequireAuth?.(product, 'OPEN_CUSTOM_FLOW');
        }
        toast.info('Please sign in to bag items.');
        return null;
      }
      const status = await prepareBag(product.id);
      if (status.custom.alreadyBagged) {
        if (bagFlow) {
          bagFlow.openExistingBag(product, status);
        } else {
          callbacks.onOpenExistingBag?.(status, product);
        }
        return status;
      }
      if (!status.custom.available) {
        toast.error(status.ui.disabledReason || 'This product is not configured for custom bagging yet.');
        return status;
      }
      if (status.custom.fittingState === 'MISSING' || status.custom.fittingState === 'PARTIAL') {
        if (bagFlow) {
          bagFlow.openFittings(product, status);
        } else {
          callbacks.onOpenFittings?.(status, product);
        }
        return status;
      }
      if (status.ui.defaultAction === 'CONFIRM_STALE_FITTINGS' || status.custom.requiresStaleConfirmation || status.custom.freshnessState === 'STALE') {
        if (bagFlow) {
          bagFlow.openStaleFittings(product, status);
        } else {
          callbacks.onOpenCustomFlow?.(status, product);
        }
        return status;
      }
      if (bagFlow) {
        bagFlow.openCustomFlow(product, status);
      } else {
        callbacks.onOpenCustomFlow?.(status, product);
      }
      return status;
    },
    [authStatus, bagFlow, prepareBag, toast],
  );

  const beginFittingsFlow = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks = {}) => {
      const status = await prepareBag(product.id);
      if (bagFlow) {
        bagFlow.openFittings(product, status);
      } else {
        callbacks.onOpenFittings?.(status, product);
      }
      return status;
    },
    [bagFlow, prepareBag],
  );

  const bagProduct = useCallback(
    async (product: BagProductInput, callbacks: BagInteractionCallbacks & BagFlowBagOptions = {}) => {
      if (authStatus !== 'authenticated') {
        if (callbacks.suppressAuthPrompt) return null;
        if (bagFlow) {
          const resume = () => {
            void bagProduct(product, { ...callbacks, suppressAuthPrompt: true });
          };
          bagFlow.openAuthPrompt(product, 'DISABLED', resume);
        } else {
          callbacks.onRequireAuth?.(product, 'DISABLED');
        }
        toast.info('Please sign in to bag items.');
        return null;
      }

      const status = await prepareBag(product.id);

      if (status.standard.inBag || status.custom.alreadyBagged) {
        if (bagFlow) {
          bagFlow.openExistingBag(product, status);
        } else {
          callbacks.onOpenExistingBag?.(status, product);
        }
        return { action: status.ui.defaultAction, status };
      }

      if (!status.canBag || status.ui.defaultAction === 'DISABLED') {
        toast.error(status.ui.disabledReason || 'This product cannot be bagged.');
        return { action: 'DISABLED' as const, status };
      }

      if (status.ui.defaultAction === 'ADD_STANDARD') {
        await addStandard({ productId: product.id, qty: 1 });
        toast.success('Added to your bag');
        return { action: 'ADD_STANDARD' as const, status };
      }

      if (status.ui.defaultAction === 'OPEN_SELECTOR') {
        if (bagFlow) {
          bagFlow.openSelector(product, status);
        } else {
          callbacks.onOpenSelector?.(status, product);
        }
        return { action: 'OPEN_SELECTOR' as const, status };
      }

      if (status.ui.defaultAction === 'OPEN_FITTINGS') {
        if (bagFlow) {
          bagFlow.openFittings(product, status);
        } else {
          callbacks.onOpenFittings?.(status, product);
        }
        return { action: 'OPEN_FITTINGS' as const, status };
      }

      if (status.ui.defaultAction === 'CONFIRM_STALE_FITTINGS') {
        if (bagFlow) {
          bagFlow.openStaleFittings(product, status);
        } else {
          callbacks.onOpenCustomFlow?.(status, product);
        }
        return { action: 'CONFIRM_STALE_FITTINGS' as const, status };
      }

      if (!status.custom.available) {
        toast.error(status.ui.disabledReason || 'This product is not configured for custom bagging yet.');
        return { action: 'DISABLED' as const, status };
      }

      if (bagFlow) {
        bagFlow.openCustomFlow(product, status);
      } else {
        callbacks.onOpenCustomFlow?.(status, product);
      }
      return { action: 'OPEN_CUSTOM_FLOW' as const, status };
    },
    [addStandard, authStatus, bagFlow, prepareBag, toast],
  );

  const bagSource = useCallback(
    async (
      source: { sourceType: BagSourceType; sourceId: string; name?: string },
      callbacks: BagInteractionCallbacks & BagFlowBagOptions = {},
    ) => {
      const product = {
        id: source.sourceId,
        name: source.name,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      };

      if (authStatus !== 'authenticated') {
        if (callbacks.suppressAuthPrompt) return null;
        if (bagFlow) {
          const resume = () => {
            void bagSource(source, { ...callbacks, suppressAuthPrompt: true });
          };
          bagFlow.openAuthPrompt(product, 'DISABLED', resume);
        } else {
          callbacks.onRequireAuth?.(product, 'DISABLED');
        }
        toast.info('Please sign in to bag items.');
        return null;
      }

      const status = await prepareSourceBag(source.sourceType, source.sourceId);

      if (status.standard.inBag || status.custom.alreadyBagged) {
        if (bagFlow) {
          bagFlow.openExistingBag(product, status);
        } else {
          callbacks.onOpenExistingBag?.(status, product);
        }
        return { action: status.ui.defaultAction, status };
      }

      if (!status.canBag || status.ui.defaultAction === 'DISABLED') {
        if (status.ui.disabledReason) {
          toast.info(status.ui.disabledReason);
        }
        return { action: 'DISABLED' as const, status };
      }

      if (status.ui.defaultAction === 'ADD_STANDARD') {
        if (source.sourceType !== 'PRODUCT') {
          toast.error('This design is not available for standard bagging.');
          return { action: 'DISABLED' as const, status };
        }
        await addStandard({ productId: source.sourceId, qty: 1 });
        toast.success('Added to your bag');
        return { action: 'ADD_STANDARD' as const, status };
      }

      if (status.ui.defaultAction === 'OPEN_SELECTOR') {
        if (source.sourceType !== 'PRODUCT') {
          toast.error('This design is not available for standard bagging.');
          return { action: 'DISABLED' as const, status };
        }
        if (bagFlow) {
          bagFlow.openSelector(product, status);
        } else {
          callbacks.onOpenSelector?.(status, product);
        }
        return { action: 'OPEN_SELECTOR' as const, status };
      }

      if (status.ui.defaultAction === 'OPEN_FITTINGS') {
        if (bagFlow) {
          bagFlow.openFittings(product, status);
        } else {
          callbacks.onOpenFittings?.(status, product);
        }
        return { action: 'OPEN_FITTINGS' as const, status };
      }

      if (status.ui.defaultAction === 'CONFIRM_STALE_FITTINGS') {
        if (bagFlow) {
          bagFlow.openStaleFittings(product, status);
        } else {
          callbacks.onOpenCustomFlow?.(status, product);
        }
        return { action: 'CONFIRM_STALE_FITTINGS' as const, status };
      }

      if (!status.custom.available) {
        toast.error(status.ui.disabledReason || 'This source is not configured for custom bagging yet.');
        return { action: 'DISABLED' as const, status };
      }

      if (bagFlow) {
        bagFlow.openCustomFlow(product, status);
      } else {
        callbacks.onOpenCustomFlow?.(status, product);
      }
      return { action: 'OPEN_CUSTOM_FLOW' as const, status };
    },
    [addStandard, authStatus, bagFlow, prepareSourceBag, toast],
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
    const standardCount = globalBagCount.standardQuantity ?? standardCart?.totalQuantity ?? 0;
    const customCount = globalBagCount.customLineCount ?? customBag?.total ?? 0;
    return {
      standardCount,
      customCount,
      combinedCount: globalBagCount.combinedCount ?? standardCount + customCount,
      standardQuantity: standardCount,
      customLineCount: customCount,
    };
  }, [customBag?.total, globalBagCount, standardCart?.totalQuantity]);

  return {
    standardCart,
    customBag,
    counts,
    statusByProductId,
    statusBySourceKey,
    loadingByProductId,
    errorByProductId,
    refreshBagState,
    refreshGlobalBagCount,
    prepareBag,
    prepareSourceBag,
    addStandard,
    addCustomOrder,
    clearBagStatus,
    getStatus,
    getSourceStatus,
    getBagAction,
    getPulseStatus,
    beginSelectorFlow,
    beginCustomFlow,
    beginFittingsFlow,
    bagProduct,
    bagSource,
  };
}

export default useMobileBagging;
