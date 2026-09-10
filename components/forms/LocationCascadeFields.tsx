import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { SelectField } from '@/components/forms/SelectField';
import {
  useLocationCascade,
  type LocationCascadeValue,
} from '@/src/hooks/useLocationCascade';
import { tokens } from '@/src/styles/tokens';

/**
 * Country → State/Province → City (LGA) → street address, as one block.
 *
 * ## Why it can never dead-end
 *
 * The option lists come from a third-party API. Rendering an empty list as a
 * disabled dropdown — which is what every hand-rolled copy of this did — turns
 * somebody else's outage into a form the user physically cannot complete: they
 * pick a country, the state field stays grey forever, and nothing explains why.
 *
 * So each level shows a picker when it has options and a plain text input when
 * it does not, once we know the list is not merely in flight. Flipping while
 * loading would yank the control out from under a finger, so `loading` gates the
 * swap. This mirrors web's `LocationCascadeSelect` deliberately.
 *
 * ## Why City and LGA are one field
 *
 * They are the same administrative level under different names: Nigeria divides
 * a state into Local Government Areas, most other countries into cities. The
 * upstream API returns one list for the level whatever it is called, and giving
 * it two fields would ask every Nigerian to fill in a city AND an LGA when they
 * only have one, or leave one of the two permanently empty. The label names both
 * so neither reader is left looking for a field that is not there.
 */

export const LOCATION_FIELD_LABELS = {
  country: 'Country',
  state: 'State / Province',
  city: 'City / LGA',
  address: 'Street address',
} as const;

type Sheet = 'country' | 'state' | 'city' | null;

export type LocationCascadeFieldsProps = {
  value: LocationCascadeValue & { address: string };
  onChange: (patch: Partial<LocationCascadeValue & { address: string }>) => void;
  /** `bare` when the parent panel draws its own field rows. */
  variant?: 'default' | 'bare' | 'underline';
  /** Rendered around each field, so a caller can supply its own row chrome. */
  renderField?: (field: React.ReactNode, key: string) => React.ReactNode;
  /** Hidden when a caller collects the street address elsewhere. */
  showAddress?: boolean;
  addressHelperText?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Reports the resolved ISO2 so a phone field can follow the country. */
  onCountryIso2Change?: (iso2: string | undefined) => void;
};

