import { useCallback, useState } from 'react';

import type { ProductBagStatus } from '@/src/api/StoreApi';
import { baggingService } from '@/src/services/bagging';

export function useProductBagging() {
  const [statusByProductId, setStatusByProductId] = useState<Record<string, ProductBagStatus>>({});
  const [loadingByProductId, setLoadingByProductId] = useState<Record<string, boolean>>({});

  const setLoading = useCallback((productId: string, loading: boolean) => {
    setLoadingByProductId((prev) => {
      const next = { ...prev };
      if (loading) {
        next[productId] = true;
      } else {
        delete next[productId];
      }
      return next;
    });
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

  const clearBagStatus = useCallback((productId: string) => {
    setStatusByProductId((prev) => {
      if (!prev[productId]) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  return {
    prepareBag,
    clearBagStatus,
    statusByProductId,
    loadingByProductId,
  };
}

export default useProductBagging;
