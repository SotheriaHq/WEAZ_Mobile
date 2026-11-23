import { useCallback, useEffect, useState } from 'react';

import { brandApi } from '@/src/api/BrandApi';
import {
  confirmBrandPatchStatus,
  isPatchListLoaded,
  seedBrandPatchStatus,
  subscribeBrandPatchChanges,
  toggleBrandPatch,
  useIsBrandPatched,
} from '@/src/features/patches/patchStore';

/**
 * One brand's patch state, read from the shared patch store
 * (`src/features/patches/patchStore.ts`), so every screen shows the same pill.
 */

/** Kept for callers outside React; forwards to the shared store. */
export const subscribeAllBrandPatchStatus = subscribeBrandPatchChanges;

/** A state the server has already confirmed through another path. */
export const setBrandPatchStatus = (brandId: string | null | undefined, value: boolean): void => {
  confirmBrandPatchStatus(brandId, value);
};

const normalizeBrandId = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const inFlightChecks = new Map<string, Promise<boolean>>();

/** Per-brand check, only until the account's full list has loaded. */
function checkOnce(brandId: string): Promise<boolean> {
  const existing = inFlightChecks.get(brandId);
  if (existing) return existing;
  const request = brandApi
    .checkPatchStatus(brandId)
    .then((patched) => {
      seedBrandPatchStatus(brandId, Boolean(patched));
      return Boolean(patched);
    })
    .finally(() => inFlightChecks.delete(brandId));
  inFlightChecks.set(brandId, request);
  return request;
}

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
  const normalizedBrandId = normalizeBrandId(brandId);
  const isEnabled = Boolean(enabled && normalizedBrandId);
  const storePatched = useIsBrandPatched(isEnabled ? normalizedBrandId : null);
  const isPatched = isEnabled && storePatched;
  // Only the first read of an unknown brand. A tap in progress is NOT loading:
  // the button stays live so a second tap can take the first one back.
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (options?: { force?: boolean; silent?: boolean }) => {
      if (!normalizedBrandId || !isEnabled) return false;
      if (isPatchListLoaded() && !options?.force) return isPatched;
      if (!options?.silent) setLoading(true);
      try {
        return await checkOnce(normalizedBrandId);
      } catch {
        return isPatched;
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [isEnabled, isPatched, normalizedBrandId],
  );

  /**
   * Resolves with the settled state, or `null` when there is nothing to
   * announce: a later tap superseded this one, or the taps cancelled out.
   * Throws when the server refused, after the pill has been put back.
   */
  const toggle = useCallback(async (): Promise<boolean | null> => {
    // A disabled action must not report an outcome it did not produce.
    if (!normalizedBrandId || !isEnabled) {
      throw new BrandPatchUnavailableError();
    }
    const outcome = await toggleBrandPatch(normalizedBrandId);
    if (outcome.status === 'failed') throw outcome.error;
    if (outcome.status === 'superseded' || !outcome.changed) return null;
    return outcome.patched;
  }, [isEnabled, normalizedBrandId]);

  useEffect(() => {
    if (!normalizedBrandId || !isEnabled || isPatchListLoaded()) return;
    void checkOnce(normalizedBrandId).catch(() => undefined);
  }, [isEnabled, normalizedBrandId]);

  return {
    isPatched,
    loading,
    refresh,
    toggle,
  } as const;
}

export default useBrandPatchStatus;
