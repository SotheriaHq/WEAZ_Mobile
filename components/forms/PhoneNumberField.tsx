import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CountryCode } from 'libphonenumber-js';

import { AppSelectSheet, type SelectSheetOption } from '@/components/ui/AppSelectSheet';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { SelectField } from '@/components/forms/SelectField';
import {
  PHONE_COUNTRIES,
  checkPhoneCompleteness,
  formatAsYouType,
  getDialCode,
  getExampleNationalNumber,
  getPhoneCountry,
  splitE164,
} from '@/src/utils/phoneCountries';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Phone entry with an explicit country and a derived dial code.
 *
 * Native had no such control: every phone field was a bare `TextInput` with a
 * `+234 800 000 0000` placeholder, validated against a single hardcoded default
 * country. Two things went wrong with that. A non-Nigerian user had no way to
 * say which country their number belonged to, and a Nigerian who typed their
 * number the way it is printed (0803…, 11 digits) got no guidance about the
 * trunk zero that has to be dropped once a country code is attached.
 *
 * ## The picker names a COUNTRY; the field shows the code. Never both.
 *
 * Web shipped this showing "🇳🇬 +234" on the trigger with "+234" printed again
 * two millimetres to its right inside the input. Repeating it is not just noise:
 * it reads as two separate inputs, and a reader shown a code twice reasonably
 * wonders whether they are meant to type it a third time. The country is the
 * only thing the picker says; the code appears exactly once, where it applies.
 *
 * ## Why the trigger is narrow and shows the code
 *
 * On a phone there is no room for "United Arab Emirates" beside a number field,
 * and a truncated country name is a country name you cannot read. The trigger
 * carries the flag and the dial code — both short, both unambiguous — and the
 * full name lives in the open list, which is always browsable and searchable by
 * name, ISO code or dial code.
 */

export type PhoneNumberFieldProps = {
  label?: string;
  /** Stored value in E.164 (e.g. '+2348031234567'). */
  value: string;
  /** Emits E.164 when complete, otherwise the raw partial for draft-saving. */
  onChange: (e164OrPartial: string, isValid: boolean) => void;
  /** Seeds the picker — e.g. from the country chosen in the location cascade. */
  defaultCountry?: CountryCode;
  required?: boolean;
  disabled?: boolean;
  /** External error (e.g. from a save attempt) shown while input is untouched. */
  error?: string;
  helperText?: string;
  /** Matches `Input`'s variants so the field stacks with the rest of the form. */
  variant?: 'default' | 'bare' | 'underline';
  testID?: string;
};

