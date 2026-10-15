import { useCallback, useEffect, useMemo, useState } from 'react';

import { brandApi } from '@/src/api/BrandApi';

const PATCH_STATUS_TTL_MS = 30_000;

type PatchCacheEntry = {
  value: boolean;
  expiresAt: number;
};

const patchStatusCache = new Map<string, PatchCacheEntry>();
const inFlightStatusRequests = new Map<string, Promise<boolean>>();

// Cross-instance subscription so a patch toggled on one screen (catalog header)
// is instantly reflected on every other mounted screen (design viewer, feed)
// without a refetch — the native equivalent of the web BrandPatchContext.
type PatchStatusListener = (value: boolean) => void;
const patchStatusListeners = new Map<string, Set<PatchStatusListener>>();

// Global listeners receive EVERY brand's patch change — used by surfaces that
// track many brands at once (e.g. the market feed's patched-brand Set) so they
// stay in sync with per-brand screens without their own refetch.
type GlobalPatchStatusListener = (brandId: string, value: boolean) => void;
const globalPatchStatusListeners = new Set<GlobalPatchStatusListener>();

export const subscribeAllBrandPatchStatus = (
  listener: GlobalPatchStatusListener,
): (() => void) => {
  globalPatchStatusListeners.add(listener);
  return () => {
    globalPatchStatusListeners.delete(listener);
  };
};

/**
 * Write a known patch value into the shared cache from a surface that toggles
 * patch through its own API path (e.g. the market feed). Broadcasts to every
 * mounted `useBrandPatchStatus` instance and global subscriber so the whole app
 * stays consistent.
 */
export const setBrandPatchStatus = (
  brandId: string | null | undefined,
  value: boolean,
): void => {
  const normalized = normalizeBrandId(brandId);
  if (!normalized) return;
  writeCachedPatchStatus(normalized, value);
};

const subscribePatchStatus = (
  brandId: string,
  listener: PatchStatusListener,
): (() => void) => {
  let listeners = patchStatusListeners.get(brandId);
  if (!listeners) {
    listeners = new Set();
    patchStatusListeners.set(brandId, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = patchStatusListeners.get(brandId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      patchStatusListeners.delete(brandId);
    }
  };
};

const notifyPatchStatusListeners = (brandId: string, value: boolean) => {
  const listeners = patchStatusListeners.get(brandId);
  if (listeners) {
    listeners.forEach((listener) => listener(value));
  }
  globalPatchStatusListeners.forEach((listener) => listener(brandId, value));
};

const normalizeBrandId = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const readCachedPatchStatus = (brandId: string) => {
  const cached = patchStatusCache.get(brandId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    patchStatusCache.delete(brandId);
    return null;
  }
  return cached.value;
};

const writeCachedPatchStatus = (brandId: string, value: boolean) => {
  patchStatusCache.set(brandId, {
    value,
    expiresAt: Date.now() + PATCH_STATUS_TTL_MS,
  });
  notifyPatchStatusListeners(brandId, value);
};

const fetchPatchStatus = async (brandId: string, force = false) => {
  if (!force) {
    const cached = readCachedPatchStatus(brandId);
    if (cached !== null) {
      return cached;
    }
  }

  const inFlight = inFlightStatusRequests.get(brandId);
  if (inFlight) {
    return inFlight;
  }

  const request = brandApi
    .checkPatchStatus(brandId)
    .then((patched) => {
      writeCachedPatchStatus(brandId, Boolean(patched));
      return Boolean(patched);
    })
    .finally(() => {
      inFlightStatusRequests.delete(brandId);
    });

  inFlightStatusRequests.set(brandId, request);
  return request;
};

type UseBrandPatchStatusOptions = {
  brandId?: string | null;
  enabled?: boolean;
};

/**
 * Thrown when the viewer cannot patch at all — a brand account, the owner, or a
 * signed-out visitor. Distinct from a network failure so the UI can say
 * something true instead of "please try again".
 */
export class BrandPatchUnavailableError extends Error {
  constructor() {
    super('Patching is only available to shopper accounts.');
    this.name = 'BrandPatchUnavailableError';
  }
}

export function useBrandPatchStatus({ brandId, enabled = true }: UseBrandPatchStatusOptions) {
  const normalizedBrandId = useMemo(() => normalizeBrandId(brandId), [brandId]);
  const isEnabled = Boolean(enabled && normalizedBrandId);

  const [isPatched, setIsPatched] = useState<boolean>(() => {
    if (!normalizedBrandId) return false;
    const cached = readCachedPatchStatus(normalizedBrandId);
    return cached ?? false;
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (options?: { force?: boolean; silent?: boolean }) => {
      if (!normalizedBrandId || !isEnabled) return false;

      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const next = await fetchPatchStatus(normalizedBrandId, options?.force === true);
        setIsPatched(next);
        return next;
      } catch {
        return false;
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [isEnabled, normalizedBrandId],
  );

  const toggle = useCallback(async () => {
    /**
     * Refuse loudly, not with a value that reads as success.
     *
     * This used to `return false` when patching was unavailable — and the
     * caller treats `false` as "now unpatched", so it toasted "Unpatched
     * brand." at someone who had just been silently refused and whose patch
     * state had not changed at all. A disabled action must not report an
     * outcome it did not produce.
     */
    if (!normalizedBrandId || !isEnabled) {
      throw new BrandPatchUnavailableError();
    }

    const previous = isPatched;
    const optimistic = !previous;

    setLoading(true);
    setIsPatched(optimistic);
    writeCachedPatchStatus(normalizedBrandId, optimistic);

    try {
      if (previous) {
        await brandApi.unpatchBrand(normalizedBrandId);
      } else {
        await brandApi.patchBrand(normalizedBrandId);
      }

      const verified = await fetchPatchStatus(normalizedBrandId, true);
      setIsPatched(verified);
      return verified;
    } catch (error) {
      setIsPatched(previous);
      writeCachedPatchStatus(normalizedBrandId, previous);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [isEnabled, isPatched, normalizedBrandId]);

  useEffect(() => {
    if (!normalizedBrandId || !isEnabled) {
      setIsPatched(false);
      setLoading(false);
      return;
    }

    const cached = readCachedPatchStatus(normalizedBrandId);
    if (cached !== null) {
      setIsPatched(cached);
      setLoading(false);
      return;
    }

    void refresh({ silent: true });
  }, [isEnabled, normalizedBrandId, refresh]);

  // Stay in sync with any other mounted instance that toggles this brand.
  useEffect(() => {
    if (!normalizedBrandId) return;
    const unsubscribe = subscribePatchStatus(normalizedBrandId, (value) => {
      setIsPatched(value);
    });
    return unsubscribe;
  }, [normalizedBrandId]);

  return {
    isPatched,
    loading,
    refresh,
    toggle,
  } as const;
}

export default useBrandPatchStatus;
