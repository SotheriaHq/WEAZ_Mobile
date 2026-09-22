import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { MuseLoader } from '@/components/ui/MuseLoader';
import {
  ProfileApi,
  type SavedDeliveryAddress,
  type SizeFitProfile,
  type UserProfile,
} from '@/src/api/ProfileApi';
import {
  formatMeasurementLabel,
  getMeasurementHint,
} from '@/src/features/sizing/measurementCatalog';
import { MobileStoreApi, type ProductBagStatus } from '@/src/api/StoreApi';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import {
  getMobileCheckoutUnavailableMessage,
  isMobileCheckoutEnabled,
} from '@/src/features/checkout/mobileCheckoutGate';
import { tokens } from '@/src/styles/tokens';
import { useToast } from '@/src/toast/ToastContext';
import type { BagSourceType } from '@/src/api/StoreApi';
import {
  isValidPhone,
  normalizePhoneToE164,
  PHONE_INVALID_MESSAGE,
  sanitizePhoneInput,
} from '@/src/utils/phoneNumber';

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

/**
 * The address the shopper last used — the same book checkout and the web
 * composer read from, so a custom request goes where their orders go.
 */
const pickLatestAddress = (addresses: SavedDeliveryAddress[]) =>
  [...addresses].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null;

const nameFromAddress = (address: SavedDeliveryAddress | null) =>
  (address?.customerName || [address?.firstName, address?.lastName].filter(Boolean).join(' ')).trim();

type DeliveryDetails = {
  customerName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
};

