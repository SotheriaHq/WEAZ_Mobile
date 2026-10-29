import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * The person's analytics choice for this install: one versioned record.
 *
 * Twin of `fthreadly/src/privacy/consent.ts` (separate repos, same key and
 * record shape). Essential storage (sign-in, bag, theme, push) never needs
 * consent and is not modelled here. Analytics start off and stay off until the
 * person allows them, including while the stored choice is still being read.
 *
 * Raise `CONSENT_VERSION` when a new optional purpose is added, so everyone is
 * asked again instead of the new purpose inheriting an old "yes".
 */
export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = 'wiez.consent';
/** A choice is kept for twelve months, then the person is asked again. */
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type ConsentRecord = {
  version: number;
  decidedAt: string;
  /** What they view and tap, sent to improve the feed, and app performance tracing. */
  analytics: boolean;
};

export type ConsentState = {
  /** The stored choice has been read (or saved) this launch. */
  ready: boolean;
  record: ConsentRecord | null;
  /** True when a current, unexpired choice exists. */
  decided: boolean;
};

let state: ConsentState = { ready: false, record: null, decided: false };
const listeners = new Set<() => void>();

const publish = (next: ConsentState) => {
  state = next;
  for (const listener of listeners) listener();
};

export const parseConsentRecord = (raw: string | null, now = Date.now()): ConsentRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed?.version !== CONSENT_VERSION) return null;
    const decidedAt = Date.parse(String(parsed.decidedAt ?? ''));
    if (!Number.isFinite(decidedAt) || now - decidedAt > CONSENT_MAX_AGE_MS) return null;
    return {
      version: CONSENT_VERSION,
      decidedAt: String(parsed.decidedAt),
      analytics: parsed.analytics === true,
    };
  } catch {
    return null;
  }
};

let loading: Promise<void> | null = null;

/** Reads the stored choice once per launch. Safe to call repeatedly. */
export function loadConsent(): Promise<void> {
  if (state.ready) return Promise.resolve();
  if (loading) return loading;
  loading = AsyncStorage.getItem(CONSENT_STORAGE_KEY)
    .then((raw) => parseConsentRecord(raw))
    .catch(() => null)
    .then((record) => {
      // A choice made while storage was being read wins over the stored one.
      if (state.ready) return;
      publish({ ready: true, record, decided: record !== null });
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export const getConsentState = (): ConsentState => state;

/** True only once the person has allowed analytics on this install. */
export const analyticsPermitted = (): boolean => state.record?.analytics === true;

export const subscribeConsent = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function saveAnalyticsConsent(analytics: boolean) {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    analytics,
  };
  publish({ ready: true, record, decided: true });
  // If the write fails the choice still applies for this launch.
  void AsyncStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record)).catch(() => undefined);
}

export const useConsent = (): ConsentState =>
  useSyncExternalStore(subscribeConsent, getConsentState, getConsentState);
