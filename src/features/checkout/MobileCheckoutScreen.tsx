import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { DeliveryAddressBook } from '@/components/delivery/DeliveryAddressBook';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  createMobileCheckoutIdempotencyKey,
  paymentApi,
  type ShippingAddress,
} from '@/src/api/PaymentApi';
import type { SavedDeliveryAddress } from '@/src/api/ProfileApi';
import { displayNameOf } from '@/src/features/delivery/deliveryAddressBook';
import { useAuth } from '@/src/auth/AuthContext';
import { queryClient } from '@/src/query/queryClient';
import { useBagCount } from '@/src/features/bagging/BagCountContext';
import {
  savePendingMobileCheckout,
} from '@/src/features/checkout/mobileCheckoutPending';
import {
  getMobileCheckoutUnavailableMessage,
  isMobileCheckoutEnabled,
} from '@/src/features/checkout/mobileCheckoutGate';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { navPerf } from '@/src/utils/navPerf';
import {
  getRequiredLegalAcceptances,
  LEGAL_PAYMENT_DOCUMENT_KEYS,
  type LegalAcceptancePayload,
} from '@/src/api/LegalApi';
import {
  isEmptyPhone,
  isValidPhone,
  normalizePhoneToE164,
} from '@/src/utils/phoneNumber';

type CheckoutForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const emptyForm = (user: ReturnType<typeof useAuth>['user']): CheckoutForm => ({
  firstName: user?.firstName ?? '',
  lastName: user?.lastName ?? '',
  email: user?.email ?? '',
  phone: user?.phoneNumber ?? '',
  street: '',
  apartment: '',
  city: user?.brandCity ?? '',
  state: user?.brandState ?? '',
  postalCode: '',
  country: user?.brandCountry ?? 'Nigeria',
});

const trimForm = (form: CheckoutForm): CheckoutForm =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, value.trim()]),
  ) as CheckoutForm;

function toShippingAddress(form: CheckoutForm): ShippingAddress {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    street: form.street,
    ...(form.apartment ? { apartment: form.apartment } : {}),
    city: form.city,
    state: form.state,
    ...(form.postalCode ? { postalCode: form.postalCode } : {}),
    country: form.country,
    phone: normalizePhoneToE164(form.phone) ?? form.phone.trim(),
  };
}

function missingRequiredFields(form: CheckoutForm): string[] {
  const missing = [
    ['firstName', form.firstName],
    ['lastName', form.lastName],
    ['email', form.email],
    ['street', form.street],
    ['city', form.city],
    ['state', form.state],
    ['country', form.country],
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([key]) => String(key));

  if (isEmptyPhone(form.phone) || !isValidPhone(form.phone)) {
    missing.push('phone');
  }

  return missing;
}

