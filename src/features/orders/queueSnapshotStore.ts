import type { QueuePresenter } from '@/src/api/CustomOrderQueueApi';

const MAX_SNAPSHOTS = 200;
const MAX_AGE_MS = 10 * 60000;
const snapshots = new Map<string, { queue: QueuePresenter; receivedAt: number }>();

/** A slow pre-retain read must not replace a newer confirmed cancellation deadline. */
export function acceptQueueSnapshot(id: string, incoming: QueuePresenter | null | undefined): QueuePresenter | null {
  const now = performance.now();
  const current = snapshots.get(id);
  if (current && now - current.receivedAt > MAX_AGE_MS) snapshots.delete(id);
  const previous = snapshots.get(id)?.queue;
  if (previous && (!incoming || incoming.orderRevision < previous.orderRevision
    || incoming.orderRevision === previous.orderRevision && Date.parse(incoming.serverNow) < Date.parse(previous.serverNow))) return previous;
  if (!incoming) return null;
  snapshots.delete(id);
  snapshots.set(id, { queue: incoming, receivedAt: now });
  while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!);
  return incoming;
}

export function clearQueueSnapshots() { snapshots.clear(); }
