import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SelectSheetOption } from '@/components/ui/AppSelectSheet';
import {
  locationService,
  type CountryOption,
  type StateOption,
} from '@/src/services/locationService';
import { countryFlag } from '@/src/utils/countryFlag';

/**
 * Country → State/Province → City/LGA, as option lists a picker can render.
 *
 * One hook because the cascade is one piece of behaviour and it was being
 * re-implemented per screen: three pieces of state, three effects, three
 * cancellation flags and three `useMemo`s, copied. The brand profile editor had
 * a copy; the shopper profile editor had no location fields at all, which is
 * partly why — there was nothing to reach for.
 *
 * ## Two rules this encodes, both learned the hard way
 *
 * **An empty list must never disable a field.** Every caller renders
 * `options.length === 0` as a disabled dropdown, so an upstream outage turns
 * into a form the user physically cannot finish — pick a country, watch the
 * state field stay grey forever, no error, no way forward. `locationService`
 * falls back to bundled regions for our operating markets; where even that is
 * empty, `LocationCascadeFields` swaps the picker for a text input. A typed
 * value is worth infinitely more than a perfect list nobody can reach.
 *
 * **A stored value always appears in its own list.** A profile saved before the
 * country list changed — or saved from the free-text fallback — must still show
 * what it holds. `withCurrentValue` prepends the current value when the fetched
 * list does not contain it, so opening the picker never silently blanks a field.
 */

export type LocationCascadeValue = {
  country: string;
  state: string;
  city: string;
};

export type LocationCascade = {
  countryOptions: SelectSheetOption[];
  stateOptions: SelectSheetOption[];
  cityOptions: SelectSheetOption[];
  /** ISO2 for the selected country, when we can resolve one. */
  countryIso2: string | undefined;
  /** Any list is in flight. */
  loading: boolean;
  /** Set only when the COUNTRY list itself could not be built. */
  error: string | null;
  reload: () => void;
};

/** Keeps a stored value visible even when the fetched list does not carry it. */
function withCurrentValue(
  options: SelectSheetOption[],
  current: string,
): SelectSheetOption[] {
  const trimmed = current.trim();
  if (!trimmed) return options;
  if (options.some((option) => option.value === trimmed)) return options;
  return [{ value: trimmed, label: trimmed }, ...options];
}

export function useLocationCascade(value: LocationCascadeValue): LocationCascade {
  const country = value.country.trim();
  const state = value.state.trim();

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setCountriesLoading(true);
    setError(null);
    void locationService.getCountries().then((next) => {
      if (cancelled) return;
      setCountries(next);
      if (next.length === 0) {
        setError('Country list is unavailable. Your saved location is kept.');
      }
      setCountriesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const countryIso2 = useMemo(
    () =>
      countries.find(
        (entry) => entry.name.toLowerCase() === country.toLowerCase(),
      )?.iso2,
    [countries, country],
  );

  useEffect(() => {
    if (!country) {
      setStates([]);
      setCities([]);
      return;
    }
    let cancelled = false;
    setStatesLoading(true);
    // The ISO2 is passed through because the bundled fallback is keyed on it —
    // country NAMES are not stable across sources ("United Kingdom" vs "United
    // Kingdom of Great Britain and Northern Ireland").
    void locationService.getStates(country, countryIso2).then((next) => {
      if (cancelled) return;
      setStates(next);
      setStatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [country, countryIso2, reloadToken]);

  useEffect(() => {
    if (!country || !state) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setCitiesLoading(true);
    void locationService.getCities(country, state).then((next) => {
      if (cancelled) return;
      setCities(next);
      setCitiesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [country, state, reloadToken]);

  /*
    The flag rides in the LABEL rather than as a separate field, because the
    label is what both the picker row and the collapsed trigger render — putting
    it here means it appears in both without either component knowing about
    flags. The stored `value` stays the bare country name, so nothing downstream
    (the form, the API payload) ever sees the emoji.
  */
  const countryOptions = useMemo(
    () =>
      withCurrentValue(
        countries.map((entry) => {
          const flag = countryFlag(entry);
          return {
            value: entry.name,
            label: flag ? `${flag}  ${entry.name}` : entry.name,
          };
        }),
        country,
      ),
    [countries, country],
  );

  const stateOptions = useMemo(
    () =>
      withCurrentValue(
        states.map((entry) => ({ value: entry.name, label: entry.name })),
        state,
      ),
    [states, state],
  );

  const cityOptions = useMemo(
    () =>
      withCurrentValue(
        cities.map((entry) => ({ value: entry, label: entry })),
        value.city.trim(),
      ),
    [cities, value.city],
  );

  return {
    countryOptions,
    stateOptions,
    cityOptions,
    countryIso2,
    loading: countriesLoading || statesLoading || citiesLoading,
    error,
    reload,
  };
}

export default useLocationCascade;
