import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { apiClient } from '@/src/api/httpClient';
import { env } from '@/src/config/env';
import { formatMoney } from '@/src/utils/money';

/**
 * The currency a shopper reads prices in. Display only: everything is priced,
 * charged and settled in Naira, and other currencies are estimates.
 *
 * Twin of `fthreadly/src/currency/displayCurrency.ts`. Chosen in this order: the
 * shopper's own choice (kept on this device), their country (the web app's
 * `/api/location`, Cloudflare's edge country, never stored), then Naira.
 */
export const BASE_CURRENCY = 'NGN';
export const AUTO_CURRENCY = 'AUTO';
export const DISPLAY_CURRENCY_STORAGE_KEY = 'wiez.displayCurrency.v1';
const REFRESH_MS = 60 * 60 * 1000;
const HINT_TIMEOUT_MS = 3000;

export type DisplayRates = {
  baseCurrency: string;
  chargeCurrency: string;
  displayCurrency: string;
  countryCode: string | null;
  needsCurrencyChoice: boolean;
  isStale: boolean;
  rates: Record<string, { rate: number; asOf: string }>;
};

export type DisplayCurrencyState = {
  /** The stored choice has been read. */
  ready: boolean;
  /** `AUTO`, or the ISO code the shopper picked. */
  preference: string;
  data: DisplayRates | null;
  loadedAt: number;
};

const isCurrencyCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{3}$/.test(value);

let state: DisplayCurrencyState = {
  ready: false,
  preference: AUTO_CURRENCY,
  data: null,
  loadedAt: 0,
};
const listeners = new Set<() => void>();
const publish = (next: DisplayCurrencyState) => {
  state = next;
  for (const listener of listeners) listener();
};

export const getDisplayCurrencyState = () => state;
export const subscribeDisplayCurrency = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

let countryHint: Promise<string | null> | null = null;

/** The person's country as Cloudflare sees it; nothing is stored. */
const loadCountryHint = (): Promise<string | null> => {
  if (!countryHint) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HINT_TIMEOUT_MS);
    countryHint = fetch(`${env.webAppUrl.replace(/\/$/, '')}/api/location`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { country?: unknown } | null) =>
        typeof body?.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : null,
      )
      .catch(() => null)
      .finally(() => clearTimeout(timer));
  }
  return countryHint;
};

let preferenceRead: Promise<void> | null = null;
const readPreference = () => {
  if (!preferenceRead) {
    preferenceRead = AsyncStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)
      .catch(() => null)
      .then((stored) => {
        // A choice made while storage was being read wins.
        if (state.ready) return;
        publish({ ...state, ready: true, preference: isCurrencyCode(stored) ? stored : AUTO_CURRENCY });
      });
  }
  return preferenceRead;
};

let loading: Promise<void> | null = null;

/** Loads rates once an hour, or after the preference changes. Never throws. */
export const ensureDisplayCurrency = (force = false): Promise<void> => {
  if (!force && state.data && Date.now() - state.loadedAt < REFRESH_MS) return Promise.resolve();
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      await readPreference();
      const preference = state.preference;
      const country = preference === AUTO_CURRENCY ? await loadCountryHint() : null;
      const response = await apiClient.get('/payment/fx/display', {
        params: {
          ...(preference !== AUTO_CURRENCY ? { currency: preference } : {}),
          ...(country ? { country } : {}),
        },
      });
      const body = response?.data as { data?: DisplayRates } | DisplayRates | undefined;
      const data = ((body as { data?: DisplayRates })?.data ?? body) as DisplayRates | undefined;
      if (data && isCurrencyCode(data.displayCurrency) && state.preference === preference) {
        publish({ ...state, data, loadedAt: Date.now() });
      }
    } catch {
      // Rates unavailable: prices show in Naira only, which is always correct.
    } finally {
      loading = null;
    }
  })();
  return loading;
};

export const setDisplayCurrencyPreference = (preference: string) => {
  const next = isCurrencyCode(preference) ? preference : AUTO_CURRENCY;
  void (next === AUTO_CURRENCY
    ? AsyncStorage.removeItem(DISPLAY_CURRENCY_STORAGE_KEY)
    : AsyncStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next)
  ).catch(() => undefined);
  publish({ ...state, ready: true, preference: next, data: null, loadedAt: 0 });
  return ensureDisplayCurrency(true);
};

/** The shopper's currency, or null when it is Naira or rates are unavailable. */
export const foreignDisplayCurrency = (current: DisplayCurrencyState): string | null => {
  const display = current.data?.displayCurrency;
  if (!display || display === BASE_CURRENCY || !current.data?.rates[display]) return null;
  return display;
};

/** "£27.53" for a Naira amount, or null when no estimate should be shown. */
export const estimateInDisplayCurrency = (
  current: DisplayCurrencyState,
  amount: number | null | undefined,
  currency: string | null | undefined,
): string | null => {
  const display = foreignDisplayCurrency(current);
  if (!display || amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  if (String(currency ?? BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY) return null;
  const converted = amount * current.data!.rates[display].rate;
  return formatMoney(converted, display, { withDecimals: converted < 100 });
};

export const useDisplayCurrency = (): DisplayCurrencyState => {
  const current = useSyncExternalStore(
    subscribeDisplayCurrency,
    getDisplayCurrencyState,
    getDisplayCurrencyState,
  );
  useEffect(() => {
    void ensureDisplayCurrency();
  }, []);
  return current;
};
