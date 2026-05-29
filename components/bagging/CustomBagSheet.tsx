import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { ProfileApi, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { MobileStoreApi, type ProductBagStatus } from '@/src/api/StoreApi';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import {
  getMobileCheckoutUnavailableMessage,
  isMobileCheckoutEnabled,
} from '@/src/features/checkout/mobileCheckoutGate';
import { tokens } from '@/src/styles/tokens';
import { useToast } from '@/src/toast/ToastContext';
import type { BagSourceType } from '@/src/api/StoreApi';

type BagProductInput = {
  id: string;
  name?: string;
  sourceType?: BagSourceType;
  sourceId?: string;
};

type Props = {
  visible: boolean;
  product: BagProductInput | null;
  status: ProductBagStatus | null;
  onClose: () => void;
  onCompleted: (nextStatus: ProductBagStatus) => void;
};

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part))
    .join(' ');

const toApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error.trim()) return error;
  const responseMessage = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(responseMessage)) {
    const joined = responseMessage.filter(Boolean).join(', ').trim();
    if (joined) return joined;
  }
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;
  const message = (error as { message?: unknown })?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
};

const extractNumericMeasurements = (sizeFit: SizeFitProfile | null | undefined) => {
  const source = sizeFit?.measurements ?? {};
  return Object.entries(source).reduce<Record<string, number>>((acc, [key, value]) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      acc[key] = parsed;
    }
    return acc;
  }, {});
};

const buildCustomerName = (profile: UserProfile | null) => {
  const legalName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  if (legalName.length >= 3) return legalName;
  if (profile?.username && profile.username.length >= 3) return profile.username;
  return '';
};

