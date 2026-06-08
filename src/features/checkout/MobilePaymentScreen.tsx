import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  paymentApi,
  type PaymentAttemptStatus,
  type PaymentAttemptSummary,
  type PaymentVerifyResult,
} from '@/src/api/PaymentApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import {
  clearPendingMobileCheckout,
  loadPendingMobileCheckout,
} from '@/src/features/checkout/mobileCheckoutPending';
import { queryClient } from '@/src/query/queryClient';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type ScreenState = 'loading' | 'ready' | 'opening' | 'verifying' | 'resolved' | 'missing';

const terminalStatuses = new Set<PaymentAttemptStatus>([
  'PAID',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function statusTone(status?: PaymentAttemptStatus): 'success' | 'danger' | 'warning' | 'muted' {
  if (status === 'PAID') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') return 'danger';
  if (status === 'PROCESSING' || status === 'PENDING' || status === 'REQUIRES_ACTION') return 'warning';
  return 'muted';
}

function statusCopy(status?: PaymentAttemptStatus) {
  switch (status) {
    case 'PAID':
      return 'Payment verified. Your order state will be available from Orders after refetch.';
    case 'FAILED':
      return 'Payment failed. Your bag is still saved so you can retry.';
    case 'CANCELLED':
      return 'Payment was cancelled. Your bag is still saved so you can retry.';
    case 'EXPIRED':
      return 'This payment session expired. Return to checkout to start a fresh attempt.';
    case 'PROCESSING':
    case 'PENDING':
      return 'Payment is still pending. WEAZ will keep checking with the backend.';
    case 'REQUIRES_ACTION':
      return 'Complete the secure provider step, then return here for backend verification.';
    default:
      return 'WEAZ is checking the latest backend payment state.';
  }
}

export function MobilePaymentScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const { status: authStatus } = useAuth();
  const { refreshGlobalBagCount } = useBagCount();
  const params = useLocalSearchParams<{
    reference?: string;
    gateway?: string;
    status?: string;
    open?: string;
  }>();
  const [reference, setReference] = useState(() => firstParam(params.reference));
  const [gateway, setGateway] = useState(() => firstParam(params.gateway) || 'PAYSTACK');
  const [state, setState] = useState<ScreenState>('loading');
  const [attempt, setAttempt] = useState<PaymentAttemptSummary | null>(null);
  const [verifyResult, setVerifyResult] = useState<PaymentVerifyResult | null>(null);
  const [message, setMessage] = useState('Loading payment attempt...');
  const openedRef = useRef(false);
  const verifyingRef = useRef(false);

  const resolvedStatus =
    verifyResult?.status ?? attempt?.status ?? undefined;
  const canOpenProvider = Boolean(attempt?.authorizationUrl);
  const shouldAutoOpen = firstParam(params.open) === '1';

  const loadAttempt = useCallback(
    async (nextReference = reference) => {
      const normalizedReference = nextReference.trim();
      if (!normalizedReference) {
        const pending = await loadPendingMobileCheckout();
        if (pending?.reference) {
          setReference(pending.reference);
          setGateway(pending.gateway || 'PAYSTACK');
          return loadAttempt(pending.reference);
        }
        setState('missing');
        setMessage('WEAZ could not find a payment reference to verify.');
        return null;
      }

      setState((current) => (current === 'opening' ? current : 'loading'));
      try {
        const summary = await paymentApi.getAttempt(normalizedReference);
        setAttempt(summary);
        setGateway(summary.gateway || gateway || 'PAYSTACK');
        setState('ready');
        setMessage(statusCopy(summary.status));
        return summary;
      } catch (error) {
        const responseMessage =
          (error as { response?: { data?: { message?: string } } })?.response?.data
            ?.message;
        setState('missing');
        setMessage(responseMessage || 'Unable to load payment attempt.');
        return null;
      }
    },
    [gateway, reference],
  );

  const refreshLifecycleState = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['store'] });
    queryClient.invalidateQueries({ queryKey: ['saved'] });
    await refreshGlobalBagCount({ forceRefresh: true });
  }, [refreshGlobalBagCount]);

  const verifyAttempt = useCallback(
    async (statusHint?: string) => {
      const normalizedReference = reference.trim();
      const normalizedGateway = (gateway || attempt?.gateway || 'PAYSTACK').trim();
      if (!normalizedReference || !normalizedGateway || verifyingRef.current) {
        return null;
      }

      verifyingRef.current = true;
      setState('verifying');
      setMessage('Verifying latest backend payment status...');
      try {
        const result = await paymentApi.verifyWithStatus(
          normalizedReference,
          normalizedGateway,
          statusHint,
        );
        setVerifyResult(result);
        const summary = await paymentApi.getAttempt(normalizedReference).catch(() => null);
        if (summary) {
          setAttempt(summary);
        }
        const finalStatus = result.status ?? summary?.status;
        setMessage(statusCopy(finalStatus));
        setState('resolved');

        if (finalStatus === 'PAID') {
          await clearPendingMobileCheckout();
          await refreshLifecycleState();
          toast.success('Payment verified.');
        } else if (terminalStatuses.has(finalStatus as PaymentAttemptStatus)) {
          await refreshLifecycleState();
        }
        return result;
      } catch (error) {
        const responseMessage =
          (error as { response?: { data?: { message?: string } } })?.response?.data
            ?.message;
        setMessage(responseMessage || 'Unable to verify payment right now.');
        setState('ready');
        return null;
      } finally {
        verifyingRef.current = false;
      }
    },
    [attempt?.gateway, gateway, reference, refreshLifecycleState, toast],
  );

  const openProviderCheckout = useCallback(async () => {
    const summary = attempt ?? (await loadAttempt());
    const authorizationUrl = summary?.authorizationUrl?.trim();
    if (!authorizationUrl) {
      setMessage('This payment attempt does not have a secure provider URL. Start checkout again.');
      return;
    }

    setState('opening');
    setMessage('Opening secure provider checkout...');
    try {
      await WebBrowser.openBrowserAsync(authorizationUrl);
      setMessage('Secure checkout closed. Verifying latest backend status...');
      await verifyAttempt();
    } catch {
      setMessage('Secure checkout could not be opened. You can retry from this screen.');
      setState('ready');
    }
  }, [attempt, loadAttempt, verifyAttempt]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      setState('missing');
      setMessage('Sign in before verifying payment.');
      return;
    }
    if (authStatus === 'loading') {
      return;
    }
    void loadAttempt();
  }, [authStatus, loadAttempt]);

  useEffect(() => {
    if (!shouldAutoOpen || openedRef.current || !attempt?.authorizationUrl) {
      return;
    }
    openedRef.current = true;
    void openProviderCheckout();
  }, [attempt?.authorizationUrl, openProviderCheckout, shouldAutoOpen]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState === 'active' &&
        reference &&
        attempt &&
        !terminalStatuses.has(attempt.status)
      ) {
        void verifyAttempt();
      }
    });
    return () => subscription.remove();
  }, [attempt, reference, verifyAttempt]);

  const amountLabel = useMemo(() => {
    const amount = attempt?.summary?.grandTotal ?? verifyResult?.amount ?? null;
    const currency = attempt?.currency ?? verifyResult?.currency ?? 'NGN';
    if (amount == null) {
      return null;
    }
    return `${currency} ${Number(amount).toLocaleString()}`;
  }, [attempt?.currency, attempt?.summary?.grandTotal, verifyResult?.amount, verifyResult?.currency]);

  return (
    <>
      <Stack.Screen options={{ title: 'Payment' }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <AppText variant="title">Payment verification</AppText>
            <AppText variant="body" tone="muted">
              WEAZ verifies this payment against the backend and provider before updating any order state.
            </AppText>
            {reference ? (
              <AppText variant="caption" tone="muted">
                Reference: {reference}
              </AppText>
            ) : null}
            {amountLabel ? (
              <AppText variant="subtitle">{amountLabel}</AppText>
            ) : null}
            <AppText variant="bodyBold" tone={statusTone(resolvedStatus)}>
              {resolvedStatus ?? state.toUpperCase()}
            </AppText>
            <AppText variant="body" tone="muted">
              {message}
            </AppText>
          </Card>

          <Card style={styles.card}>
            <AppText variant="subtitle">Next step</AppText>
            {canOpenProvider && resolvedStatus !== 'PAID' ? (
              <Button
                title={state === 'opening' ? 'Opening...' : 'Open secure payment'}
                loading={state === 'opening'}
                disabled={state === 'opening' || state === 'verifying'}
                onPress={() => {
                  void openProviderCheckout();
                }}
                testID="mobile-payment-open-provider"
              />
            ) : null}
            <Button
              title={state === 'verifying' ? 'Verifying...' : 'Verify payment status'}
              variant="secondary"
              loading={state === 'verifying'}
              disabled={!reference || state === 'verifying'}
              onPress={() => {
                void verifyAttempt();
              }}
              testID="mobile-payment-verify"
            />
            <View style={styles.actions}>
              <Button
                title="Back to checkout"
                variant="secondary"
                onPress={() => router.replace('/checkout' as never)}
              />
              <Button
                title="View orders"
                variant="secondary"
                onPress={() => router.replace('/orders' as never)}
              />
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

export default MobilePaymentScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl2,
  },
  card: {
    gap: tokens.spacing.md,
  },
  actions: {
    gap: tokens.spacing.sm,
  },
});
