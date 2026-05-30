import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  createMobileCheckoutIdempotencyKey,
  paymentApi,
  type ShippingAddress,
} from '@/src/api/PaymentApi';
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
    phone: form.phone,
  };
}

function missingRequiredFields(form: CheckoutForm): string[] {
  return [
    ['firstName', form.firstName],
    ['lastName', form.lastName],
    ['email', form.email],
    ['phone', form.phone],
    ['street', form.street],
    ['city', form.city],
    ['state', form.state],
    ['country', form.country],
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([key]) => String(key));
}

function fieldError(field: keyof CheckoutForm, errors: string[]) {
  return errors.includes(field) ? 'Required for checkout' : undefined;
}

export function MobileCheckoutScreen() {
  const { theme } = useTheme();
  const toast = useToast();
  const auth = useAuth();
  const { count, refreshGlobalBagCount } = useBagCount();
  const [form, setForm] = useState<CheckoutForm>(() => emptyForm(auth.user));
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hasBagItems = count.combinedCount > 0;
  const fullName = useMemo(
    () => [form.firstName, form.lastName].filter(Boolean).join(' ').trim(),
    [form.firstName, form.lastName],
  );

  const updateField = useCallback(
    (field: keyof CheckoutForm, value: string) => {
      setForm((current) => ({ ...current, [field]: value }));
      setErrors((current) => current.filter((entry) => entry !== field));
    },
    [],
  );

  const beginCheckout = useCallback(async () => {
    if (!isMobileCheckoutEnabled()) {
      toast.info(getMobileCheckoutUnavailableMessage());
      return;
    }
    if (auth.status !== 'authenticated' || !auth.user) {
      toast.info('Sign in before checkout.');
      router.push('/(tabs)/me' as never);
      return;
    }

    const trimmed = trimForm(form);
    const missing = missingRequiredFields(trimmed);
    if (missing.length > 0) {
      setErrors(missing);
      toast.error('Complete the required delivery details.');
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
          phone: trimmed.phone,
          email: trimmed.email,
          billingSameAsShipping: true,
          channel: 'CARD',
        },
        paymentData: {
          phone: trimmed.phone,
          email: trimmed.email,
          consentAccepted: true,
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
  }, [auth.status, auth.user, form, fullName, refreshGlobalBagCount, toast]);

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
              Threadly recalculates the amount from your saved bag and verifies payment with the backend before any order is marked paid.
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

          <Card style={styles.card}>
            <AppText variant="subtitle">Delivery details</AppText>
            <View style={styles.fieldGrid}>
              <Input
                label="First name"
                value={form.firstName}
                onChangeText={(value) => updateField('firstName', value)}
                error={fieldError('firstName', errors)}
              />
              <Input
                label="Last name"
                value={form.lastName}
                onChangeText={(value) => updateField('lastName', value)}
                error={fieldError('lastName', errors)}
              />
              <Input
                label="Email"
                value={form.email}
                onChangeText={(value) => updateField('email', value)}
                autoCapitalize="none"
                keyboardType="email-address"
                error={fieldError('email', errors)}
              />
              <Input
                label="Phone"
                value={form.phone}
                onChangeText={(value) => updateField('phone', value)}
                keyboardType="phone-pad"
                error={fieldError('phone', errors)}
              />
              <Input
                label="Street address"
                value={form.street}
                onChangeText={(value) => updateField('street', value)}
                error={fieldError('street', errors)}
              />
              <Input
                label="Apartment"
                value={form.apartment}
                onChangeText={(value) => updateField('apartment', value)}
              />
              <Input
                label="City"
                value={form.city}
                onChangeText={(value) => updateField('city', value)}
                error={fieldError('city', errors)}
              />
              <Input
                label="State"
                value={form.state}
                onChangeText={(value) => updateField('state', value)}
                error={fieldError('state', errors)}
              />
              <Input
                label="Postal code"
                value={form.postalCode}
                onChangeText={(value) => updateField('postalCode', value)}
              />
              <Input
                label="Country"
                value={form.country}
                onChangeText={(value) => updateField('country', value)}
                error={fieldError('country', errors)}
              />
            </View>
          </Card>

          <Card style={styles.card}>
            <AppText variant="subtitle">Payment</AppText>
            <AppText variant="body" tone="muted">
              Card checkout opens in the secure provider page. Returning to Threadly only triggers backend verification; it never marks payment as complete locally.
            </AppText>
            {message ? (
              <AppText variant="caption" tone={message.includes('Unable') ? 'danger' : 'muted'}>
                {message}
              </AppText>
            ) : null}
            <Button
              title={submitting ? 'Initializing...' : 'Continue to secure payment'}
              loading={submitting}
              disabled={!hasBagItems || submitting}
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
  fieldGrid: {
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
});
