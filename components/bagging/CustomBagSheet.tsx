import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeliveryAddressBook } from '@/components/delivery/DeliveryAddressBook';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { MuseLoader } from '@/components/ui/MuseLoader';
import { ThemedSwitch } from '@/components/ui/ThemedSwitch';
import { ProfileApi, type SavedDeliveryAddress, type SizeFitProfile } from '@/src/api/ProfileApi';
import {
  MobileStoreApi,
  type BagSourceType,
  type CustomPricePreview,
  type ProductBagStatus,
} from '@/src/api/StoreApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import {
  getMobileCheckoutUnavailableMessage,
  isMobileCheckoutEnabled,
} from '@/src/features/checkout/mobileCheckoutGate';
import { displayNameOf } from '@/src/features/delivery/deliveryAddressBook';
import {
  formatMeasurementLabel,
  getMeasurementHint,
} from '@/src/features/sizing/measurementCatalog';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { formatMoney } from '@/src/utils/money';
import { normalizePhoneToE164 } from '@/src/utils/phoneNumber';

/**
 * The custom order sheet — the native twin of the web composer.
 *
 * It runs the same sequence web does, in one sheet:
 *
 *   1. Measurements — the points THIS brand asked for, filled from fittings.
 *   2. Delivery     — the saved address book: choose, edit, or add another.
 *   3. Get price    — the server prices the request and holds that price,
 *                     and the breakdown is shown BEFORE anything is bagged.
 *   4. Add to bag   — only now does the request go into the bag, at the price
 *                     the shopper has just seen. Payment happens at checkout.
 *
 * It used to do steps 3 and 4 in one silent tap. The price-preview response was
 * reduced to three ids in the API client, so the sheet had no price to show,
 * and a shopper added a custom order without ever seeing what it cost.
 *
 * Delivery is here, not only at checkout, because a custom request is priced
 * WITH its delivery: the shipping fee is quoted from the address and locked
 * into the price in step 3, and the order keeps that address. Web collects it
 * in the same place for the same reason.
 */

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
  /**
   * The shopper came here straight from saving their fittings. The sheet then
   * says it is the second step, so the two sheets read as one flow instead of
   * two unrelated forms asking for the same numbers.
   */
  afterFittings?: boolean;
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

const formatHoldTime = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isHoldExpired = (iso: string | null) => {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time <= Date.now();
};

