import axios from 'axios';

/**
 * Location cascade source for profile/checkout forms.
 * Kept in parity with `fthreadly/src/services/LocationService.ts`:
 * Country (name) → State/Province → City/LGA.
 */

export type CountryOption = {
  name: string;
  /** ISO-3166 alpha-2 (same as web `iso2`). */
  iso2: string;
  /** @deprecated alias of iso2 — prefer iso2 */
  code: string;
  flag: string;
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

const COUNTRIES_API = 'https://countriesnow.space/api/v0.1/countries';
const REST_COUNTRIES_API =
  'https://restcountries.com/v3.1/all?fields=name,cca2,flags';
const LOCATION_REQUEST_TIMEOUT_MS = 8000;

/** Platform operating markets (same fallback list as web). */
export const FALLBACK_COUNTRIES: CountryOption[] = [
  {
    name: 'Ghana',
    iso2: 'GH',
    code: 'GH',
    flag: '',
    flagImage: 'https://flagcdn.com/gh.svg',
  },
  {
    name: 'Kenya',
    iso2: 'KE',
    code: 'KE',
    flag: '',
    flagImage: 'https://flagcdn.com/ke.svg',
  },
  {
    name: 'Nigeria',
    iso2: 'NG',
    code: 'NG',
    flag: '',
    flagImage: 'https://flagcdn.com/ng.svg',
  },
  {
    name: 'South Africa',
    iso2: 'ZA',
    code: 'ZA',
    flag: '',
    flagImage: 'https://flagcdn.com/za.svg',
  },
  {
    name: 'United Kingdom',
    iso2: 'GB',
    code: 'GB',
    flag: '',
    flagImage: 'https://flagcdn.com/gb.svg',
  },
  {
    name: 'United States',
    iso2: 'US',
    code: 'US',
    flag: '',
    flagImage: 'https://flagcdn.com/us.svg',
  },
];

type RestCountry = {
  name?: { common?: string };
  cca2?: string;
  flags?: { alt?: string; svg?: string };
};

type CountriesNowStatesResponse = {
  error?: boolean;
  data?: {
    states?: Array<{
      name?: string;
      state_code?: string;
    }>;
  };
};

type CountriesNowCitiesResponse = {
  error?: boolean;
  data?: string[];
};

let cachedCountries: CountryOption[] | null = null;
const statesCache = new Map<string, StateOption[]>();
const citiesCache = new Map<string, string[]>();

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function mapCountry(raw: RestCountry): CountryOption | null {
  const name = raw.name?.common?.trim() ?? '';
  if (!name) return null;
  const iso2 = (raw.cca2?.trim() ?? name).toUpperCase();
  return {
    name,
    iso2,
    code: iso2,
    flag: raw.flags?.alt ?? '',
    flagImage: raw.flags?.svg ?? `https://flagcdn.com/${iso2.toLowerCase()}.svg`,
  };
}

export const locationService = {
  async getCountries(): Promise<CountryOption[]> {
    if (cachedCountries) {
      return cachedCountries;
    }

    try {
      const response = await axios.get<RestCountry[]>(REST_COUNTRIES_API, {
        timeout: LOCATION_REQUEST_TIMEOUT_MS,
      });
      cachedCountries = sortByName(
        response.data.map(mapCountry).filter((c): c is CountryOption => Boolean(c)),
      );
      return cachedCountries;
    } catch {
      cachedCountries = FALLBACK_COUNTRIES;
      return cachedCountries;
    }
  },

  async getStates(countryName: string): Promise<StateOption[]> {
    const normalizedCountry = countryName.trim();
    if (!normalizedCountry) {
      return [];
    }
    if (statesCache.has(normalizedCountry)) {
      return statesCache.get(normalizedCountry) ?? [];
    }

    try {
      const response = await axios.post<CountriesNowStatesResponse>(
        `${COUNTRIES_API}/states`,
        { country: normalizedCountry },
        { timeout: LOCATION_REQUEST_TIMEOUT_MS },
      );
      if (response.data?.error) {
        return [];
      }
      const states = sortByName(
        (response.data.data?.states ?? [])
          .map((state) => {
            const name = state.name?.trim() ?? '';
            if (!name) return null;
            const iso2 = state.state_code?.trim() ?? name;
            return { name, iso2, code: iso2 };
          })
          .filter((state): state is StateOption => Boolean(state)),
      );
      statesCache.set(normalizedCountry, states);
      return states;
    } catch {
      return [];
    }
  },

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
      const response = await axios.post<CountriesNowCitiesResponse>(
        `${COUNTRIES_API}/state/cities`,
        {
          country: normalizedCountry,
          state: normalizedState,
        },
        { timeout: LOCATION_REQUEST_TIMEOUT_MS },
      );
      if (response.data?.error) {
        return [];
      }
      const cities = (response.data.data ?? [])
        .map((city) => city.trim())
        .filter((city) => city.length > 0)
        .sort((a, b) => a.localeCompare(b));
      citiesCache.set(cacheKey, cities);
      return cities;
    } catch {
      return [];
    }
  },
};

export default locationService;