export function LocationCascadeFields({
  value,
  onChange,
  variant = 'default',
  renderField,
  showAddress = true,
  addressHelperText,
  disabled = false,
  style,
  onCountryIso2Change,
}: LocationCascadeFieldsProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const cascade = useLocationCascade(value);

  const lastReportedIso2 = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (lastReportedIso2.current === cascade.countryIso2) return;
    lastReportedIso2.current = cascade.countryIso2;
    onCountryIso2Change?.(cascade.countryIso2);
  }, [cascade.countryIso2, onCountryIso2Change]);

  const wrap = (node: React.ReactNode, key: string) =>
    renderField ? (
      <React.Fragment key={key}>{renderField(node, key)}</React.Fragment>
    ) : (
      <React.Fragment key={key}>{node}</React.Fragment>
    );

  /**
   * A level is typable when its PARENT is chosen, its list is settled, and the
   * list is still empty. Anything else is either not ready yet or has options.
   */
  const stateIsFreeText =
    Boolean(value.country) && !cascade.loading && cascade.stateOptions.length === 0;
  const cityIsFreeText =
    Boolean(value.state) && !cascade.loading && cascade.cityOptions.length === 0;

  const labelFor = (options: { value: string; label: string }[], current: string) =>
    options.find((option) => option.value === current)?.label ?? current;

  return (
    /*
      When the caller supplies its own row chrome the rows carry their own
      dividers and padding, so the stack must NOT also add a gap — that would
      float these fields apart inside a panel whose other rows are flush.
    */
    <View style={[renderField ? null : styles.stack, style]}>
      {wrap(
        <SelectField
          label={LOCATION_FIELD_LABELS.country}
          value={labelFor(cascade.countryOptions, value.country)}
          placeholder="Select country"
          variant={variant}
          disabled={disabled}
          onPress={() => setSheet('country')}
          testID="location-country"
        />,
        'country',
      )}

      {wrap(
        stateIsFreeText ? (
          <Input
            label={LOCATION_FIELD_LABELS.state}
            value={value.state}
            onChangeText={(next) => onChange({ state: next, city: '' })}
            placeholder="Type your state or province"
            helperText="We could not load the list for this country — type it in."
            variant={variant}
            editable={!disabled}
          />
        ) : (
          <SelectField
            label={LOCATION_FIELD_LABELS.state}
            value={labelFor(cascade.stateOptions, value.state)}
            placeholder={
              !value.country
                ? 'Select country first'
                : cascade.loading
                  ? 'Loading…'
                  : 'Select state / province'
            }
            variant={variant}
            disabled={disabled || !value.country}
            loading={cascade.loading && Boolean(value.country)}
            onPress={() => setSheet('state')}
            testID="location-state"
          />
        ),
        'state',
      )}

      {wrap(
        cityIsFreeText ? (
          <Input
            label={LOCATION_FIELD_LABELS.city}
            value={value.city}
            onChangeText={(next) => onChange({ city: next })}
            placeholder="Type your city or LGA"
            helperText="We could not load the list for this state — type it in."
            variant={variant}
            editable={!disabled}
          />
        ) : (
          <SelectField
            label={LOCATION_FIELD_LABELS.city}
            value={labelFor(cascade.cityOptions, value.city)}
            placeholder={
              !value.state
                ? 'Select state first'
                : cascade.loading
                  ? 'Loading…'
                  : 'Select city / LGA'
            }
            variant={variant}
            disabled={disabled || !value.state}
            loading={cascade.loading && Boolean(value.state)}
            onPress={() => setSheet('city')}
            testID="location-city"
          />
        ),
        'city',
      )}

      {showAddress
        ? wrap(
            <Input
              label={LOCATION_FIELD_LABELS.address}
              value={value.address}
              onChangeText={(next) => onChange({ address: next })}
              placeholder="House number and street"
              autoComplete="street-address"
              helperText={addressHelperText}
              variant={variant}
              editable={!disabled}
            />,
            'address',
          )
        : null}

      {cascade.error ? (
        <AppText variant="caption" tone="warning" style={styles.error}>
          {cascade.error}
        </AppText>
      ) : null}

      {/*
        Choosing a country invalidates the state, and a state invalidates the
        city — clearing them is not tidiness, it is the difference between
        "Lagos, Ghana" being impossible and being merely unlikely.
      */}
      <AppSelectSheet
        visible={sheet === 'country'}
        title={LOCATION_FIELD_LABELS.country}
        subtitle="Where are you based?"
        options={cascade.countryOptions}
        value={value.country || null}
        searchable
        searchPlaceholder="Search country"
        searchEmptyMessage="No country matches that."
        onChange={(next) => onChange({ country: next, state: '', city: '' })}
        onClose={() => setSheet(null)}
      />
      <AppSelectSheet
        visible={sheet === 'state'}
        title={LOCATION_FIELD_LABELS.state}
        options={cascade.stateOptions}
        value={value.state || null}
        searchable
        searchPlaceholder="Search state or province"
        searchEmptyMessage="No state or province matches that."
        loading={cascade.loading}
        emptyMessage="No states listed for this country."
        onChange={(next) => onChange({ state: next, city: '' })}
        onClose={() => setSheet(null)}
      />
      <AppSelectSheet
        visible={sheet === 'city'}
        title={LOCATION_FIELD_LABELS.city}
        options={cascade.cityOptions}
        value={value.city || null}
        searchable
        searchPlaceholder="Search city or LGA"
        searchEmptyMessage="No city or LGA matches that."
        loading={cascade.loading}
        emptyMessage="No cities listed for this state."
        onChange={(next) => onChange({ city: next })}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: tokens.spacing.md,
  },
  error: {
    // Padded on its own, because with `renderField` this notice is the one
    // child that does not go through the caller's row wrapper.
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.sm,
  },
});

export default LocationCascadeFields;
