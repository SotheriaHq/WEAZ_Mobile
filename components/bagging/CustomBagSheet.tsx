import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { ProfileApi, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { MobileStoreApi, type ProductBagStatus } from '@/src/api/StoreApi';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { tokens } from '@/src/styles/tokens';
import { useToast } from '@/src/toast/ToastContext';

type BagProductInput = {
  id: string;
  name?: string;
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
  return 'Threadly User';
};

const buildShippingAddress = (profile: UserProfile | null) => {
  const locationParts = String(profile?.location ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    street: profile?.address ?? profile?.location ?? 'Provided at checkout',
    city: locationParts[0] ?? 'Unknown city',
    state: locationParts[1] ?? 'Unknown state',
    country: locationParts[2] ?? 'Nigeria',
  };
};

export default function CustomBagSheet({ visible, product, status, onClose, onCompleted }: Props) {
  const toast = useToast();
  const { addCustomOrder, prepareBag } = useMobileBagging();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredKeys = useMemo(
    () => status?.custom.requiredMeasurementKeys ?? [],
    [status?.custom.requiredMeasurementKeys],
  );

  useEffect(() => {
    if (!visible || !status) return;

    let active = true;
    setError(null);
    setLoadingProfile(true);

    void Promise.all([ProfileApi.getMe(), ProfileApi.getSizeFit()])
      .then(([nextProfile, sizeFit]) => {
        if (!active) return;
        setProfile(nextProfile);
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
  }, [requiredKeys, status, visible]);

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

  const canSubmit =
    Boolean(product && status?.custom.configurationId) &&
    !loadingProfile &&
    !submitting &&
    missingKeys.length === 0;

  const handleSubmit = async () => {
    if (!product || !status?.custom.configurationId) return;
    if (missingKeys.length > 0) {
      setError(`Add ${missingKeys.length} missing measurement${missingKeys.length === 1 ? '' : 's'} to continue.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const preview = await MobileStoreApi.previewCustomPrice({
        configurationId: status.custom.configurationId,
        measurementValues,
        rushSelected: false,
      });

      if (!preview.checkoutIntentId) {
        throw new Error('Could not create a custom bag intent for this product.');
      }
      if (preview.quoteStatus === 'MANUAL_QUOTE_REQUIRED') {
        throw new Error('This custom order needs manual quote review before it can be added to the bag.');
      }

      const customerName = buildCustomerName(profile);
      await addCustomOrder(product.id, {
        checkoutIntentId: preview.checkoutIntentId,
        configurationId: status.custom.configurationId,
        configurationVersionId: preview.configurationVersionId,
        measurementValues,
        shippingAddress: buildShippingAddress(profile),
        contactInfo: {
          email: profile?.email ?? '',
          phone: '',
          customerName,
        },
        customerName,
        noDirectMatchAcknowledged: true,
      });

      const nextStatus = await prepareBag(product.id);
      toast.success('Custom request added to bag.');
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
      subtitle="Review the fitting values required for this product before adding it to your custom bag."
      onClose={onClose}
      showCloseButton
      onDone={handleSubmit}
      doneLabel="Add custom"
      doneDisabled={!canSubmit}
      loading={submitting}
      scrollable
    >
      <View style={styles.group}>
        {loadingProfile ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <AppText variant="body" tone="muted">Loading fittings...</AppText>
          </View>
        ) : null}

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

        {error ? (
          <AppText variant="caption" tone="danger">{error}</AppText>
        ) : (
          <AppText variant="caption" tone="muted">
            The custom request will be saved in your bag for unified checkout.
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