const buildLocationFields = (profile: UserProfile | null) => {
  const locationParts = String(profile?.location ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: locationParts[0] ?? '',
    state: locationParts[1] ?? '',
    country: locationParts[2] ?? 'Nigeria',
  };
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function CustomBagSheet({ visible, product, status, onClose, onCompleted }: Props) {
  const toast = useToast();
  const { addCustomOrder, prepareBag, prepareSourceBag } = useMobileBagging();
  const checkoutEnabled = isMobileCheckoutEnabled();
  const [values, setValues] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualQuoteRequired, setManualQuoteRequired] = useState(false);

  const requiredKeys = useMemo(
    () => status?.custom.requiredMeasurementKeys ?? [],
    [status?.custom.requiredMeasurementKeys],
  );

  useEffect(() => {
    if (!visible || !status) return;

    let active = true;
    setError(null);
    setManualQuoteRequired(false);

    if (!checkoutEnabled) {
      setLoadingProfile(false);
      setValues({});
      setCustomerName('');
      setEmail('');
      setPhone('');
      setCity('');
      setStateName('');
      setCountry('Nigeria');
      return () => {
        active = false;
      };
    }

    setLoadingProfile(true);

    void Promise.all([ProfileApi.getMe(), ProfileApi.getSizeFit()])
      .then(([nextProfile, sizeFit]) => {
        if (!active) return;
        const location = buildLocationFields(nextProfile);
        setCustomerName(buildCustomerName(nextProfile));
        setEmail(nextProfile?.email ?? '');
        setPhone('');
        setCity(location.city);
        setStateName(location.state);
        setCountry(location.country);
        const measurements = extractNumericMeasurements(sizeFit);
        setValues(
          requiredKeys.reduce<Record<string, string>>((acc, key) => {
            acc[key] = measurements[key] ? String(measurements[key]) : '';
            return acc;
          }, {}),
        );
      })
      .catch((nextError) => {
        if (!active) return;
        setError(toApiErrorMessage(nextError, 'Unable to load your fitting profile.'));
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [checkoutEnabled, requiredKeys, status, visible]);

  const measurementValues = useMemo(
    () =>
      requiredKeys.reduce<Record<string, number>>((acc, key) => {
        const parsed = Number(values[key]);
        if (Number.isFinite(parsed) && parsed > 0) {
          acc[key] = parsed;
        }
        return acc;
      }, {}),
    [requiredKeys, values],
  );

  const missingKeys = useMemo(
    () => requiredKeys.filter((key) => !measurementValues[key]),
    [measurementValues, requiredKeys],
  );

  const trimmedCustomerName = customerName.trim();
  const trimmedEmail = email.trim();
  const trimmedPhone = phone.trim();
  const trimmedCity = city.trim();
  const trimmedState = stateName.trim();
  const trimmedCountry = country.trim();
  const missingContactFields = useMemo(() => {
    const missing: string[] = [];
    if (trimmedCustomerName.length < 3) missing.push('name');
    if (!isValidEmail(trimmedEmail)) missing.push('valid email');
    if (trimmedPhone.length < 6) missing.push('phone');
    if (!trimmedCity) missing.push('city');
    if (!trimmedState) missing.push('state');
    if (!trimmedCountry) missing.push('country');
    return missing;
  }, [trimmedCity, trimmedCountry, trimmedCustomerName, trimmedEmail, trimmedPhone, trimmedState]);

  const canSubmit =
    checkoutEnabled &&
    Boolean(product && status?.custom.configurationId) &&
    !loadingProfile &&
    !submitting &&
    (manualQuoteRequired || (missingKeys.length === 0 && missingContactFields.length === 0));

  const handleSubmit = async () => {
    if (!checkoutEnabled) {
      const message = getMobileCheckoutUnavailableMessage();
      setError(message);
      toast.info(message);
      return;
    }
    if (manualQuoteRequired) {
      onClose();
      return;
    }
    if (!product || !status?.custom.configurationId) return;
    if (missingKeys.length > 0) {
      setError(`Add ${missingKeys.length} missing measurement${missingKeys.length === 1 ? '' : 's'} to continue.`);
      return;
    }
    if (missingContactFields.length > 0) {
      setError(`Add ${missingContactFields.join(', ')} before adding this custom request.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const shippingAddress = {
        city: trimmedCity,
        state: trimmedState,
        country: trimmedCountry,
      };
      const preview = await MobileStoreApi.previewCustomPrice({
        configurationId: status.custom.configurationId,
        measurementValues,
        rushSelected: false,
        shippingAddress,
      });

      if (preview.quoteStatus === 'MANUAL_QUOTE_REQUIRED') {
        setManualQuoteRequired(true);
        toast.info('This custom request needs brand review before it can be added to your bag.');
        return;
      }
      if (!preview.checkoutIntentId) {
        throw new Error('Could not create a custom bag intent for this product.');
      }

      const sourceType = status.sourceType ?? product.sourceType ?? 'PRODUCT';
      const sourceId = status.sourceId ?? product.sourceId ?? product.id;

      await addCustomOrder(product.id, {
        checkoutIntentId: preview.checkoutIntentId,
        configurationId: status.custom.configurationId,
        configurationVersionId: preview.configurationVersionId,
        measurementValues,
        shippingAddress,
        contactInfo: {
          email: trimmedEmail,
          phone: trimmedPhone,
          customerName: trimmedCustomerName,
        },
        customerName: trimmedCustomerName,
        noDirectMatchAcknowledged: true,
      }, sourceType, sourceId);

      const nextStatus = sourceType === 'PRODUCT'
        ? await prepareBag(product.id)
        : await prepareSourceBag(sourceType, sourceId);
      toast.success('Added to your bag');
      onCompleted(nextStatus);
    } catch (nextError) {
      const message = toApiErrorMessage(nextError, 'Unable to add this custom request to your bag.');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppBottomSheet
      visible={visible}
      title={`Custom bag for ${product?.name || 'this item'}`}
      subtitle={checkoutEnabled
        ? 'Review the fitting values required for this product before adding it to your custom bag.'
        : 'Mobile custom checkout is paused for controlled MVP testing.'}
      onClose={onClose}
      showCloseButton
      onDone={handleSubmit}
      doneLabel={checkoutEnabled ? (manualQuoteRequired ? 'Close' : 'Add custom') : 'Unavailable'}
      doneDisabled={!canSubmit}
      loading={submitting}
      scrollable
    >
      <View style={styles.group}>
        {!checkoutEnabled ? (
          <AppText variant="body" tone="muted">
            {getMobileCheckoutUnavailableMessage()}
          </AppText>
        ) : loadingProfile ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <AppText variant="body" tone="muted">Loading fittings...</AppText>
          </View>
        ) : null}

        {checkoutEnabled ? (
          <>
            <View style={styles.group}>
              <Input
                label="Customer name"
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Full name"
                error={trimmedCustomerName.length > 0 && trimmedCustomerName.length < 3 ? 'Use at least 3 characters' : undefined}
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholder="name@example.com"
                error={trimmedEmail.length > 0 && !isValidEmail(trimmedEmail) ? 'Enter a valid email' : undefined}
              />
              <Input
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Phone number"
                error={trimmedPhone.length > 0 && trimmedPhone.length < 6 ? 'Enter a reachable phone number' : undefined}
              />
              <Input label="City" value={city} onChangeText={setCity} placeholder="City" />
              <Input label="State" value={stateName} onChangeText={setStateName} placeholder="State" />
              <Input label="Country" value={country} onChangeText={setCountry} placeholder="Country" />
            </View>

            {requiredKeys.length > 0 ? (
              <View style={styles.group}>
                {requiredKeys.map((key) => (
                  <Input
                    key={key}
                    label={`${toTitleCase(key)} (cm)`}
                    value={values[key] ?? ''}
                    onChangeText={(value) => {
                      setValues((current) => ({ ...current, [key]: value }));
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    error={missingKeys.includes(key) ? 'Required' : undefined}
                  />
                ))}
              </View>
            ) : (
              <AppText variant="body" tone="muted">
                This custom configuration does not require fitting measurements.
              </AppText>
            )}
          </>
        ) : null}

        {!checkoutEnabled ? (
          <AppText variant="caption" tone="muted">
            You can keep browsing products and view existing orders in the mobile app.
          </AppText>
        ) : manualQuoteRequired ? (
          <AppText variant="body" tone="muted">
            This custom request needs brand review before it can be added to your bag.
          </AppText>
        ) : error ? (
          <AppText variant="caption" tone="danger">{error}</AppText>
        ) : (
          <AppText variant="caption" tone="muted">
            Contact and delivery details are saved with this custom bag request for unified checkout.
          </AppText>
        )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: tokens.spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
});
