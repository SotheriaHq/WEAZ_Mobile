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
  resume?: () => void | Promise<void>;
};

type BagDefaultAction = ProductBagStatus['ui']['defaultAction'];

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

  useEffect(() => {
    pendingResumeRef.current = pendingAuth;
  }, [pendingAuth]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const resume = pendingResumeRef.current;
    if (!resume?.resume) return;

    pendingResumeRef.current = null;
    setPendingAuth(null);
    void Promise.resolve(resume.resume()).catch(() => undefined);
  }, [authStatus]);

  const closeActiveFlow = useCallback(() => {
    setSelectorTarget(null);
    setCustomTarget(null);
    setFittingsTarget(null);
    setSummaryTarget(null);
    setPendingAuth(null);
  }, []);

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

    if (!status.custom.configurationId) {
      toast.error(status.ui.disabledReason || 'This product is not configured for custom bagging yet.');
      return;
    }

    setCustomTarget({ product, status });
    router.push({ pathname: '/products/[productId]', params: { productId: product.id } });
  }, []);

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
      setPendingAuth({ product, action, resume });
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

  const customSheetTarget = customTarget?.status.custom.configurationId ? customTarget : null;

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
        onContinue={() => {
          if (!fittingsTarget) return;
          openCustomFlow(fittingsTarget.product, fittingsTarget.status);
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
