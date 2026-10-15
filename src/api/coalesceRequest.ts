/**
 * Share one in-flight request between concurrent callers, and hold the answer
 * for a short window afterwards.
 *
 * Some reads are wanted by several independent screens at the same moment and
 * none of them knows about the others. `GET /users/:id/patches` is the clearest
 * case: `RunwayFeedScreen`, `me.tsx` and `profile/[id].tsx` each call
 * `ProfileApi.getPatches` directly, so a cold start fired it FOUR times inside
 * one burst — four identical queries, four identical answers, one of which was
 * needed.
 *
 * React Query would dedupe this, but these call sites are plain `await`s inside
 * imperative loaders rather than hooks, and rewriting three screens' loading
 * models to fix a duplicate fetch is the wrong trade. Coalescing at the API
 * boundary fixes every caller, present and future, without any of them
 * changing.
 *
 * This is NOT a cache in the React Query sense — the TTL is deliberately short
 * (seconds), enough to collapse a startup burst or a tab switch, not enough to
 * show anyone stale data. Mutations should call `invalidateCoalesced` so the
 * next read goes to the server.
 */

type Entry<T> = {
  /** Set while a request is in flight; cleared when it settles. */
  inFlight: Promise<T> | null;
  value?: T;
  settledAt?: number;
};

const entries = new Map<string, Entry<unknown>>();

export type CoalesceOptions = {
  /**
   * How long a settled value may be reused, in ms. Keep it small — this exists
   * to collapse simultaneous callers, not to be a data layer.
   */
  ttlMs?: number;
};

const DEFAULT_TTL_MS = 5_000;

export async function coalesceRequest<T>(
  key: string,
  run: () => Promise<T>,
  options?: CoalesceOptions,
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const entry = (entries.get(key) as Entry<T> | undefined) ?? { inFlight: null };

  if (entry.inFlight) return entry.inFlight;

  if (
    entry.settledAt != null &&
    entry.value !== undefined &&
    Date.now() - entry.settledAt < ttlMs
  ) {
    return entry.value;
  }

  const promise = run()
    .then((value) => {
      entries.set(key, { inFlight: null, value, settledAt: Date.now() });
      return value;
    })
    .catch((error) => {
      // Failures are never cached: the next caller must be free to retry.
      entries.delete(key);
      throw error;
    });

  entry.inFlight = promise;
  entries.set(key, entry as Entry<unknown>);
  return promise;
}

/** Drop a coalesced entry so the next read hits the network. */
export function invalidateCoalesced(keyPrefix: string) {
  for (const key of Array.from(entries.keys())) {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
      entries.delete(key);
    }
  }
}

/** Clear everything — used on sign-out, where nothing may survive. */
export function clearCoalescedRequests() {
  entries.clear();
}
