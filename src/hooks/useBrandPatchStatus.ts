import { useCallback, useEffect, useMemo, useState } from 'react';

import { brandApi } from '@/src/api/BrandApi';

const PATCH_STATUS_TTL_MS = 30_000;

type PatchCacheEntry = {
  value: boolean;
  expiresAt: number;
};

const patchStatusCache = new Map<string, PatchCacheEntry>();
const inFlightStatusRequests = new Map<string, Promise<boolean>>();

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
    if (!normalizedBrandId || !isEnabled) return false;

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

  return {
    isPatched,
    loading,
    refresh,
    toggle,
  } as const;
}

export default useBrandPatchStatus;
