import React, {
  useCallback,
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
import MyBagSheet from '@/components/bagging/MyBagSheet';
import StaleFittingConfirmationSheet from '@/components/bagging/StaleFittingConfirmationSheet';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import { baggingService } from '@/src/services/bagging';
import type { BagSourceType } from '@/src/api/StoreApi';
import { BagFlowContext } from '@/src/features/bagging/BagFlowContext';
import type { BagFlowProductInput } from '@/src/features/bagging/BagFlowContext';

export { useBagFlow } from '@/src/features/bagging/BagFlowContext';

type BagProductInput = BagFlowProductInput;

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
  sourceType?: BagSourceType;
  sourceId?: string;
  intendedAction: BagDefaultAction;
  returnPath: string;
};

const PENDING_BAG_ACTION_KEY = 'threadly.pendingBagAction.v1';

export function BagFlowProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status: authStatus } = useAuth();
  const toast = useToast();
  const { refreshGlobalBagCount } = useBagCount();

  const [selectorTarget, setSelectorTarget] = useState<BagFlowTarget | null>(null);
  const [customTarget, setCustomTarget] = useState<BagFlowTarget | null>(null);
  const [fittingsTarget, setFittingsTarget] = useState<BagFlowTarget | null>(null);
  const [staleTarget, setStaleTarget] = useState<BagFlowTarget | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<BagFlowTarget | null>(null);
  const [myBagVisible, setMyBagVisible] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthResume | null>(null);

  const pendingResumeRef = useRef<PendingAuthResume | null>(null);

  const closeActiveFlow = useCallback(() => {
    setSelectorTarget(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setStaleTarget(null);
    setSummaryTarget(null);
    setMyBagVisible(false);
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
      setStaleTarget(null);
      setSummaryTarget(null);
      setMyBagVisible(false);

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
        if ((status.sourceType ?? product.sourceType ?? 'PRODUCT') !== 'PRODUCT') {
          toast.error('This design is not available for standard bagging.');
          return;
        }
        await baggingService.addStandard({ productId: product.id, qty: 1 });
        const nextStatus = await baggingService.prepareBag(product.id);
        await refreshGlobalBagCount({ forceRefresh: true });
        toast.success('Added to your bag');
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

      if (
        action === 'CONFIRM_STALE_FITTINGS' ||
        status.custom.freshnessState === 'STALE' ||
        status.custom.freshnessState === 'VERY_STALE' ||
        status.custom.requiresStaleConfirmation
      ) {
        setStaleTarget({ product, status });
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
    [refreshGlobalBagCount, toast],
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
      sourceType: pending.sourceType,
      sourceId: pending.sourceId,
    };
    const status = pending.sourceType && pending.sourceId && pending.sourceType !== 'PRODUCT'
      ? await baggingService.prepareSourceBag(pending.sourceType, pending.sourceId)
      : await baggingService.prepareBag(pending.productId);
    await routeResolvedStatus(product, status, pending.intendedAction);
    return true;
  }, [routeResolvedStatus]);

  const openSelector = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setStaleTarget(null);
    setSummaryTarget(null);
    setMyBagVisible(false);
    setSelectorTarget({ product, status });
  }, []);

  const openCustomFlow = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setFittingsTarget(null);
    setStaleTarget(null);
    setSummaryTarget(null);
    setMyBagVisible(false);

    if (!status.custom.available || !status.custom.configurationId) {
      toast.error(status.ui.disabledReason || 'This product is not configured for custom bagging yet.');
      return;
    }
    if (status.custom.fittingState === 'MISSING' || status.custom.fittingState === 'PARTIAL') {
      setFittingsTarget({ product, status });
      return;
    }
    if (
      status.custom.freshnessState === 'STALE' ||
      status.custom.freshnessState === 'VERY_STALE' ||
      status.custom.requiresStaleConfirmation
    ) {
      setStaleTarget({ product, status });
      return;
    }

    setCustomTarget({ product, status });
  }, [toast]);

  const openFittings = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setCustomTarget(null);
    setStaleTarget(null);
    setSummaryTarget(null);
    setMyBagVisible(false);
    setFittingsTarget({ product, status });
  }, []);

  const openStaleFittings = useCallback((product: BagProductInput, status: ProductBagStatus) => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setSummaryTarget(null);
    setMyBagVisible(false);
    setStaleTarget({ product, status });
  }, []);

  const openAuthPrompt = useCallback(
    (product: BagProductInput, action: BagDefaultAction, resume?: () => void | Promise<void>) => {
      setSelectorTarget(null);
      setCustomTarget(null);
      setFittingsTarget(null);
      setStaleTarget(null);
      setSummaryTarget(null);
      setMyBagVisible(false);
      const nextPending = { product, action, returnPath: pathname, resume };
      setPendingAuth(nextPending);
      pendingResumeRef.current = nextPending;
      const serialized: PendingBagAction = {
        productId: product.id,
        productName: product.name,
        sourceType: product.sourceType,
        sourceId: product.sourceId,
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
    setStaleTarget(null);
    setSummaryTarget({ product, status });
    setMyBagVisible(false);
  }, []);

  const openMyBag = useCallback(() => {
    setPendingAuth(null);
    setSelectorTarget(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setStaleTarget(null);
    setSummaryTarget(null);
    setMyBagVisible(true);
    void refreshGlobalBagCount();
  }, [refreshGlobalBagCount]);

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
      openStaleFittings,
      openAuthPrompt,
      openExistingBag,
      openMyBag,
      closeActiveFlow,
    }),
    [closeActiveFlow, openAuthPrompt, openCustomFlow, openExistingBag, openFittings, openMyBag, openSelector, openStaleFittings],
  );

  return (
    <BagFlowContext.Provider value={value}>
      {children}

      <ProductBagSelectorSheet
        visible={Boolean(selectorTarget)}
        product={selectorTarget?.product ?? null}
        status={selectorTarget?.status ?? null}
        onClose={closeActiveFlow}
        onRequireFittings={(product, status) => {
          setSelectorTarget(null);
          setFittingsTarget({ product, status });
        }}
        onRequireStaleConfirmation={(product, status) => {
          setSelectorTarget(null);
          setStaleTarget({ product, status });
        }}
      />

      <BagFittingsSheet
        visible={Boolean(fittingsTarget)}
        product={fittingsTarget?.product ?? null}
        status={fittingsTarget?.status ?? null}
        onClose={closeActiveFlow}
        onResolved={(nextStatus) => {
          if (!fittingsTarget) return;
          void routeResolvedStatus(fittingsTarget.product, nextStatus);
        }}
      />

      <StaleFittingConfirmationSheet
        visible={Boolean(staleTarget)}
        product={staleTarget?.product ?? null}
        status={staleTarget?.status ?? null}
        onClose={closeActiveFlow}
        onUpdateFittings={() => {
          if (!staleTarget) return;
          setStaleTarget(null);
          setFittingsTarget(staleTarget);
        }}
        onContinue={() => {
          if (!staleTarget) return;
          const target = staleTarget;
          setStaleTarget(null);
          if (target.status.standard.enabled && !target.status.custom.configurationId) {
            void baggingService
              .addStandard({
                productId: target.product.id,
                qty: target.product.quantity ?? 1,
                size: target.product.selectedSize ?? undefined,
                color: target.product.selectedColor ?? undefined,
                measurementOverrideAccepted: true,
              })
              .then(async () => {
                await refreshGlobalBagCount({ forceRefresh: true });
                toast.success('Added to your bag');
                setSummaryTarget({ product: target.product, status: target.status });
              })
              .catch((error) => {
                const message =
                  error instanceof Error && error.message.trim()
                    ? error.message
                    : 'Unable to bag with saved fittings.';
                toast.error(message);
              });
            return;
          }
          setCustomTarget(target);
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

      <MyBagSheet
        visible={myBagVisible}
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