export function PhoneNumberField({
  label = 'Phone number',
  value,
  onChange,
  defaultCountry = 'NG',
  required = false,
  disabled = false,
  error,
  helperText,
  variant = 'default',
  testID,
}: PhoneNumberFieldProps) {
  const { theme } = useTheme();
  const initial = useMemo(
    () => splitE164(value, defaultCountry),
    // Seeded once; the field owns its state after mount so a remote profile
    // refresh cannot yank half-typed digits out from under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [iso2, setIso2] = useState<CountryCode>(initial.iso2);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);
  const [touched, setTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const nationalNumberRef = useRef(nationalNumber);
  nationalNumberRef.current = nationalNumber;

  // Adopt a country the parent supplies only while the field is still empty —
  // e.g. the user picks "Ghana" in the location cascade before typing a number.
  // Changing it under a number already typed would silently re-home it.
  useEffect(() => {
    if (!nationalNumberRef.current && defaultCountry && defaultCountry !== iso2) {
      setIso2(defaultCountry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCountry]);

  const completeness = useMemo(
    () => checkPhoneCompleteness(nationalNumber, iso2),
    [nationalNumber, iso2],
  );

  const emit = (nextNational: string, nextIso2: CountryCode) => {
    const result = checkPhoneCompleteness(nextNational, nextIso2);
    onChange(
      result.e164 ??
        (nextNational ? `${getDialCode(nextIso2)}${nextNational}` : ''),
      result.isValid,
    );
  };

  /*
    The flag and the full name are both in the label so the open list is
    browsable; `description` carries the dial code so it is searchable and
    visible without crowding the name.
  */
  const countryOptions: SelectSheetOption[] = useMemo(
    () =>
      PHONE_COUNTRIES.map((country) => ({
        value: country.iso2,
        label: country.flag ? `${country.flag}  ${country.name}` : country.name,
        description: `${country.iso2} · +${country.callingCode}`,
      })),
    [],
  );

  const selected = getPhoneCountry(iso2);
  const placeholder = useMemo(
    () => getExampleNationalNumber(iso2) || 'Phone number',
    [iso2],
  );

  const showError = touched && !completeness.isEmpty && Boolean(completeness.error);
  const showRequired = touched && required && completeness.isEmpty;
  const visibleError = showError
    ? completeness.error
    : showRequired
      ? 'Phone number is required'
      : !touched
        ? error
        : undefined;

  return (
    <View>
      <View style={styles.row}>
        {/*
          The picker is the SMALLER of the two controls. The number is what
          someone actually types, so it gets the remaining width — the other way
          round leaves about 200px to type a phone number into.
        */}
        <SelectField
          label={label}
          hideLabel
          value={
            selected
              ? `${selected.flag ? `${selected.flag} ` : ''}${getDialCode(iso2)}`
              : getDialCode(iso2)
          }
          placeholder="Code"
          /*
            Always bordered, even inside a `bare` row. The picker has to read as
            something you can press; a borderless code sitting beside a
            borderless number is one continuous string, and the user's first
            question becomes whether the +234 is editable.
          */
          variant="default"
          disabled={disabled}
          onPress={() => setPickerOpen(true)}
          containerStyle={styles.picker}
          testID={testID ? `${testID}-country` : undefined}
        />

        <Input
          label={label}
          hideLabel
          required={required}
          value={formatAsYouType(nationalNumber, iso2)}
          placeholder={placeholder}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          editable={!disabled}
          onChangeText={(next) => {
            // Keep only digits in state; formatting is a view concern. The
            // leading trunk zero survives typing and is stripped at validation,
            // so 0803… and 803… both work.
            const digits = next.replace(/[^0-9]/g, '');
            setNationalNumber(digits);
            setTouched(true);
            emit(digits, iso2);
          }}
          onBlur={() => setTouched(true)}
          containerStyle={styles.number}
          testID={testID}
        />
      </View>

      {visibleError ? (
        <AppText variant="caption" tone="danger" style={styles.message}>
          {visibleError}
        </AppText>
      ) : completeness.isValid ? (
        <AppText variant="caption" tone="success" style={styles.message}>
          Saved as {completeness.e164}
        </AppText>
      ) : helperText ? (
        <AppText variant="caption" tone="muted" style={styles.message}>
          {helperText}
        </AppText>
      ) : null}

      {/*
        The divider under the pair, drawn once rather than by each control, so
        the code and the number read as one field in a `bare`/`underline` form
        instead of two adjacent ones.
      */}
      {variant === 'underline' ? (
        <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
      ) : null}

      <AppSelectSheet
        visible={pickerOpen}
        title="Country code"
        subtitle="Search by country, code or dial code"
        options={countryOptions}
        value={iso2}
        searchable
        searchPlaceholder="Search country or code"
        searchEmptyMessage="No country matches that."
        onChange={(next) => {
          const nextIso2 = next as CountryCode;
          setIso2(nextIso2);
          setTouched(true);
          emit(nationalNumber, nextIso2);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  picker: {
    // Wide enough for a flag plus the longest dial code (+1-268 style codes are
    // four digits), narrow enough that the number keeps the rest of the row.
    width: 108,
    flexShrink: 0,
  },
  number: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    marginTop: tokens.spacing.xs,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginTop: tokens.spacing.xs,
  },
});

export default PhoneNumberField;
