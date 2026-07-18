import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { AppSelectSheet, type SelectSheetOption } from '@/components/ui/AppSelectSheet';
import { locationService, type CountryOption, type StateOption } from '@/src/services/locationService';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  createMobileCheckoutIdempotencyKey,
  paymentApi,
  type ShippingAddress,
} from '@/src/api/PaymentApi';
import { ProfileApi } from '@/src/api/ProfileApi';
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
  const [paymentPolicyAccepted, setPaymentPolicyAccepted] = useState(false);
  const [paymentLegalAcceptances, setPaymentLegalAcceptances] = useState<LegalAcceptancePayload[]>([]);

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

  // Cross-platform address book: prefill from the backend-saved delivery
  // addresses (same book the web checkout maintains) so an address saved on
  // web appears here. Never overwrite anything the user already typed.
  useEffect(() => {
    let active = true;
    ProfileApi.getDeliveryAddresses()
      .then((items) => {
        if (!active || items.length === 0) return;
        const primary = items[0];
        setForm((current) => {
          if (current.street.trim()) return current;
          return {
            ...current,
            firstName: current.firstName.trim() ? current.firstName : primary.firstName,
            lastName: current.lastName.trim() ? current.lastName : primary.lastName,
            email: current.email.trim() ? current.email : primary.contactEmail,
            phone: current.phone.trim() ? current.phone : primary.phone,
            street: primary.street,
            apartment: primary.apartment,
            city: primary.city,
            state: primary.state,
            postalCode: primary.postalCode,
            country: primary.country || current.country,
          };
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Location selections
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [countrySheetVisible, setCountrySheetVisible] = useState(false);

  const [states, setStates] = useState<StateOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [stateSheetVisible, setStateSheetVisible] = useState(false);

  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySheetVisible, setCitySheetVisible] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingCountries(true);
    locationService.getCountries()
      .then((data) => {
        if (active) setCountries(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCountries(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!form.country) {
      setStates([]);
      return;
    }
    setLoadingStates(true);
    locationService.getStates(form.country)
      .then((data) => {
        if (active) setStates(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingStates(false);
      });
    return () => {
      active = false;
    };
  }, [form.country]);

  useEffect(() => {
    let active = true;
    if (!form.country || !form.state) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    locationService.getCities(form.country, form.state)
      .then((data) => {
        if (active) setCities(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => {
      active = false;
    };
  }, [form.country, form.state]);

  const countryOptions = useMemo<SelectSheetOption[]>(() => {
    return countries.map((c) => ({
      value: c.name,
      label: c.name,
    }));
  }, [countries]);

  const stateOptions = useMemo<SelectSheetOption[]>(() => {
    return states.map((s) => ({
      value: s.name,
      label: s.name,
    }));
  }, [states]);

  const cityOptions = useMemo<SelectSheetOption[]>(() => {
    return cities.map((c) => ({
      value: c,
      label: c,
    }));
  }, [cities]);

  const handleSelectCountry = useCallback((countryName: string) => {
    setForm((current) => ({
      ...current,
      country: countryName,
      state: '',
      city: '',
    }));
    setErrors((current) => current.filter((entry) => entry !== 'country'));
  }, []);

  const handleSelectState = useCallback((stateName: string) => {
    setForm((current) => ({
      ...current,
      state: stateName,
      city: '',
    }));
    setErrors((current) => current.filter((entry) => entry !== 'state'));
  }, []);

  const handleSelectCity = useCallback((cityName: string) => {
    setForm((current) => ({
      ...current,
      city: cityName,
    }));
    setErrors((current) => current.filter((entry) => entry !== 'city'));
  }, []);

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
          phone: trimmed.phone,
          email: trimmed.email,
          billingSameAsShipping: true,
          channel: 'CARD',
        },
        paymentData: {
          phone: trimmed.phone,
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
              {/* Country Selector Trigger */}
              <Pressable onPress={() => setCountrySheetVisible(true)}>
                <View pointerEvents="none">
                  <Input
                    label="Country"
                    value={form.country}
                    placeholder="Select Country"
                    error={fieldError('country', errors)}
                    editable={false}
                  />
                </View>
              </Pressable>

              {/* State Selector Trigger / Fallback */}
              {form.country && stateOptions.length > 0 ? (
                <Pressable onPress={() => setStateSheetVisible(true)}>
                  <View pointerEvents="none">
                    <Input
                      label="State"
                      value={form.state}
                      placeholder={loadingStates ? "Loading states..." : "Select State"}
                      error={fieldError('state', errors)}
                      editable={false}
                    />
                  </View>
                </Pressable>
              ) : (
                <Input
                  label="State"
                  value={form.state}
                  placeholder="State/Province"
                  onChangeText={(value) => updateField('state', value)}
                  error={fieldError('state', errors)}
                />
              )}

              {/* City Selector Trigger / Fallback */}
              {form.state && cityOptions.length > 0 ? (
                <Pressable onPress={() => setCitySheetVisible(true)}>
                  <View pointerEvents="none">
                    <Input
                      label="City"
                      value={form.city}
                      placeholder={loadingCities ? "Loading cities..." : "Select City"}
                      error={fieldError('city', errors)}
                      editable={false}
                    />
                  </View>
                </Pressable>
              ) : (
                <Input
                  label="City"
                  value={form.city}
                  placeholder="City"
                  onChangeText={(value) => updateField('city', value)}
                  error={fieldError('city', errors)}
                />
              )}

              <Input
                label="Postal code"
                value={form.postalCode}
                onChangeText={(value) => updateField('postalCode', value)}
              />
            </View>
          </Card>

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
              onPress={() => router.push('/legal/payment-policy' as never)}
              accessibilityRole="button"
              accessibilityLabel="View Payment Policy"
            >
              <AppText variant="captionBold" tone="primary">View Payment Policy</AppText>
            </Pressable>
            <Button
              title={submitting ? 'Initializing...' : 'Continue to secure payment'}
              loading={submitting}
              disabled={!hasBagItems || submitting || !paymentPolicyAccepted}
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

      <AppSelectSheet
        visible={countrySheetVisible}
        title="Select Country"
        options={countryOptions}
        value={form.country}
        onChange={(val) => {
          handleSelectCountry(val);
        }}
        onClose={() => setCountrySheetVisible(false)}
        loading={loadingCountries}
      />
      <AppSelectSheet
        visible={stateSheetVisible}
        title="Select State"
        options={stateOptions}
        value={form.state}
        onChange={(val) => {
          handleSelectState(val);
        }}
        onClose={() => setStateSheetVisible(false)}
        loading={loadingStates}
      />
      <AppSelectSheet
        visible={citySheetVisible}
        title="Select City"
        options={cityOptions}
        value={form.city}
        onChange={(val) => {
          handleSelectCity(val);
        }}
        onClose={() => setCitySheetVisible(false)}
        loading={loadingCities}
      />
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
