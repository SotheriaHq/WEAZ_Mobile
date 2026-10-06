/**
 * How long the persisted query cache takes to come back, and who read it early.
 *
 * `PersistQueryClientProvider` restores the dehydrated cache from AsyncStorage
 * asynchronously. React Query models that window with `useIsRestoring()`, and
 * its own `useQuery` will not fetch while it is true — the point being that a
 * screen should wait a few tens of milliseconds for data that is already on the
 * device rather than ask the network for it again.
 *
 * Nothing in this app reads that flag. `useCachedQuery` is a hand-rolled hook
 * that calls `client.getQueryData()` synchronously on mount, so a screen
 * mounting inside the restore window sees `undefined`, concludes it has no
 * cached data, renders a skeleton, and issues a request — for data that was
 * sitting in storage the whole time. That is a cache correctness problem
 * wearing a performance problem's clothes, and the only way to tell it apart
 * from a genuine cold cache is to know when the window opened and closed.
 *
 * This probe reports exactly that and changes nothing. If the restore finishes
 * before the first screen mounts, it will say so, and this line of inquiry is
 * closed. If it does not, the summary lines will show `query_cache_miss` on
 * flows that began inside the window.
 */
import { useIsRestoring } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { perfEnabled, perfNote } from '@/src/perf/wiezPerf';

const now: () => number = (() => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
})();

export function CacheRestoreProbe() {
  const isRestoring = useIsRestoring();
  const startedAtRef = useRef<number | null>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!perfEnabled() || reportedRef.current) return;

    if (isRestoring) {
      if (startedAtRef.current === null) {
        startedAtRef.current = now();
        perfNote('BOOT', 'cache_restore_began');
      }
      return;
    }

    reportedRef.current = true;
    const startedAt = startedAtRef.current;
    perfNote(
      'BOOT',
      'cache_restore_finished',
      startedAt === null
        ? 'alreadyRestoredBeforeFirstRender'
        : `${(now() - startedAt).toFixed(1)}ms`,
    );
  }, [isRestoring]);

  return null;
}
