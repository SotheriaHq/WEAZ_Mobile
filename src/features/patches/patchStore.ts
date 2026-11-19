import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { brandApi } from '@/src/api/BrandApi';
import { ProfileApi } from '@/src/api/ProfileApi';

/**
 * The shopper's patched brands: ONE store for every screen.
 *
 * Patch state used to live in three places — the Runway's own Set, a 30-second
 * per-brand cache behind `useBrandPatchStatus`, and whatever the feed payload
 * said — so it disagreed between screens, reset to "Patch" when the cache
 * lapsed, and was gone after a restart. Now:
 *
 * - The account's full patched list is the truth (`/users/:id/patches`, keyed
 *   by the brand owner's user id, like the feed's `brandId`).
 * - It is persisted per account, so the first paint after a restart is right
 *   before any request returns, and wiped on sign-out with the other private
 *   keys (`PATCH_STORE_STORAGE_PREFIX` in `sessionCleanup`).
 * - A burst of taps on one brand settles into ONE request for the final
 *   state; tapping back to where you started sends nothing at all. The pill
 *   flips under the finger and reverts only if the server refuses.
 */

export const PATCH_STORE_STORAGE_PREFIX = 'wiez.patches.v1:';
/** Quiet period after the last tap before the final state is sent. */
export const PATCH_SETTLE_MS = 400;
/** A list fetched this recently is not fetched again on screen focus. */
const LIST_REFRESH_MIN_MS = 60_000;
const PERSIST_DELAY_MS = 250;

export type PatchOutcome =
  /** The server holds `patched`. `changed` is false when nothing had to be sent. */
  | { status: 'settled'; patched: boolean; changed: boolean }
  /** A later tap on the same brand owns the outcome; say nothing for this one. */
  | { status: 'superseded' }
  /** Refused; the pill is back on `patched`, the server's state. */
  | { status: 'failed'; patched: boolean; error: unknown };

type Listener = () => void;
type BrandListener = (brandId: string, patched: boolean) => void;

let ownerId: string | null = null;
let patched: ReadonlySet<string> = new Set();
let pending: ReadonlySet<string> = new Set();
let listLoaded = false;
let listFetchedAt = 0;
let hydrateRun = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Last state the server acknowledged, for brands touched this session. */
const confirmed = new Map<string, boolean>();
/** What the shopper last asked for and the server has not yet confirmed. */
const desired = new Map<string, boolean>();
const inFlight = new Set<string>();
const settleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const waiters = new Map<string, (outcome: PatchOutcome) => void>();
const listeners = new Set<Listener>();
const brandListeners = new Set<BrandListener>();

const normalize = (brandId: string | null | undefined) => {
  const value = typeof brandId === 'string' ? brandId.trim() : '';
  return value.length > 0 ? value : null;
};

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persistSoon() {
  const owner = ownerId;
  if (!owner) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (ownerId !== owner) return;
    void AsyncStorage.setItem(
      PATCH_STORE_STORAGE_PREFIX + owner,
      JSON.stringify(Array.from(patched)),
    ).catch(() => undefined);
  }, PERSIST_DELAY_MS);
}

/** Replace the visible set, telling per-brand listeners exactly what moved. */
function commit(next: Set<string>) {
  const previous = patched;
  const moved: Array<[string, boolean]> = [];
  previous.forEach((id) => {
    if (!next.has(id)) moved.push([id, false]);
  });
  next.forEach((id) => {
    if (!previous.has(id)) moved.push([id, true]);
  });
  if (moved.length === 0) return;
  patched = next;
  emit();
  moved.forEach(([id, value]) => brandListeners.forEach((listener) => listener(id, value)));
  persistSoon();
}

function show(brandId: string, value: boolean) {
  if (patched.has(brandId) === value) return;
  const next = new Set(patched);
  if (value) next.add(brandId);
  else next.delete(brandId);
  commit(next);
}

function refreshPending() {
  const next = new Set<string>([...desired.keys(), ...inFlight]);
  if (next.size === pending.size && [...next].every((id) => pending.has(id))) return;
  pending = next;
  emit();
}

function settle(brandId: string, outcome: PatchOutcome) {
  const waiter = waiters.get(brandId);
  waiters.delete(brandId);
  waiter?.(outcome);
}

/** Server truth for the whole list, with the shopper's unsent taps on top. */
function applyServerList(ids: Iterable<string>) {
  const next = new Set(ids);
  desired.forEach((want, id) => {
    confirmed.set(id, next.has(id));
    if (want) next.add(id);
    else next.delete(id);
  });
  listLoaded = true;
  listFetchedAt = Date.now();
  commit(next);
}

/** Forget everything: sign-out, or a different account signing in. */
export function resetPatchStore(nextOwner: string | null = null) {
  hydrateRun += 1;
  settleTimers.forEach((timer) => clearTimeout(timer));
  settleTimers.clear();
  waiters.forEach((waiter) => waiter({ status: 'superseded' }));
  waiters.clear();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  confirmed.clear();
  desired.clear();
  inFlight.clear();
  ownerId = nextOwner;
  listLoaded = false;
  listFetchedAt = 0;
  const hadState = patched.size > 0 || pending.size > 0;
  patched = new Set();
  pending = new Set();
  if (hadState) emit();
}

/**
 * Load the account's list: the persisted copy first (instant, offline-safe),
 * then the server's, which replaces it. Safe to call repeatedly; a newer call
 * or an account change makes an older one drop its result.
 */
