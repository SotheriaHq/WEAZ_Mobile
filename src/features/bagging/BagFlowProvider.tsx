import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { router, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import type { ProductBagStatus } from '@/src/api/StoreApi';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import ProductBagSelectorSheet from '@/components/bagging/ProductBagSelectorSheet';
import BagFittingsSheet from '@/components/bagging/BagFittingsSheet';
import BagSummarySheet from '@/components/bagging/BagSummarySheet';
import CustomBagSheet from '@/components/bagging/CustomBagSheet';
import { baggingService } from '@/src/services/bagging';

type BagProductInput = {
  id: string;
  name?: string;
};

type BagFlowTarget = {
  product: BagProductInput;
  status: ProductBagStatus;
};

type PendingAuthResume = {
  product: BagProductInput;
  action: BagDefaultAction;
  returnPath: string;
  resume?: () => void | Promise<void>;
};

type BagDefaultAction = ProductBagStatus['ui']['defaultAction'];

type PendingBagAction = {
  productId: string;
  productName?: string;
  intendedAction: BagDefaultAction;
  returnPath: string;
};

const PENDING_BAG_ACTION_KEY = 'threadly.pendingBagAction.v1';

type BagFlowContextValue = {
  openSelector: (product: BagProductInput, status: ProductBagStatus) => void;
  openCustomFlow: (product: BagProductInput, status: ProductBagStatus) => void;
  openFittings: (product: BagProductInput, status: ProductBagStatus) => void;
  openAuthPrompt: (
    product: BagProductInput,
    action: BagDefaultAction,
    resume?: () => void | Promise<void>,
  ) => void;
  openExistingBag: (product: BagProductInput, status: ProductBagStatus) => void;
  closeActiveFlow: () => void;
};

const BagFlowContext = createContext<BagFlowContextValue | null>(null);

export function useBagFlow() {
  return useContext(BagFlowContext);
}

export function BagFlowProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status: authStatus } = useAuth();
  const toast = useToast();

  const [selectorTarget, setSelectorTarget] = useState<BagFlowTarget | null>(null);
  const [customTarget, setCustomTarget] = useState<BagFlowTarget | null>(null);
  const [fittingsTarget, setFittingsTarget] = useState<BagFlowTarget | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<BagFlowTarget | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthResume | null>(null);

  const pendingResumeRef = useRef<PendingAuthResume | null>(null);

  const closeActiveFlow = useCallback(() => {
    setSelectorTarget(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setSummaryTarget(null);
    setPendingAuth(null);
    pendingResumeRef.current = null;
    void SecureStore.deleteItemAsync(PENDING_BAG_ACTION_KEY).catch(() => undefined);
  }, []);

  const routeResolvedStatus = useCallback(
    async (
      product: BagProductInput,
      status: ProductBagStatus,
      intendedAction?: BagDefaultAction,
    ) => {
      setPendingAuth(null);
      setSelectorTarget(null);
      setCustomTarget(null);
      setFittingsTarget(null);
      setSummaryTarget(null);

      if (status.standard.inBag || status.custom.alreadyBagged) {
        setSummaryTarget({ product, status });
        return;
      }

      const action = intendedAction && intendedAction !== 'DISABLED'
        ? intendedAction
        : status.ui.defaultAction;

      if (!status.canBag || action === 'DISABLED') {
        toast.error(status.ui.disabledReason || 'This product cannot be bagged.');
        return;
      }

      if (action === 'ADD_STANDARD') {
        await baggingService.addStandard({ productId: product.id, qty: 1 });
        const nextStatus = await baggingService.prepareBag(product.id);
        toast.success('Bagged.');
        setSummaryTarget({ product, status: nextStatus });
        return;
      }

      if (action === 'OPEN_SELECTOR') {
        setSelectorTarget({ product, status });
        return;
      }

      if (action === 'OPEN_FITTINGS') {
        setFittingsTarget({ product, status });
        return;
      }

      if (action === 'OPEN_CUSTOM_FLOW') {
        if (!status.custom.available || !status.custom.configurationId) {
          toast.error(status.ui.disabledReason || 'This product is not configured for custom bagging yet.');
          return;
        }
        if (status.custom.fittingState === 'MISSING' || status.custom.fittingState === 'PARTIAL') {
          setFittingsTarget({ product, status });
          return;
        }
        setCustomTarget({ product, status });
      }
    },
    [toast],
  );

  const resumePersistedBagAction = useCallback(async () => {
    const serialized = await SecureStore.getItemAsync(PENDING_BAG_ACTION_KEY);
    if (!serialized) return false;

    let pending: PendingBagAction | null = null;
    try {
      pending = JSON.parse(serialized) as PendingBagAction;
    } catch {
      await SecureStore.deleteItemAsync(PENDING_BAG_ACTION_KEY);
      return false;
    }

    if (!pending?.productId) {
      await SecureStore.deleteItemAsync(PENDING_BAG_ACTION_KEY);
      return false;
    }

    await SecureStore.deleteItemAsync(PENDING_BAG_ACTION_KEY);
    const product = {
      id: pending.productId,
      name: pending.productName,
    };
    const status = await baggingService.prepareBag(pending.productId);
    await routeResolvedStatus(product, status, pending.intendedAction);
    return true;
  }, [routeResolvedStatus]);

  const openSelector = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setSummaryTarget(null);
    setSelectorTarget({ product, status });
  }, []);

  const openCustomFlow = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setFittingsTarget(null);
    setSummaryTarget(null);

    if (!status.custom.available || !status.custom.configurationId) {
      toast.error(status.ui.disabledReason || 'This product is not configured for custom bagging yet.');
      return;
    }
    if (status.custom.fittingState === 'MISSING' || status.custom.fittingState === 'PARTIAL') {
      setFittingsTarget({ product, status });
      return;
    }

    setCustomTarget({ product, status });
  }, [toast]);

  const openFittings = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setCustomTarget(null);
    setSummaryTarget(null);
    setFittingsTarget({ product, status });
  }, []);

  const openAuthPrompt = useCallback(
    (product: BagProductInput, action: BagDefaultAction, resume?: () => void | Promise<void>) => {
      setSelectorTarget(null);
      setCustomTarget(null);
      setFittingsTarget(null);
      setSummaryTarget(null);
      const nextPending = { product, action, returnPath: pathname, resume };
      setPendingAuth(nextPending);
      pendingResumeRef.current = nextPending;
      const serialized: PendingBagAction = {
        productId: product.id,
        productName: product.name,
        intendedAction: action,
        returnPath: pathname,
      };
      void SecureStore.setItemAsync(PENDING_BAG_ACTION_KEY, JSON.stringify(serialized)).catch(() => undefined);
      toast.info('Please sign in to bag items.');
    },
    [pathname, toast],
  );

  const openExistingBag = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setSummaryTarget({ product, status });
  }, []);

  useEffect(() => {
    pendingResumeRef.current = pendingAuth;
  }, [pendingAuth]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    const resume = pendingResumeRef.current;
    pendingResumeRef.current = null;
    setPendingAuth(null);

    void resumePersistedBagAction()
      .then((handled) => {
        if (!handled && resume?.resume) {
          return Promise.resolve(resume.resume());
        }
        return undefined;
      })
      .catch(() => undefined);
  }, [authStatus, resumePersistedBagAction]);

  const value = useMemo(
    () => ({
      openSelector,
      openCustomFlow,
      openFittings,
      openAuthPrompt,
      openExistingBag,
      closeActiveFlow,
    }),
    [closeActiveFlow, openAuthPrompt, openCustomFlow, openExistingBag, openFittings, openSelector],
  );

  return (
    <BagFlowContext.Provider value={value}>
      {children}

      <ProductBagSelectorSheet
        visible={Boolean(selectorTarget)}
        product={selectorTarget?.product ?? null}
        status={selectorTarget?.status ?? null}
        onClose={closeActiveFlow}
      />

      <BagFittingsSheet
        visible={Boolean(fittingsTarget)}
        product={fittingsTarget?.product ?? null}
        status={fittingsTarget?.status ?? null}
        onClose={closeActiveFlow}
        onResolved={(nextStatus) => {
          if (!fittingsTarget) return;
          void routeResolvedStatus(fittingsTarget.product, nextStatus, 'OPEN_CUSTOM_FLOW');
        }}
      />

      <CustomBagSheet
        visible={Boolean(customTarget)}
        product={customTarget?.product ?? null}
        status={customTarget?.status ?? null}
        onClose={closeActiveFlow}
        onCompleted={(nextStatus) => {
          if (!customTarget) return;
          setCustomTarget(null);
          setSummaryTarget({ product: customTarget.product, status: nextStatus });
        }}
      />

      <BagSummarySheet
        visible={Boolean(summaryTarget)}
        product={summaryTarget?.product ?? null}
        status={summaryTarget?.status ?? null}
        onClose={closeActiveFlow}
      />

      <AppBottomSheet
        visible={Boolean(pendingAuth)}
        title="Sign in to continue bagging"
        subtitle={pendingAuth ? `${pendingAuth.product.name || 'This item'} needs your account so we can save it to your bag.` : undefined}
        onClose={closeActiveFlow}
        showCloseButton
        scrollable={false}
        footer={
          <View style={styles.authFooter}>
            <Button
              title="Sign in"
              onPress={() => {
                router.push({
                  pathname: '/login',
                  params: {
                    reason: 'auth_required',
                    next: pathname,
                  },
                });
              }}
            />
            <Button
              title="Create account"
              variant="secondary"
              onPress={() => {
                router.push({
                  pathname: '/signup',
                  params: {
                    reason: 'auth_required',
                    next: pathname,
                  },
                });
              }}
            />
            <AppText variant="caption" tone="muted">
              Your bag action will continue automatically after you sign in.
            </AppText>
          </View>
        }
      >
        <View style={styles.authBody}>
          <AppText variant="body">{pendingAuth?.product.name || 'This item'} will wait here until you finish signing in.</AppText>
        </View>
      </AppBottomSheet>
    </BagFlowContext.Provider>
  );
}

export default BagFlowProvider;

const styles = StyleSheet.create({
  authBody: {
    gap: 12,
  },
  authFooter: {
    gap: 10,
  },
});