export default function CustomBagSheet({
  visible,
  product,
  status,
  afterFittings = false,
  onClose,
  onCompleted,
}: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { addCustomOrder, prepareBag, prepareSourceBag } = useMobileBagging();
  const checkoutEnabled = isMobileCheckoutEnabled();

  const [values, setValues] = useState<Record<string, string>>({});
  const [loadingFittings, setLoadingFittings] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMeasurements, setEditingMeasurements] = useState(false);

  const [selectedAddress, setSelectedAddress] = useState<SavedDeliveryAddress | null>(null);
  const [addressEditing, setAddressEditing] = useState(false);

  /**
   * The held price. Cleared the moment anything it was computed from changes,
   * so the button can never add a request at a price calculated for different
   * measurements or a different address.
   */
  const [quote, setQuote] = useState<CustomPricePreview | null>(null);
  const [noMatchAcknowledged, setNoMatchAcknowledged] = useState(false);

  /**
   * The signed-in account, as the prefill for a new address and the fallback
   * for a saved one that lacks a contact. The account has the email and phone
   * the shopper gave at sign-up — the profile endpoint this sheet used to read
   * carries no phone at all, which is why the phone never prefilled.
   */
  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  const accountEmail = user?.email?.trim() ?? '';
  const accountPhone = user?.phoneNumber?.trim() ?? '';
  const addressDefaults = useMemo(
    () => ({ customerName: accountName, contactEmail: accountEmail, phone: accountPhone }),
    [accountEmail, accountName, accountPhone],
  );

  const requiredKeys = useMemo(
    () => status?.custom.requiredMeasurementKeys ?? [],
    [status?.custom.requiredMeasurementKeys],
  );

  const invalidateQuote = useCallback(() => {
    setQuote(null);
    setNoMatchAcknowledged(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!visible || !status) return;

    let active = true;
    setError(null);
    setQuote(null);
    setNoMatchAcknowledged(false);
    setEditingMeasurements(false);

    if (!checkoutEnabled) {
      setLoadingFittings(false);
      return () => {
        active = false;
      };
    }

    setLoadingFittings(true);
    void ProfileApi.getSizeFit()
      .then((sizeFit) => {
        if (!active) return;
        const measurements = extractNumericMeasurements(sizeFit);
        const seeded = requiredKeys.reduce<Record<string, string>>((acc, key) => {
          acc[key] = measurements[key] ? String(measurements[key]) : '';
          return acc;
        }, {});
        setValues(seeded);
        // Fields only when something is missing; a complete set shows as a
        // summary. Decided from the loaded values, not an effect.
        setEditingMeasurements(requiredKeys.some((key) => !seeded[key]));
      })
      .catch((nextError) => {
        if (!active) return;
        setError(toApiErrorMessage(nextError, 'Unable to load your fittings.'));
      })
      .finally(() => {
        if (active) setLoadingFittings(false);
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

  const deliveryName = selectedAddress ? displayNameOf(selectedAddress) || accountName : '';
  const deliveryEmail = selectedAddress?.contactEmail || accountEmail;
  const deliveryPhone = selectedAddress?.phone || accountPhone;

  /**
   * The address the order keeps — and the one its shipping fee is quoted from.
   * It now carries the street: only city, state and country used to be sent, so
   * a custom order placed from the app reached the brand with nowhere to deliver.
   */
  const shippingAddress = selectedAddress
    ? {
        street: selectedAddress.street,
        ...(selectedAddress.apartment ? { apartment: selectedAddress.apartment } : {}),
        city: selectedAddress.city,
        state: selectedAddress.state,
        ...(selectedAddress.postalCode ? { postalCode: selectedAddress.postalCode } : {}),
        country: selectedAddress.country,
      }
    : null;

  const manualQuote = quote?.quoteStatus === 'MANUAL_QUOTE_REQUIRED';
  const busy = loadingFittings || pricing || submitting;

  const handleGetPrice = async () => {
    if (!product || !status?.custom.configurationId) return;
    if (missingKeys.length > 0) {
      setEditingMeasurements(true);
      setError(`Add ${missingKeys.length} missing measurement${missingKeys.length === 1 ? '' : 's'} to get your price.`);
      return;
    }
    if (addressEditing) {
      setError('Save the address you are editing first.');
      return;
    }
    if (!selectedAddress || !shippingAddress) {
      setError('Choose or add a delivery address to get your price.');
      return;
    }

    setPricing(true);
    setError(null);
    try {
      const next = await MobileStoreApi.previewCustomPrice({
        configurationId: status.custom.configurationId,
        measurementValues,
        rushSelected: false,
        shippingAddress,
      });
      setQuote(next);
      setNoMatchAcknowledged(false);
      if (next.quoteStatus === 'MANUAL_QUOTE_REQUIRED') {
        toast.info('This request needs the brand to quote it before it can be added to your bag.');
      } else if (!next.checkoutIntentId) {
        setError('WIEZ could not hold a price for this request. Try again.');
      }
    } catch (nextError) {
      const message = toApiErrorMessage(nextError, 'Unable to price this custom request.');
      setError(message);
      toast.error(message);
    } finally {
      setPricing(false);
    }
  };

  const handleAddToBag = async () => {
    if (!product || !status?.custom.configurationId || !quote?.checkoutIntentId || !shippingAddress) return;
    if (isHoldExpired(quote.priceLockExpiresAt)) {
      invalidateQuote();
      setError('The price hold ended. Get your price again to continue.');
      return;
    }
    if (quote.noDirectMatch && !noMatchAcknowledged) {
      setError('Confirm the size-match note above before adding this to your bag.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const sourceType = status.sourceType ?? product.sourceType ?? 'PRODUCT';
      const sourceId = status.sourceId ?? product.sourceId ?? product.id;

      await addCustomOrder(product.id, {
        checkoutIntentId: quote.checkoutIntentId,
        configurationId: status.custom.configurationId,
        configurationVersionId: quote.configurationVersionId,
        measurementValues,
        shippingAddress,
        contactInfo: {
          email: deliveryEmail,
          phone: normalizePhoneToE164(deliveryPhone) ?? deliveryPhone,
          customerName: deliveryName,
        },
        customerName: deliveryName,
        noDirectMatchAcknowledged: quote.noDirectMatch ? noMatchAcknowledged : true,
      }, sourceType, sourceId);

      const nextStatus = sourceType === 'PRODUCT'
        ? await prepareBag(product.id)
        : await prepareSourceBag(sourceType, sourceId);
      toast.success('Added to your bag. Pay for it at checkout.');
      onCompleted(nextStatus);
    } catch (nextError) {
      const message = toApiErrorMessage(nextError, 'Unable to add this custom request to your bag.');
      // A lapsed hold is recoverable: drop the quote so the button asks again.
      if (/INTENT_EXPIRED/i.test(message)) {
        invalidateQuote();
        setError('The price hold ended before this was added. Get your price again.');
        return;
      }
      if (/DUPLICATE_IN_BAG/i.test(message)) {
        setError('This custom request is already in your bag.');
        return;
      }
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const primary = !checkoutEnabled
    ? { label: 'Unavailable', onPress: () => undefined, disabled: true }
    : manualQuote
      ? { label: 'Close', onPress: onClose, disabled: false }
      : quote?.checkoutIntentId
        ? {
            label: 'Add to bag',
            onPress: () => void handleAddToBag(),
            disabled: busy || (quote.noDirectMatch && !noMatchAcknowledged),
          }
        : {
            label: 'Get price',
            onPress: () => void handleGetPrice(),
            disabled: busy || !product || addressEditing,
          };

  const updateMeasurement = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    invalidateQuote();
  };

  const handleSelectAddress = useCallback(
    (address: SavedDeliveryAddress | null) => {
      setSelectedAddress(address);
      invalidateQuote();
    },
    [invalidateQuote],
  );

  return (
    <AppBottomSheet
      visible={visible}
      title={`Custom order · ${product?.name || 'this item'}`}
      headerMeta={afterFittings ? 'Step 2 of 2' : undefined}
      subtitle={
        !checkoutEnabled
          ? 'Mobile custom checkout is paused for controlled MVP testing.'
          : quote?.checkoutIntentId && !manualQuote
            ? 'Your price is held. Add it to your bag, then pay at checkout.'
            : 'Check your measurements and delivery, then get your price.'
      }
      onClose={onClose}
      showCloseButton
      onDone={primary.onPress}
      doneLabel={primary.label}
      doneDisabled={primary.disabled}
      loading={pricing || submitting}
      scrollable
    >
      <View style={styles.stack}>
        {!checkoutEnabled ? (
          <AppText variant="body" tone="muted">
            {getMobileCheckoutUnavailableMessage()}
          </AppText>
        ) : (
          <>
            {/* ── 1. Measurements ─────────────────────────────────────── */}
            {loadingFittings ? (
              <View style={styles.loadingRow}>
                <MuseLoader size={20} />
                <AppText variant="body" tone="muted">Loading your fittings…</AppText>
              </View>
            ) : requiredKeys.length === 0 ? (
              <AppText variant="body" tone="muted">
                This piece does not need any measurements.
              </AppText>
            ) : editingMeasurements ? (
              <View style={styles.group}>
                <View style={styles.sectionHead}>
                  <AppText variant="subtitle">Your measurements</AppText>
                  <AppText variant="caption" tone="muted">
                    The points the brand needs for this piece, in centimetres.
                  </AppText>
                </View>
                {requiredKeys.map((key) => (
                  <Input
                    key={key}
                    label={`${formatMeasurementLabel(key)} (cm)`}
                    value={values[key] ?? ''}
                    onChangeText={(value) => updateMeasurement(key, value)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    helperText={getMeasurementHint(key) ?? undefined}
                    error={missingKeys.includes(key) ? 'Required' : undefined}
                  />
                ))}
                {missingKeys.length === 0 ? (
                  <Button
                    title="Done"
                    size="sm"
                    variant="secondary"
                    onPress={() => setEditingMeasurements(false)}
                  />
                ) : null}
              </View>
            ) : (
              /*
                A summary, not the same fields again. Straight after the fittings
                sheet these numbers were just typed and saved; asking for them a
                second time in an identical form is what made two sheets look
                like two different, unrelated tasks.
              */
              <Card padding="md" style={styles.summaryCard}>
                <View style={styles.summaryHead}>
                  <AppText variant="captionBold" tone="muted">
                    Your measurements
                  </AppText>
                  <Button
                    title="Edit"
                    size="sm"
                    variant="secondary"
                    onPress={() => setEditingMeasurements(true)}
                  />
                </View>
                {requiredKeys.map((key) => (
                  <View key={key} style={styles.summaryRow}>
                    <AppText variant="body" tone="secondary" numberOfLines={1} style={styles.summaryLabel}>
                      {formatMeasurementLabel(key)}
                    </AppText>
                    <AppText variant="bodyBold">{values[key]} cm</AppText>
                  </View>
                ))}
              </Card>
            )}

            {/* ── 2. Delivery ─────────────────────────────────────────── */}
            <DeliveryAddressBook
              title="Delivering to"
              subtitle="Shipping is priced from this address, so it is set before your price."
              selectedId={selectedAddress?.id ?? null}
              onSelect={handleSelectAddress}
              defaults={addressDefaults}
              onEditingChange={setAddressEditing}
            />

            {/* ── 3. Price ────────────────────────────────────────────── */}
            {quote && manualQuote ? (
              <Card padding="md" style={styles.summaryCard}>
                <AppText variant="subtitle">The brand will quote this one</AppText>
                <AppText variant="body" tone="muted">
                  These measurements are outside what the brand prices automatically. They will review the
                  request and send you a price before anything is added to your bag.
                </AppText>
              </Card>
            ) : quote?.priceSummary ? (
              <Card padding="md" style={styles.summaryCard}>
                <AppText variant="captionBold" tone="muted">
                  Your price
                </AppText>
                {quote.priceSummary.subtotal != null ? (
                  <PriceRow label="Production" amount={quote.priceSummary.subtotal} currency={quote.currency} />
                ) : null}
                {quote.priceSummary.fabricCharge ? (
                  <PriceRow label="Fabric" amount={quote.priceSummary.fabricCharge} currency={quote.currency} />
                ) : null}
                {quote.priceSummary.rushFee ? (
                  <PriceRow label="Rush" amount={quote.priceSummary.rushFee} currency={quote.currency} />
                ) : null}
                <PriceRow label="Shipping" amount={quote.priceSummary.shippingFee ?? 0} currency={quote.currency} />
                <View style={[styles.totalRow, { borderTopColor: theme.colors.border }]}>
                  <AppText variant="bodyBold">Total</AppText>
                  <AppText variant="h3" tone="primary">
                    {formatMoney(quote.priceSummary.grandTotal, quote.currency)}
                  </AppText>
                </View>
                {formatHoldTime(quote.priceLockExpiresAt) ? (
                  <AppText variant="caption" tone="muted">
                    Price held until {formatHoldTime(quote.priceLockExpiresAt)}. Changing a measurement or the
                    address prices it again.
                  </AppText>
                ) : null}
                {quote.noDirectMatch ? (
                  /*
                    Web makes the shopper acknowledge this; the app used to send
                    `noDirectMatchAcknowledged: true` without ever showing it.
                  */
                  <View style={[styles.ackRow, { borderTopColor: theme.colors.border }]}>
                    <View style={styles.ackCopy}>
                      <AppText variant="captionBold" tone="warning">
                        No exact size match
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {quote.conversionGuidance || 'The nearest size band was used to price this request.'}
                      </AppText>
                    </View>
                    <ThemedSwitch
                      value={noMatchAcknowledged}
                      onValueChange={setNoMatchAcknowledged}
                      accessibilityLabel="I understand the nearest size band was used"
                    />
                  </View>
                ) : null}
              </Card>
            ) : (
              <AppText variant="caption" tone="muted">
                You will see the full price, including shipping, before anything is added to your bag.
              </AppText>
            )}
          </>
        )}

        {error ? (
          <AppText variant="caption" tone="danger">{error}</AppText>
        ) : null}
      </View>
    </AppBottomSheet>
  );
}

function PriceRow({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return (
    <View style={styles.priceRow}>
      <AppText variant="body" tone="secondary">{label}</AppText>
      <AppText variant="body">{formatMoney(amount, currency)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: tokens.spacing.lg,
  },
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
  summaryCard: {
    gap: tokens.spacing.sm,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  summaryLabel: {
    flex: 1,
    minWidth: 0,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing.sm,
  },
  ackCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
});
