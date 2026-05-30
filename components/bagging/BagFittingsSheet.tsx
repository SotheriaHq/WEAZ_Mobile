import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { ProfileApi, type SizeFitProfile } from '@/src/api/ProfileApi';
import { baggingService } from '@/src/services/bagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import type { BagSourceType, ProductBagStatus } from '@/src/api/StoreApi';

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
  onResolved?: (nextStatus: ProductBagStatus) => void;
};

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part))
    .join(' ');

const extractMeasurements = (sizeFit: SizeFitProfile | null | undefined) => {
  const source = sizeFit?.measurements ?? {};
  return Object.entries(source).reduce<Record<string, string>>((acc, [key, value]) => {
    const raw =
      value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)
        ? (value as Record<string, unknown>).value
        : value;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      acc[key] = String(parsed);
    }
    return acc;
  }, {});
};

export default function BagFittingsSheet({ visible, product, status, onClose, onResolved }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missingMeasurements = useMemo(
    () => status?.custom.missingMeasurementKeys ?? [],
    [status?.custom.missingMeasurementKeys],
  );
  const measurementsToEdit = useMemo(
    () => (
      missingMeasurements.length > 0
        ? missingMeasurements
        : status?.custom.freshnessState === 'STALE' || status?.custom.freshnessState === 'VERY_STALE'
          ? (
              status.custom.veryStaleMeasurementKeys.length > 0
                ? status.custom.veryStaleMeasurementKeys
                : status.custom.staleMeasurementKeys.length > 0
                  ? status.custom.staleMeasurementKeys
                  : status.custom.requiredMeasurementKeys
            )
          : []
    ),
    [
      missingMeasurements,
      status?.custom.freshnessState,
      status?.custom.requiredMeasurementKeys,
      status?.custom.staleMeasurementKeys,
      status?.custom.veryStaleMeasurementKeys,
    ],
  );

  useEffect(() => {
    if (!visible) return;

    let active = true;
    setError(null);
    setLoading(true);

    void ProfileApi.getSizeFit()
      .then((sizeFit) => {
        if (!active) return;
        const currentMeasurements = extractMeasurements(sizeFit);
        setValues(
          measurementsToEdit.reduce<Record<string, string>>((acc, key) => {
            acc[key] = currentMeasurements[key] ?? '';
            return acc;
          }, {}),
        );
      })
      .catch(() => {
        if (active) setError('Unable to load your current fittings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [measurementsToEdit, visible]);

  const unresolvedKeys = useMemo(
    () => measurementsToEdit.filter((key) => {
      const parsed = Number(values[key]);
      return !(Number.isFinite(parsed) && parsed > 0);
    }),
    [measurementsToEdit, values],
  );

  const handleSave = async () => {
    if (!product || !status) return;
    if (unresolvedKeys.length > 0) {
      setError(`Add ${unresolvedKeys.length} missing measurement${unresolvedKeys.length === 1 ? '' : 's'} to continue.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const current = await ProfileApi.getSizeFit();
      const currentMeasurements = current?.measurements ?? {};
      const nextMeasurements = {
        ...currentMeasurements,
        ...measurementsToEdit.reduce<Record<string, number>>((acc, key) => {
          acc[key] = Number(values[key]);
          return acc;
        }, {}),
      };

      await ProfileApi.updateSizeFit({
        measurements: nextMeasurements,
        preferredLengthUnit: current?.preferredLengthUnit ?? 'CM',
        notes: current?.notes ?? undefined,
      });

      const sourceType = status.sourceType ?? product.sourceType ?? 'PRODUCT';
      const sourceId = status.sourceId ?? product.sourceId ?? product.id;
      const nextStatus = sourceType === 'PRODUCT'
        ? await baggingService.prepareBag(product.id)
        : await baggingService.prepareSourceBag(sourceType, sourceId);
      toast.success('Fittings updated.');
      onResolved?.(nextStatus);
    } catch (nextError) {
      const message =
        nextError instanceof Error && nextError.message.trim()
          ? nextError.message
          : 'Unable to save fittings right now.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppBottomSheet
      visible={visible}
      title={`${status?.custom.freshnessState === 'STALE' || status?.custom.freshnessState === 'VERY_STALE' ? 'Update' : 'Finish'} fittings for ${product?.name || 'this item'}`}
      subtitle={status?.custom.freshnessState === 'STALE' || status?.custom.freshnessState === 'VERY_STALE' ? 'Refresh the measurements required for this bag request.' : 'Add the missing measurements before continuing this bag request.'}
      onClose={onClose}
      showCloseButton
      onDone={handleSave}
      doneLabel="Save"
      doneDisabled={loading || saving || measurementsToEdit.length === 0 || unresolvedKeys.length > 0}
      loading={saving}
      scrollable
    >
      <View style={styles.group}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <AppText variant="body" tone="muted">Loading fittings...</AppText>
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="subtitle">{status?.custom.freshnessState === 'STALE' || status?.custom.freshnessState === 'VERY_STALE' ? 'Measurements to refresh' : 'Missing measurements'}</AppText>
          {measurementsToEdit.length > 0 ? (
            measurementsToEdit.map((measurement) => (
              <Input
                key={measurement}
                label={`${toTitleCase(measurement)} (cm)`}
                value={values[measurement] ?? ''}
                onChangeText={(value) => {
                  setValues((current) => ({ ...current, [measurement]: value }));
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                error={unresolvedKeys.includes(measurement) ? 'Required' : undefined}
              />
            ))
          ) : (
            <AppText variant="caption" tone="muted">
              No measurements are required. Continue into the custom order flow.
            </AppText>
          )}
        </View>

        {error ? (
          <AppText variant="caption" tone="danger">{error}</AppText>
        ) : (
          <AppText variant="caption" tone="muted">
            Only the missing fields for this product are shown here.
          </AppText>
        )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: tokens.spacing.lg,
  },
  section: {
    gap: tokens.spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
});