export function MobileCheckoutScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const auth = useAuth();
  const { count, refreshGlobalBagCount } = useBagCount();
  const [form, setForm] = useState<CheckoutForm>(() => emptyForm(auth.user));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentPolicyAccepted, setPaymentPolicyAccepted] = useState(false);
  const [paymentLegalAcceptances, setPaymentLegalAcceptances] = useState<LegalAcceptancePayload[]>([]);

  const hasBagItems = count.combinedCount > 0;
  const fullName = useMemo(
    () => [form.firstName, form.lastName].filter(Boolean).join(' ').trim(),
    [form.firstName, form.lastName],
  );

  /*
    Delivery comes from the shared address book — the same one web and the
    custom-order sheet use. It replaced a nine-field form that silently copied
    the FIRST saved address in, with no way to choose another, edit it, or add a
    new one, plus its own copy of the country/state/city pickers. The chosen
    address becomes the checkout details below.
  */
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressEditing, setAddressEditing] = useState(false);
  const addressDefaults = useMemo(
    () => ({
      customerName: [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(' ').trim(),
      contactEmail: auth.user?.email?.trim() ?? '',
      phone: auth.user?.phoneNumber?.trim() ?? '',
    }),
    [auth.user?.email, auth.user?.firstName, auth.user?.lastName, auth.user?.phoneNumber],
  );

  const handleSelectAddress = useCallback(
    (address: SavedDeliveryAddress | null) => {
      setSelectedAddressId(address?.id ?? null);
      if (!address) {
        setForm(emptyForm(auth.user));
        return;
      }
      const name = displayNameOf(address);
      const [first = '', ...rest] = name.split(' ');
      setForm({
        firstName: address.firstName || first,
        lastName: address.lastName || rest.join(' '),
        // A saved address may predate contact fields; the account fills gaps.
        email: address.contactEmail || auth.user?.email || '',
        phone: address.phone || auth.user?.phoneNumber || '',
        street: address.street,
        apartment: address.apartment,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country || 'Nigeria',
      });
    },
    [auth.user],
  );

  // Dev-only nav timing for bag→checkout. The checkout shell + form render at
  // mount; data is ready once the required legal acceptances load settles.
  useEffect(() => {
    navPerf.screenMounted('bag→checkout');
    navPerf.firstVisibleUi('bag→checkout');
  }, []);

  useEffect(() => {
    let active = true;
    void getRequiredLegalAcceptances(LEGAL_PAYMENT_DOCUMENT_KEYS)
      .then((acceptances) => {
        if (active) setPaymentLegalAcceptances(acceptances);
      })
      .catch(() => {
        if (active) setPaymentLegalAcceptances([]);
      })
      .finally(() => {
        if (active) navPerf.dataReady('bag→checkout');
      });
    return () => {
      active = false;
    };
  }, []);

  const beginCheckout = useCallback(async () => {
    if (!isMobileCheckoutEnabled()) {
      toast.info(getMobileCheckoutUnavailableMessage());
      return;
    }
    if (auth.status !== 'authenticated' || !auth.user) {
      toast.info('Sign in before checkout.');
      drillDownPush('/(tabs)/me' as never);
      return;
    }

    const trimmed = trimForm(form);
    if (addressEditing) {
      toast.error('Save the address you are editing first.');
      return;
    }
    const missing = missingRequiredFields(trimmed);
    if (!selectedAddressId || missing.length > 0) {
      // The book validates on save, so a gap here means an older saved address
      // is missing something. Editing it is the fix.
      toast.error(
        selectedAddressId
          ? 'This address is missing details. Tap Edit on it to complete it.'
          : 'Choose or add a delivery address.',
      );
      return;
    }
    if (!paymentPolicyAccepted) {
      toast.error('Accept the Payment Policy before checkout.');
      return;
    }
    if (paymentLegalAcceptances.length === 0) {
      toast.error('Payment Policy version is unavailable. Try again.');
      return;
    }

    const idempotencyKey = createMobileCheckoutIdempotencyKey();
    setSubmitting(true);
    setMessage('Initializing secure checkout from your saved bag...');
    try {
      const shippingAddress = toShippingAddress(trimmed);
      const result = await paymentApi.initializeUnified({
        paymentMethod: 'PAYSTACK',
        email: trimmed.email,
        customerName: fullName || `${trimmed.firstName} ${trimmed.lastName}`,
        shippingAddress,
        contactInfo: {
          phone: normalizePhoneToE164(trimmed.phone) ?? trimmed.phone,
          email: trimmed.email,
          billingSameAsShipping: true,
          channel: 'CARD',
        },
        paymentData: {
          phone: normalizePhoneToE164(trimmed.phone) ?? trimmed.phone,
          email: trimmed.email,
          consentAccepted: paymentPolicyAccepted,
          legalAcceptances: paymentLegalAcceptances,
          billingSameAsShipping: true,
          channel: 'CARD',
        },
        idempotencyKey,
      });

      await savePendingMobileCheckout({
        reference: result.reference,
        gateway: result.gateway,
        checkoutSessionId: result.checkoutSessionId ?? null,
        idempotencyKey,
        startedAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['store'] });
      await refreshGlobalBagCount({ forceRefresh: true });
      router.replace({
        pathname: '/payment',
        params: {
          reference: result.reference,
          gateway: result.gateway,
          open: '1',
        },
      } as never);
    } catch (error) {
      const responseMessage =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
      const nextMessage =
        responseMessage || 'Unable to initialize checkout. Review your bag and try again.';
      setMessage(nextMessage);
      toast.error(nextMessage);
    } finally {
      setSubmitting(false);
    }
  }, [
    auth.status,
    auth.user,
    form,
    fullName,
    paymentLegalAcceptances,
    paymentPolicyAccepted,
    refreshGlobalBagCount,
    toast,
  ]);

  if (!isMobileCheckoutEnabled()) {
    return (
      <>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]}>
          <View style={styles.center}>
            <Card style={styles.card}>
              <AppText variant="title" style={styles.centerText}>
                Checkout unavailable
              </AppText>
              <AppText variant="body" tone="muted" style={styles.centerText}>
                {getMobileCheckoutUnavailableMessage()}
              </AppText>
              <Button title="Continue browsing" onPress={() => router.replace('/(tabs)' as never)} />
            </Card>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Checkout' }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <AppText variant="title">Secure checkout</AppText>
            <AppText variant="body" tone="muted">
              WIEZ recalculates the amount from your saved bag and verifies payment with the backend before any order is marked paid.
            </AppText>
          </View>

          <Card style={styles.card}>
            <View style={styles.row}>
              <AppText variant="bodyBold">Bag items</AppText>
              <AppText variant="bodyBold">{String(count.combinedCount)}</AppText>
            </View>
            <AppText variant="caption" tone="muted">
              Standard items and custom requests are read from your backend-owned bag at checkout time.
            </AppText>
            <Button
              title="Refresh bag"
              variant="secondary"
              onPress={() => {
                void refreshGlobalBagCount({ forceRefresh: true });
              }}
            />
          </Card>

          <DeliveryAddressBook
            title="Delivery details"
            subtitle="Choose where this order goes, or add another address."
            selectedId={selectedAddressId}
            onSelect={handleSelectAddress}
            defaults={addressDefaults}
            onEditingChange={setAddressEditing}
          />

          <Card style={styles.card}>
            <AppText variant="subtitle">Payment</AppText>
            <AppText variant="body" tone="muted">
              Card checkout opens in the secure provider page. Returning to WIEZ only triggers backend verification; it never marks payment as complete locally.
            </AppText>
            {message ? (
              <AppText variant="caption" tone={message.includes('Unable') ? 'danger' : 'muted'}>
                {message}
              </AppText>
            ) : null}
            <Pressable
              onPress={() => setPaymentPolicyAccepted((current) => !current)}
              accessibilityRole="checkbox"
              accessibilityLabel="Accept Payment Policy"
              accessibilityState={{ checked: paymentPolicyAccepted }}
              style={({ pressed }) => [
                styles.consentRow,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <View style={[styles.checkbox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <AppText variant="captionBold" tone={paymentPolicyAccepted ? 'primary' : 'muted'}>
                  {paymentPolicyAccepted ? 'OK' : ''}
                </AppText>
              </View>
              <View style={styles.consentCopy}>
                <AppText variant="smallBold">Payment Policy</AppText>
                <AppText variant="caption" tone="muted">
                  I confirm these details are correct and payment may require provider verification before fulfillment.
                </AppText>
              </View>
            </Pressable>
            <Pressable
              onPress={() => drillDownPush('/legal/payment-policy' as never)}
              accessibilityRole="button"
              accessibilityLabel="View Payment Policy"
            >
              <AppText variant="captionBold" tone="primary">View Payment Policy</AppText>
            </Pressable>
            <Button
              title={submitting ? 'Initializing...' : 'Continue to secure payment'}
              loading={submitting}
              disabled={!hasBagItems || submitting || !paymentPolicyAccepted || addressEditing}
              onPress={() => {
                void beginCheckout();
              }}
              testID="mobile-checkout-submit"
            />
            {!hasBagItems ? (
              <AppText variant="caption" tone="muted">
                Your bag is empty. Add an item before starting checkout.
              </AppText>
            ) : null}
          </Card>
        </ScrollView>
      </SafeAreaView>

    </>
  );
}

export default MobileCheckoutScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.lg,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  header: {
    gap: tokens.spacing.sm,
  },
  card: {
    gap: tokens.spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  consentRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  consentCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fieldGrid: {
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
});