/** What still has to be supplied before the request can be sent, in words. */
const listMissingDelivery = (details: DeliveryDetails): string[] => {
  const missing: string[] = [];
  if (details.customerName.trim().length < 3) missing.push('name');
  if (!isValidEmail(details.email)) missing.push('valid email');
  if (!isValidPhone(details.phone.trim())) missing.push('phone');
  if (!details.city.trim()) missing.push('city');
  if (!details.state.trim()) missing.push('state');
  if (!details.country.trim()) missing.push('country');
  return missing;
};

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
  /**
   * Whether the delivery fields are on screen.
   *
   * This sheet asked for name, email, phone, city, state and country as six
   * bare fields above the measurements — on a sheet whose job is "check the
   * fittings for this piece". The web composer never asks for them: it reads
   * the saved delivery address. The server does need them attached to the
   * request, so they are still sent, but they are filled from the same address
   * book and shown as one line. The fields appear only when something is
   * actually missing, or when the shopper chooses to change them.
   */
  const [editingDelivery, setEditingDelivery] = useState(false);

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
    setEditingDelivery(false);

    void Promise.all([
      ProfileApi.getMe(),
      ProfileApi.getSizeFit(),
      // No address book is a normal state for a new shopper, not an error.
      ProfileApi.getDeliveryAddresses().catch(() => [] as SavedDeliveryAddress[]),
    ])
      .then(([nextProfile, sizeFit, addresses]) => {
        if (!active) return;
        const saved = pickLatestAddress(addresses);
        const location = buildLocationFields(nextProfile);
        const resolved: DeliveryDetails = {
          customerName: nameFromAddress(saved) || buildCustomerName(nextProfile),
          email: saved?.contactEmail || nextProfile?.email || '',
          phone: saved?.phone ?? '',
          city: saved?.city || location.city,
          state: saved?.state || location.state,
          country: saved?.country || location.country,
        };
        setCustomerName(resolved.customerName);
        setEmail(resolved.email);
        setPhone(resolved.phone);
        setCity(resolved.city);
        setStateName(resolved.state);
        setCountry(resolved.country);
        // Only a gap earns the fields. Decided from the loaded values, not an
        // effect: on first render every field is empty and would always open.
        setEditingDelivery(listMissingDelivery(resolved).length > 0);
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
  const missingContactFields = useMemo(
    () =>
      listMissingDelivery({
        customerName: trimmedCustomerName,
        email: trimmedEmail,
        phone: trimmedPhone,
        city: trimmedCity,
        state: trimmedState,
        country: trimmedCountry,
      }),
    [trimmedCity, trimmedCountry, trimmedCustomerName, trimmedEmail, trimmedPhone, trimmedState],
  );

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
      setEditingDelivery(true);
      setError(`Add your ${missingContactFields.join(', ')} below before adding this custom request.`);
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
          phone: normalizePhoneToE164(trimmedPhone) ?? trimmedPhone,
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
            <MuseLoader size={20} />
            <AppText variant="body" tone="muted">Loading fittings...</AppText>
          </View>
        ) : null}

        {checkoutEnabled && !loadingProfile ? (
          <>
            {/*
              The measurements are the point of this sheet, so they come first,
              named the way the fittings screen names them — "Hips / seat", not
              the pattern key "Waist To Hip" — with the same where-to-put-the-
              tape line underneath. They are filled from saved fittings; the
              shopper only touches the ones that are empty or have changed.
            */}
            {requiredKeys.length > 0 ? (
              <View style={styles.group}>
                <View style={styles.sectionHead}>
                  <AppText variant="subtitle">Your measurements</AppText>
                  <AppText variant="caption" tone="muted">
                    Filled from your fittings. Change any that are different for this piece.
                  </AppText>
                </View>
                {requiredKeys.map((key) => (
                  <Input
                    key={key}
                    label={`${formatMeasurementLabel(key)} (cm)`}
                    value={values[key] ?? ''}
                    onChangeText={(value) => {
                      setValues((current) => ({ ...current, [key]: value }));
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    helperText={getMeasurementHint(key) ?? undefined}
                    error={missingKeys.includes(key) ? 'Required' : undefined}
                  />
                ))}
              </View>
            ) : (
              <AppText variant="body" tone="muted">
                This piece does not need any measurements.
              </AppText>
            )}

            {editingDelivery ? (
              <View style={styles.group}>
                <View style={styles.sectionHead}>
                  <AppText variant="subtitle">Delivery details</AppText>
                  <AppText variant="caption" tone="muted">
                    Sent with this request so the brand can quote and ship it.
                  </AppText>
                </View>
                <Input
                  label="Full name"
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
                  onChangeText={(value) => setPhone(sanitizePhoneInput(value))}
                  keyboardType="phone-pad"
                  placeholder="080XXXXXXXX or +234..."
                  error={
                    trimmedPhone.length > 0 && !isValidPhone(trimmedPhone)
                      ? PHONE_INVALID_MESSAGE
                      : undefined
                  }
                />
                <Input label="City" value={city} onChangeText={setCity} placeholder="City" />
                <Input label="State" value={stateName} onChangeText={setStateName} placeholder="State" />
                <Input label="Country" value={country} onChangeText={setCountry} placeholder="Country" />
                {missingContactFields.length === 0 ? (
                  <Button
                    title="Done"
                    size="sm"
                    variant="secondary"
                    onPress={() => setEditingDelivery(false)}
                  />
                ) : null}
              </View>
            ) : (
              /*
                One line, not six fields. Everything here came from the saved
                address; showing it lets the shopper spot a wrong city without
                making them re-read their own name and email to get there.
              */
              <Card padding="md" style={styles.deliveryCard}>
                <View style={styles.deliveryCopy}>
                  <AppText variant="captionBold" tone="muted">
                    Delivering to
                  </AppText>
                  <AppText variant="bodyBold" numberOfLines={1}>
                    {trimmedCustomerName}
                  </AppText>
                  <AppText variant="caption" tone="muted" numberOfLines={2}>
                    {[trimmedCity, trimmedState, trimmedCountry].filter(Boolean).join(', ')}
                  </AppText>
                </View>
                <Button
                  title="Change"
                  size="sm"
                  variant="secondary"
                  onPress={() => setEditingDelivery(true)}
                />
              </Card>
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
        ) : null}
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
  sectionHead: {
    gap: tokens.spacing.xs,
  },
  deliveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  deliveryCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
});
