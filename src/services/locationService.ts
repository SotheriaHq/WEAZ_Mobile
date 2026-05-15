import axios from 'axios';

export type CountryOption = {
  name: string;
  code: string;
};

export type StateOption = {
  name: string;
  code: string;
};

type RestCountry = {
  name?: {
    common?: string;
  };
  cca2?: string;
};

type CountriesNowStatesResponse = {
  data?: {
    states?: Array<{
      name?: string;
      state_code?: string;
    }>;
  };
};

type CountriesNowCitiesResponse = {
  data?: string[];
};

const REST_COUNTRIES_URL = 'https://restcountries.com/v3.1/all?fields=name,cca2';
const COUNTRIES_NOW_STATES_URL = 'https://countriesnow.space/api/v0.1/countries/states';
const COUNTRIES_NOW_CITIES_URL = 'https://countriesnow.space/api/v0.1/countries/state/cities';

let cachedCountries: CountryOption[] | null = null;
const statesCache = new Map<string, StateOption[]>();
const citiesCache = new Map<string, string[]>();

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export const locationService = {
  async getCountries(): Promise<CountryOption[]> {
    if (cachedCountries) {
      return cachedCountries;
    }

    try {
      const response = await axios.get<RestCountry[]>(REST_COUNTRIES_URL);
      cachedCountries = sortByName(
        response.data
          .map((country) => ({
            name: country.name?.common?.trim() ?? '',
            code: country.cca2?.trim() ?? country.name?.common?.trim() ?? '',
          }))
          .filter((country) => country.name.length > 0),
      );
      return cachedCountries;
    } catch {
      return [];
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
      const response = await axios.post<CountriesNowStatesResponse>(COUNTRIES_NOW_STATES_URL, {
        country: normalizedCountry,
      });
      const states = sortByName(
        (response.data.data?.states ?? [])
          .map((state) => ({
            name: state.name?.trim() ?? '',
            code: state.state_code?.trim() ?? state.name?.trim() ?? '',
          }))
          .filter((state) => state.name.length > 0),
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
      const response = await axios.post<CountriesNowCitiesResponse>(COUNTRIES_NOW_CITIES_URL, {
        country: normalizedCountry,
        state: normalizedState,
      });
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
