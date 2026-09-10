import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';

import { COUNTRY_NAMES_BY_ISO2 } from '@/src/utils/countryNames';
import { flagEmojiFromIso2 } from '@/src/utils/countryFlag';

/**
 * Country dial codes and per-country phone completeness, for the native phone
 * field.
 *
 * Deliberate cross-repo twin of `fthreadly/src/utils/phoneCountries.ts`, with
 * two knowing differences:
 *
 * 1. **Names are bundled, not resolved.** Web calls `Intl.DisplayNames`; Hermes
 *    does not implement it, so on device that path names every country by its
 *    bare ISO2 code. `countryNames.ts` is generated instead.
 * 2. **Metadata entry point is `libphonenumber-js`, not `/max`.** Web pays ~65KB
 *    for full digit patterns. Here, `src/utils/phoneNumber.ts` — the canonical
 *    validator this app has always used, wired into every phone-bearing form —
 *    is already on the default entry point, and importing both pulls BOTH
 *    metadata sets into one bundle. One set, and the same set the rest of the
 *    app validates against, is worth more than a stricter check in one field
 *    that then disagrees with the check the payload goes through.
 *
 *    The practical gap: min metadata validates the possible LENGTH of a number
 *    rather than its digit patterns, so a well-formed-but-unassigned number can
 *    pass here and be rejected by the backend, which runs its own check. The
 *    length errors below still name the country and the expected digit count,
 *    which is where nearly all real mistakes are.
 *
 * Everything here is derived from metadata that is already bundled — no
 * hardcoded dial-code table to drift, and no network call. That matters: the
 * LOCATION country list comes from a third-party API, and phone entry has to
 * keep working when that API is down.
 */

export interface PhoneCountry {
  iso2: CountryCode;
  name: string;
  /** Dial code WITHOUT the leading '+', e.g. '234'. */
  callingCode: string;
  /** Regional-indicator flag. Renders natively on iOS and Android. */
  flag: string;
}

const countryName = (iso2: string): string => COUNTRY_NAMES_BY_ISO2[iso2] ?? iso2;

/** Markets shown first, because that is who is actually signing up. */
const PRIORITY_ISO2: CountryCode[] = ['NG', 'GH', 'KE', 'ZA', 'GB', 'US'];

export const PHONE_COUNTRIES: PhoneCountry[] = (() => {
  const all: PhoneCountry[] = getCountries().map((iso2) => ({
    iso2,
    name: countryName(iso2),
    callingCode: String(getCountryCallingCode(iso2)),
    flag: flagEmojiFromIso2(iso2),
  }));

  const priority = PRIORITY_ISO2.map((iso2) =>
    all.find((entry) => entry.iso2 === iso2),
  ).filter((entry): entry is PhoneCountry => Boolean(entry));

  const rest = all
    .filter((entry) => !PRIORITY_ISO2.includes(entry.iso2))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...priority, ...rest];
})();

const PHONE_COUNTRY_BY_ISO2 = new Map<string, PhoneCountry>(
  PHONE_COUNTRIES.map((entry) => [entry.iso2, entry]),
);

export const getPhoneCountry = (iso2?: string): PhoneCountry | undefined =>
  iso2 ? PHONE_COUNTRY_BY_ISO2.get(iso2.toUpperCase()) : undefined;

export const getDialCode = (iso2?: string): string => {
  const country = getPhoneCountry(iso2);
  return country ? `+${country.callingCode}` : '';
};

/**
 * The ISO2 for a country NAME, so the phone field can follow the country the
 * user just picked in the location cascade.
 *
 * Name matching is the only join available: the cascade stores country names,
 * not codes. Comparison is case- and accent-insensitive so "Cote d'Ivoire"
 * typed into the free-text fallback still finds "Côte d'Ivoire".
 */
const NORMALIZED_NAME_TO_ISO2 = new Map<string, CountryCode>(
  PHONE_COUNTRIES.map((entry) => [normalizeCountryName(entry.name), entry.iso2]),
);

