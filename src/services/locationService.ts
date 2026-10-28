import { apiClient } from '@/src/api/httpClient';
import { getOfflineRegions } from '@/src/data/countryRegions';
import { flagEmojiFromIso2 } from '@/src/utils/countryFlag';

/**
 * Location cascade source for profile/checkout forms.
 * Kept in parity with `fthreadly/src/services/LocationService.ts`:
 * Country (name) → State/Province → City/LGA.
 *
 * Everything comes from the WIEZ API (`/locations/*`). The app used to call
 * restcountries.com and countriesnow.space directly, which showed every
 * person's IP address to them. Flags are emoji (see `countryFlag.ts`).
 */

export type CountryOption = {
  name: string;
  /** ISO-3166 alpha-2 (same as web `iso2`). */
  iso2: string;
  /** @deprecated alias of iso2 — prefer iso2 */
  code: string;
  flag: string;
  /** Unused on native, which renders `flag`; kept for shape parity with web. */
  flagImage: string;
};

export type StateOption = {
  name: string;
  iso2: string;
  /** @deprecated alias of iso2 — prefer iso2 */
  code: string;
};

export type CityOption = {
  name: string;
};

const LOCATION_REQUEST_TIMEOUT_MS = 8000;

const toCountryOption = (iso2: string, name: string): CountryOption => ({
  name,
  iso2,
  code: iso2,
  flag: flagEmojiFromIso2(iso2),
  flagImage: '',
});

/** Platform operating markets (same fallback list as web). */
export const FALLBACK_COUNTRIES: CountryOption[] = [
  toCountryOption('GH', 'Ghana'),
  toCountryOption('KE', 'Kenya'),
  toCountryOption('NG', 'Nigeria'),
  toCountryOption('ZA', 'South Africa'),
  toCountryOption('GB', 'United Kingdom'),
  toCountryOption('US', 'United States'),
];

function listFrom<T>(payload: unknown): T[] {
  const body = payload as { data?: unknown } | undefined;
  const inner = (body?.data as { data?: unknown } | undefined)?.data ?? body?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

const names = (payload: unknown) =>
  listFrom<unknown>(payload)
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

let cachedCountries: CountryOption[] | null = null;
const statesCache = new Map<string, StateOption[]>();
const citiesCache = new Map<string, string[]>();

export const locationService = {
  async getCountries(): Promise<CountryOption[]> {
    if (cachedCountries) {
      return cachedCountries;
    }

    try {
      const response = await apiClient.get('/locations/countries', {
        timeout: LOCATION_REQUEST_TIMEOUT_MS,
      });
      const countries = listFrom<{ iso2?: unknown; name?: unknown }>(response)
        .filter(
          (country): country is { iso2: string; name: string } =>
            typeof country?.iso2 === 'string' && typeof country?.name === 'string',
        )
        .map((country) => toCountryOption(country.iso2, country.name));
      cachedCountries = countries.length > 0 ? countries : FALLBACK_COUNTRIES;
    } catch {
      cachedCountries = FALLBACK_COUNTRIES;
    }
    return cachedCountries;
  },

  async getStates(countryName: string, iso2?: string): Promise<StateOption[]> {
    const normalizedCountry = countryName.trim();
    if (!normalizedCountry) {
      return [];
    }
    if (statesCache.has(normalizedCountry)) {
      return statesCache.get(normalizedCountry) ?? [];
    }

    try {
      const response = await apiClient.get('/locations/states', {
        params: { country: iso2 || normalizedCountry },
        timeout: LOCATION_REQUEST_TIMEOUT_MS,
      });
      const states = names(response).map((name) => ({ name, iso2: '', code: '' }));
      if (states.length > 0) {
        statesCache.set(normalizedCountry, states);
        return states;
      }
    } catch {
      // Fall through to the bundled list rather than returning [].
    }

    // An empty list is rendered as a DISABLED dropdown by every caller, so
    // returning [] on a network failure strands the user on a form they cannot
    // finish. Bundled data for our operating markets is worth more than a
    // perfect list nobody can reach.
    const offline = getOfflineRegions(normalizedCountry, iso2).map((name) => ({
      name,
      iso2: '',
      code: '',
    }));
    if (offline.length > 0) {
      // Cached so a flaky connection does not re-await the timeout every time
      // the cascade re-runs.
      statesCache.set(normalizedCountry, offline);
    }
    return offline;
  },

  /**
   * Cities/LGAs for a state. There is deliberately NO bundled fallback — the
   * list is far too large to ship and too country-specific to guess at — so an
   * empty result means "let the user type one", never "disable the field".
   */
  async getCities(countryName: string, stateName: string): Promise<string[]> {
    const normalizedCountry = countryName.trim();
    const normalizedState = stateName.trim();
    if (!normalizedCountry || !normalizedState) {
      return [];
    }

    const cacheKey = `${normalizedCountry}:${normalizedState}`;
    if (citiesCache.has(cacheKey)) {
      return citiesCache.get(cacheKey) ?? [];
    }

    try {
      const response = await apiClient.get('/locations/cities', {
        params: { country: normalizedCountry, state: normalizedState },
        timeout: LOCATION_REQUEST_TIMEOUT_MS,
      });
      const cities = names(response).sort((a, b) => a.localeCompare(b));
      if (cities.length > 0) citiesCache.set(cacheKey, cities);
      return cities;
    } catch {
      return [];
    }
  },
};

export default locationService;
