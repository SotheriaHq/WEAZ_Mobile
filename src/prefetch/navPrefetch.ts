/**
 * Phase 5 high-level prefetch helpers.
 *
 * These wrap the existing primitives — `router.prefetch` (expo-router PRELOAD),
 * React Query prefetch via `preloadQuery`, and `prefetchResolvedImageAsset` —
 * and route every call through the budget scheduler + NAV_PERF instrumentation.
 *
 * Note: `router.prefetch(href)` mounts the destination screen off-screen, so its
 * mount effects (useCachedQuery, image warming) fire automatically. Route warming
 * therefore cascades into query + media warming for free (spec §2.3) — callers
 * usually only need `prefetchRoute`, plus an explicit hero-image warm for snappy
 * first paint.
 */
import { router } from 'expo-router';
import type { QueryKey } from '@tanstack/react-query';

import { preloadQuery, isCachedQueryFresh } from '@/src/cache';
import type { CachePolicy } from '@/src/cache/policies';
import { prefetchResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { navPerf } from '@/src/utils/navPerf';
import { schedulePrefetch, type PrefetchPriority } from '@/src/prefetch/prefetchBudget';

type Href = Parameters<typeof router.prefetch>[0];

export function prefetchRoute(href: Href, priority: PrefetchPriority = 'idle'): void {
  schedulePrefetch({
    key: `route:${typeof href === 'string' ? href : JSON.stringify(href)}`,
    lane: 'route',
    priority,
    run: async () => {
      navPerf.mark('route_prefetch_started');
      try {
        router.prefetch(href);
      } catch {
        // expo-router prefetch is best-effort; never let it surface.
      }
      navPerf.mark('route_prefetch_completed');
    },
  });
}

export function prefetchQuery<T>(args: {
  key: QueryKey;
  fetcher: (context: { signal?: AbortSignal }) => Promise<T>;
  policy?: CachePolicy;
  priority?: PrefetchPriority;
}): void {
  schedulePrefetch({
    key: `query:${JSON.stringify(args.key)}`,
    lane: 'query',
    priority: args.priority ?? 'near',
    run: async (signal) => {
      // Already-warm queries are a cache hit — skip the network entirely.
      if (isCachedQueryFresh(args.key, args.policy)) {
        navPerf.mark('prefetch_cache_hit');
        return;
      }
      navPerf.mark('prefetch_cache_miss');
      navPerf.mark('query_prefetch_started');
      await preloadQuery<T>({
        key: args.key,
        fetcher: (context) => args.fetcher({ signal: context.signal ?? signal }),
        policy: args.policy,
      }).catch(() => undefined);
      navPerf.mark('query_prefetch_completed');
    },
  });
}

export function prefetchMedia(
  source: { src?: string | null; fileId?: string | null },
  priority: PrefetchPriority = 'near',
): void {
  const identity = source.src ?? source.fileId;
  if (!identity) return;
  schedulePrefetch({
    key: `media:${identity}`,
    lane: 'media',
    priority,
    run: async () => {
      navPerf.mark('media_prefetch_started');
      await prefetchResolvedImageAsset({
        src: source.src ?? null,
        fileId: source.fileId ?? null,
        debugContext: { sourceField: 'phase5.prefetch' },
      }).catch(() => undefined);
      navPerf.mark('media_prefetch_completed');
    },
  });
}

/**
 * Tap-time detail warming: warm the destination route (which cascades to its
 * query) plus the hero image, at top priority. Call from `onPressIn`.
 */
export function prefetchDetailOnPress(args: {
  href: Href;
  hero?: { src?: string | null; fileId?: string | null };
}): void {
  navPerf.mark('tap_prefetch_started');
  prefetchRoute(args.href, 'tap');
  if (args.hero) prefetchMedia(args.hero, 'tap');
  navPerf.mark('tap_prefetch_completed');
}