export async function hydratePatchStore(userId: string, options?: { force?: boolean }) {
  if (ownerId !== userId) resetPatchStore(userId);
  if (!options?.force && listLoaded && Date.now() - listFetchedAt < LIST_REFRESH_MIN_MS) return;
  const run = ++hydrateRun;

  if (!listLoaded && patched.size === 0) {
    const raw = await AsyncStorage.getItem(PATCH_STORE_STORAGE_PREFIX + userId).catch(() => null);
    if (run !== hydrateRun || ownerId !== userId) return;
    if (raw && !listLoaded) {
      try {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          const next = new Set(ids.filter((id): id is string => typeof id === 'string'));
          desired.forEach((want, id) => (want ? next.add(id) : next.delete(id)));
          commit(next);
        }
      } catch {
        // A corrupt copy is only a head start; the server list follows.
      }
    }
  }

  try {
    const brands = await ProfileApi.getPatches(userId);
    if (run !== hydrateRun || ownerId !== userId) return;
    applyServerList(brands.map((brand) => brand.id).filter(Boolean));
  } catch {
    // Keep what is shown; a failed background read must not blank every pill.
  }
}

/**
 * A single brand's state from a source other than the list — the feed
 * payload's `viewerState.isPatched`, or a per-brand check. Ignored once the
 * full list has loaded (the list is the truth) and for brands with a tap in
 * progress (the shopper's intent wins).
 */
export function seedBrandPatchStatus(brandId: string | null | undefined, value: boolean) {
  const id = normalize(brandId);
  if (!id || listLoaded || desired.has(id) || inFlight.has(id)) return;
  confirmed.set(id, value);
  show(id, value);
}

/** Write a state the server has already confirmed through another path. */
export function confirmBrandPatchStatus(brandId: string | null | undefined, value: boolean) {
  const id = normalize(brandId);
  if (!id || desired.has(id) || inFlight.has(id)) return;
  confirmed.set(id, value);
  show(id, value);
}

export function isBrandPatched(brandId: string | null | undefined) {
  const id = normalize(brandId);
  return id ? patched.has(id) : false;
}

export function isPatchListLoaded() {
  return listLoaded;
}

async function flush(brandId: string) {
  if (inFlight.has(brandId)) return; // re-run when the request in flight lands
  const want = desired.get(brandId);
  if (want === undefined) return;
  const base = confirmed.get(brandId);
  if (base === want) {
    // Tapped back to where it started: nothing to send, nothing to announce.
    desired.delete(brandId);
    refreshPending();
    settle(brandId, { status: 'settled', patched: want, changed: false });
    return;
  }

  const owner = ownerId;
  inFlight.add(brandId);
  refreshPending();
  try {
    if (want) await brandApi.patchBrand(brandId);
    else await brandApi.unpatchBrand(brandId);
  } catch (error) {
    if (owner !== ownerId) return;
    inFlight.delete(brandId);
    desired.delete(brandId);
    const timer = settleTimers.get(brandId);
    if (timer) clearTimeout(timer);
    settleTimers.delete(brandId);
    const truth = base ?? !want;
    show(brandId, truth);
    refreshPending();
    settle(brandId, { status: 'failed', patched: truth, error });
    return;
  }
  if (owner !== ownerId) return;
  inFlight.delete(brandId);
  confirmed.set(brandId, want);

  const latest = desired.get(brandId);
  if (latest !== undefined && latest !== want) {
    // Changed their mind while this was in flight. A pending timer will send
    // it; without one (the tap landed before this request started), send now.
    refreshPending();
    if (!settleTimers.has(brandId)) void flush(brandId);
    return;
  }
  desired.delete(brandId);
  refreshPending();
  settle(brandId, { status: 'settled', patched: want, changed: true });
}

/**
 * Flip a brand's patch state for the shopper. The pill changes immediately;
 * the request goes once the taps stop. Resolves with the outcome — callers
 * toast only on `settled && changed`, or on `failed`.
 */
export function toggleBrandPatch(brandId: string): Promise<PatchOutcome> {
  const id = normalize(brandId);
  if (!id) return Promise.resolve({ status: 'superseded' });
  const current = patched.has(id);
  if (!confirmed.has(id) && !inFlight.has(id)) confirmed.set(id, current);
  const next = !current;
  desired.set(id, next);
  show(id, next);
  refreshPending();

  settle(id, { status: 'superseded' });
  const timer = settleTimers.get(id);
  if (timer) clearTimeout(timer);
  settleTimers.set(
    id,
    setTimeout(() => {
      settleTimers.delete(id);
      void flush(id);
    }, PATCH_SETTLE_MS),
  );
  return new Promise((resolve) => waiters.set(id, resolve));
}

/** Every brand's changes, for code outside React. */
export function subscribeBrandPatchChanges(listener: BrandListener) {
  brandListeners.add(listener);
  return () => {
    brandListeners.delete(listener);
  };
}

const getPatched = () => patched;
const getPending = () => pending;

/** The whole patched set. Identity changes only when membership does. */
export function usePatchedBrandIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getPatched, getPatched);
}

/** Brands with a tap not yet confirmed by the server. */
export function usePendingPatchBrandIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getPending, getPending);
}

export function useIsBrandPatched(brandId: string | null | undefined): boolean {
  const id = normalize(brandId);
  return useSyncExternalStore(
    subscribe,
    () => (id ? patched.has(id) : false),
    () => (id ? patched.has(id) : false),
  );
}

export function useIsBrandPatchPending(brandId: string | null | undefined): boolean {
  const id = normalize(brandId);
  return useSyncExternalStore(
    subscribe,
    () => (id ? pending.has(id) : false),
    () => (id ? pending.has(id) : false),
  );
}