function normalizeCountryName(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    // Strip combining marks (the accent half of a decomposed character).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

export const iso2ForCountryName = (
  countryName?: string | null,
): CountryCode | undefined => {
  const normalized = normalizeCountryName(countryName ?? '');
  if (!normalized) return undefined;
  return NORMALIZED_NAME_TO_ISO2.get(normalized);
};

/**
 * An example national number for the country, used as the input placeholder so
 * the expected shape and length are visible BEFORE the user types.
 */
export const getExampleNationalNumber = (iso2: CountryCode): string => {
  try {
    const example = getExampleNumber(iso2, examples);
    return example ? example.formatNational().replace(/^0/, '') : '';
  } catch {
    return '';
  }
};

export interface PhoneCompleteness {
  /** Passes libphonenumber's validity check for the selected country. */
  isValid: boolean;
  /** Nothing typed yet. */
  isEmpty: boolean;
  /** E.164 form, only when valid. */
  e164: string | null;
  /** Human-readable reason, null when valid or empty. */
  error: string | null;
}

/**
 * Validates a NATIONAL number against the selected country.
 *
 * A leading zero is stripped first. Nigerian numbers are written locally as 11
 * digits starting 0 (0803…), but the 0 is a trunk prefix that is dropped once a
 * country code is present — +2340803… is not a real number, +234803… is. Users
 * type what is printed on their SIM pack, so accepting the zero and removing it
 * is the only behaviour that does not feel broken.
 */
export const checkPhoneCompleteness = (
  nationalNumber: string,
  iso2: CountryCode,
): PhoneCompleteness => {
  const digits = String(nationalNumber ?? '').replace(/\D/g, '');
  if (!digits) {
    return { isValid: false, isEmpty: true, e164: null, error: null };
  }

  const trimmed = digits.replace(/^0+/, '');
  if (!trimmed) {
    return {
      isValid: false,
      isEmpty: false,
      e164: null,
      error: 'Enter your phone number',
    };
  }

  const country = getPhoneCountry(iso2);
  const parsed = parsePhoneNumberFromString(
    `+${country?.callingCode ?? ''}${trimmed}`,
  );

  if (parsed?.isValid()) {
    return {
      isValid: true,
      isEmpty: false,
      e164: parsed.format('E.164'),
      error: null,
    };
  }

  // Say what is wrong in terms of the country the user picked, not "invalid".
  const example = getExampleNationalNumber(iso2);
  const expectedDigits = example.replace(/\D/g, '').length;
  const name = country?.name ?? iso2;

  if (expectedDigits && trimmed.length < expectedDigits) {
    return {
      isValid: false,
      isEmpty: false,
      e164: null,
      error: `Too short for ${name} — expected ${expectedDigits} digits after ${getDialCode(iso2)}, you entered ${trimmed.length}.`,
    };
  }
  if (expectedDigits && trimmed.length > expectedDigits) {
    return {
      isValid: false,
      isEmpty: false,
      e164: null,
      error: `Too long for ${name} — expected ${expectedDigits} digits after ${getDialCode(iso2)}, you entered ${trimmed.length}.`,
    };
  }

  return {
    isValid: false,
    isEmpty: false,
    e164: null,
    error: `That is not a valid ${name} phone number.`,
  };
};

/** Progressive formatting as the user types, e.g. '803 123 4567'. */
export const formatAsYouType = (
  nationalNumber: string,
  iso2: CountryCode,
): string => {
  const digits = String(nationalNumber ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return new AsYouType(iso2).input(digits);
};

/**
 * Splits a stored E.164 number back into (country, national) so an existing
 * value can populate the field on open.
 */
export const splitE164 = (
  value: unknown,
  fallbackIso2: CountryCode = 'NG',
): { iso2: CountryCode; nationalNumber: string } => {
  const text = String(value ?? '').trim();
  if (!text) return { iso2: fallbackIso2, nationalNumber: '' };

  const parsed = parsePhoneNumberFromString(text, fallbackIso2);
  if (parsed?.country) {
    return {
      iso2: parsed.country,
      nationalNumber: parsed.nationalNumber.toString(),
    };
  }

  return { iso2: fallbackIso2, nationalNumber: text.replace(/\D/g, '') };
};
