/**
 * My fittings — a screen, not a sheet.
 *
 * ## Why this is a screen
 *
 * This was a bottom sheet on the profile, and it had a fault that cost people
 * their measurements: its Cancel/Done footer sat below a body that could outgrow
 * the sheet's 88% cap once the keyboard was up, so on a normal handset the
 * buttons were simply not on screen. There is no visible way to commit a form
 * whose only commit control is off-screen — so shoppers typed their fittings,
 * swiped the sheet away, and lost every value. A sheet is the wrong container
 * for a form this size regardless: it competes with the keyboard for the same
 * vertical space, and it has to be dismissible by a gesture that also discards.
 *
 * A full screen has the height, a back button that means "go back", and a
 * footer pinned by `KeyboardStickyFooter` that rides the keyboard instead of
 * being buried under it. It lives OUTSIDE the `(tabs)` group deliberately: a
 * drill-down window gets a back control, not the floating island.
 *
 * ## What it collects
 *
 * Two clearly separated groups, because they answer different questions:
 *
 *  - **The eight core points** are what `SizeComputationService` weighs. They
 *    are the only ones that decide whether a size can be computed at all, so
 *    they are the only ones marked required, and they are the ones worth asking
 *    for once up front.
 *  - **Everything else** is garment-specific — a brand asks for it against a
 *    particular design, at order time, in `BagFittingsSheet`. Those values are
 *    kept and shown here so they are editable in one place, but they are never
 *    presented as something the shopper owes us.
 *
 * Collecting the second group up front is what turned the profile into a
 * nineteen-row wall of numbers. Order-time collection stays exactly as it was.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { SettingsStateCard } from '@/components/settings/SettingsPrimitives';
import { ComputedSizePanel } from '@/components/sizing/ComputedSize';
import { ProfileApi, type ComputedSizeFitProfile, type SizeFitProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { resolveComputedSizeState } from '@/src/features/sizing/computedSize';
import {
  CORE_MEASUREMENT_SLOTS,
  MEASUREMENT_UNIT_LABELS,
  collapseMeasurements,
  convertMeasurementValues,
  getMeasurementHint,
  type CoreMeasurementKey,
} from '@/src/features/sizing/measurementCatalog';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { drillDownPush } from '@/src/utils/mobileNavigation';

type LengthUnit = 'CM' | 'IN';
type CoreValues = Record<CoreMeasurementKey, string>;

const FOOTER_CLEARANCE = 132;

const emptyCoreValues = (): CoreValues =>
  Object.fromEntries(CORE_MEASUREMENT_SLOTS.map((slot) => [slot.key, ''])) as CoreValues;

const sanitizeNumeric = (value: string) => value.replace(/[^0-9.]/g, '');

export default function FittingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, isAuthenticated } = useAuth();

  const [sizeFit, setSizeFit] = useState<SizeFitProfile | null>(null);
  const [computed, setComputed] = useState<ComputedSizeFitProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useState<LengthUnit>('CM');
  const [coreValues, setCoreValues] = useState<CoreValues>(emptyCoreValues);
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [extrasExpanded, setExtrasExpanded] = useState(false);

  /**
   * The form is the draft; the server response is only its seed.
   *
   * Without this guard a background refresh landing mid-typing would overwrite
   * whatever the user had entered with the stored values — the same class of
   * bug as the missing Done button, and just as silent.
   */
  const seededRef = useRef(false);

  const [extraKeys, setExtraKeys] = useState<Array<{ key: string; label: string }>>([]);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [profile, computedProfile] = await Promise.all([
        ProfileApi.getSizeFit(),
        ProfileApi.getComputedSizeFit().catch(() => null),
      ]);
      setSizeFit(profile);
      setComputed(computedProfile);

      if (!seededRef.current) {
        const collapsed = collapseMeasurements(profile?.measurements);
        setUnit(profile?.preferredLengthUnit ?? 'CM');
        setCoreValues(
          Object.fromEntries(
            CORE_MEASUREMENT_SLOTS.map((slot) => [slot.key, collapsed.core[slot.key] ?? '']),
          ) as CoreValues,
        );
        setExtraKeys(collapsed.extras.map(({ key, label }) => ({ key, label })));
        setExtraValues(
          Object.fromEntries(collapsed.extras.map((entry) => [entry.key, entry.value])),
        );
        seededRef.current = true;
      }
    } catch (error) {
      setLoadError(
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Unable to load your fittings.',
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    void load();
  }, [load, status]);

  const computedState = useMemo(() => resolveComputedSizeState(computed), [computed]);

  const savedCoreCount = useMemo(
    () =>
      CORE_MEASUREMENT_SLOTS.filter((slot) => {
        const parsed = Number(coreValues[slot.key]);
        return Number.isFinite(parsed) && parsed > 0;
      }).length,
    [coreValues],
  );

  const handleUnitChange = useCallback(
    (nextUnit: LengthUnit) => {
      if (nextUnit === unit) return;
      // See `convertMeasurementValues`: stored scalars carry no unit marker, so
      // flipping the toggle without converting silently redefines a 182cm
      // shopper as 182 INCHES, which the server then multiplies into a
      // four-and-a-half-metre body.
      setCoreValues((values) => convertMeasurementValues(values, unit, nextUnit));
      setExtraValues((values) => convertMeasurementValues(values, unit, nextUnit));
      setUnit(nextUnit);
    },
    [unit],
  );

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      /*
        Canonical keys only.

        The server fans each value back out to its gendered registry key
        (`CHEST_BUST` -> `MEN_CHEST`) and prefers the canonical one when they
        disagree, so writing canonical is what makes this screen the authority
        over whatever key a brand's order form happened to use.
      */
      const measurements: Record<string, string> = {};
      for (const slot of CORE_MEASUREMENT_SLOTS) {
        const value = String(coreValues[slot.key] ?? '').trim();
        if (value) measurements[slot.key] = value;
      }
      for (const { key } of extraKeys) {
        const value = String(extraValues[key] ?? '').trim();
        if (value) measurements[key] = value;
      }

      const updated = await ProfileApi.updateSizeFit({
        measurements,
        preferredLengthUnit: unit,
      });
      setSizeFit(updated);
      // The estimate is derived from what we just saved, so re-read it rather
      // than leaving a stale size on screen next to fresh numbers.
      setComputed(await ProfileApi.getComputedSizeFit().catch(() => computed));
      toast.success('Fittings saved.');
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Could not save your fittings. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [computed, coreValues, extraKeys, extraValues, saving, toast, unit]);

  if (status === 'loading' || (loading && !sizeFit)) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <FittingsHeader />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="body" tone="muted">
            Loading your fittings...
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <FittingsHeader />
        <View style={styles.stateContent}>
          <SettingsStateCard
            title="Sign in required"
            body="Your fittings are saved to your account."
            actionTitle="Sign in"
            onAction={() => drillDownPush('/(auth)/login' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !sizeFit) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <FittingsHeader />
        <View style={styles.stateContent}>
          <SettingsStateCard
            title="Could not load your fittings"
            body={loadError}
            actionTitle="Retry"
            onAction={() => void load()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const unitSuffix = unit.toLowerCase();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <FittingsHeader />

      <KeyboardAwareFormScroll
        style={styles.flex}
        contentContainerStyle={styles.content}
        bottomOffset={FOOTER_CLEARANCE + tokens.spacing.lg}
        extraKeyboardSpace={FOOTER_CLEARANCE}
        automaticallyAdjustKeyboardInsets={false}
      >
        <ComputedSizePanel state={computedState} />

        <View style={styles.section}>
          <AppText variant="smallBold" tone="secondary">
            Units
          </AppText>
          <View style={styles.unitRow}>
            {(['CM', 'IN'] as const).map((option) => {
              const selected = option === unit;
              return (
                <Pressable
                  key={option}
                  onPress={() => handleUnitChange(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.unitPill,
                    {
                      backgroundColor: selected ? theme.colors.primarySoft : 'transparent',
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <AppText variant="bodyBold" tone={selected ? 'primary' : 'secondary'}>
                    {MEASUREMENT_UNIT_LABELS[option]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="bodyBold">Points we size you by</AppText>
            <AppText variant="captionBold" tone="muted">
              {savedCoreCount}/{CORE_MEASUREMENT_SLOTS.length}
            </AppText>
          </View>
          <AppText variant="captionRegular" tone="muted">
            These eight decide your size. Save them once and no brand has to ask again.
          </AppText>

          <View style={styles.fieldList}>
            {CORE_MEASUREMENT_SLOTS.map((slot) => (
              <Input
                key={slot.key}
                label={slot.label}
                required
                helperText={slot.hint}
                value={coreValues[slot.key]}
                onChangeText={(value) =>
                  setCoreValues((current) => ({
                    ...current,
                    [slot.key]: sanitizeNumeric(value),
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="0"
                trailing={
                  <AppText variant="captionRegular" tone="muted">
                    {unitSuffix}
                  </AppText>
                }
              />
            ))}
          </View>
        </View>

        {extraKeys.length > 0 ? (
          <View style={styles.section}>
            <Pressable
              onPress={() => setExtrasExpanded((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: extrasExpanded }}
              accessibilityLabel={`${extrasExpanded ? 'Hide' : 'Show'} points brands have asked you for`}
              style={({ pressed }) => [
                styles.disclosure,
                { borderTopColor: theme.colors.border },
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.disclosureCopy}>
                <AppText variant="bodyBold">Points brands have asked for</AppText>
                <AppText variant="captionRegular" tone="muted">
                  {extraKeys.length} saved from your orders. Not needed for your size.
                </AppText>
              </View>
              <AppText variant="captionBold" tone="secondary">
                {extrasExpanded ? '▲' : '▼'}
              </AppText>
            </Pressable>

            {extrasExpanded ? (
              <View style={styles.fieldList}>
                {extraKeys.map(({ key, label }) => (
                  <Input
                    key={key}
                    label={label}
                    helperText={getMeasurementHint(key) ?? undefined}
                    value={extraValues[key] ?? ''}
                    onChangeText={(value) =>
                      setExtraValues((current) => ({ ...current, [key]: sanitizeNumeric(value) }))
                    }
                    keyboardType="decimal-pad"
                    placeholder="0"
                    trailing={
                      <AppText variant="captionRegular" tone="muted">
                        {unitSuffix}
                      </AppText>
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.note, { borderTopColor: theme.colors.border }]}>
          <AppText variant="smallBold" tone="secondary">
            Measure over light clothing, tape snug but not tight.
          </AppText>
          <AppText variant="captionRegular" tone="muted">
            A brand only ever sees the points its design needs, and only when you place an order.
          </AppText>
        </View>
      </KeyboardAwareFormScroll>

      {/*
        Pinned, and riding the keyboard.

        The sheet this screen replaced put its footer below a scrolling body, so
        the keyboard could bury Done and there was no way to commit the form.
        `KeyboardStickyFooter` follows the platform keyboard inset, so Save is
        on screen in the first frame even when this screen opens with a keyboard
        already up.
      */}
      <KeyboardStickyFooter offset={{ closed: 0, opened: 0 }}>
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.bg,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom + tokens.spacing.lg, tokens.spacing['2xl']),
            },
          ]}
        >
          <Button
            title="Save fittings"
            size="md"
            onPress={() => void handleSave()}
            loading={saving}
          />
        </View>
      </KeyboardStickyFooter>
    </SafeAreaView>
  );
}

function FittingsHeader() {
  const { theme } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <AppBackButton fallbackHref="/(tabs)/me" />
      <View style={styles.headerCopy}>
        <AppText variant="title" numberOfLines={1}>
          My fittings
        </AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          Saved once, reused on every custom order
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  stateContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  content: {
    gap: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: FOOTER_CLEARANCE,
  },
  section: {
    gap: tokens.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  unitRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  unitPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldList: {
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.xs,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    minHeight: 44,
    paddingTop: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  disclosureCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  note: {
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.82,
  },
});
