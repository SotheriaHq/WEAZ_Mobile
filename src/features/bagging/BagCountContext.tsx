import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import type { BagCount } from '@/src/api/StoreApi';
import { baggingService } from '@/src/services/bagging';

const EMPTY_BAG_COUNT: BagCount = {
  standardQuantity: 0,
  customLineCount: 0,
  combinedCount: 0,
};

type BagCountContextValue = {
  count: BagCount;
  loading: boolean;
  refreshGlobalBagCount: () => Promise<BagCount>;
};

const BagCountContext = createContext<BagCountContextValue | null>(null);

export function BagCountProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [count, setCount] = useState<BagCount>(EMPTY_BAG_COUNT);
  const [loading, setLoading] = useState(false);
  const inflightRefreshRef = useRef<Promise<BagCount> | null>(null);

  const refreshGlobalBagCount = useCallback(async () => {
    if (status !== 'authenticated') {
      inflightRefreshRef.current = null;
      setCount(EMPTY_BAG_COUNT);
      return EMPTY_BAG_COUNT;
    }

    if (inflightRefreshRef.current) {
      return inflightRefreshRef.current;
    }

    setLoading(true);
    const request = (async () => {
      try {
        const nextCount = await baggingService.getBagCount();
        setCount(nextCount);
        return nextCount;
      } catch {
        setCount(EMPTY_BAG_COUNT);
        return EMPTY_BAG_COUNT;
      }
    })();

    inflightRefreshRef.current = request;
    void request.finally(() => {
      if (inflightRefreshRef.current === request) {
        inflightRefreshRef.current = null;
        setLoading(false);
      }
    });

    return request;
  }, [status]);

  useEffect(() => {
    void refreshGlobalBagCount();
  }, [refreshGlobalBagCount, user?.id]);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshGlobalBagCount();
      }
    });

    return () => subscription.remove();
  }, [refreshGlobalBagCount, status]);

  const value = useMemo(
    () => ({
      count,
      loading,
      refreshGlobalBagCount,
    }),
    [count, loading, refreshGlobalBagCount],
  );

  return <BagCountContext.Provider value={value}>{children}</BagCountContext.Provider>;
}

export function useBagCount() {
  const context = useContext(BagCountContext);
  if (!context) {
    return {
      count: EMPTY_BAG_COUNT,
      loading: false,
      refreshGlobalBagCount: async () => EMPTY_BAG_COUNT,
    };
  }
  return context;
}
