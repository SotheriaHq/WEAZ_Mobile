import type { QueuePresenter } from '@/src/api/CustomOrderQueueApi';

export function formatQueueCountdown(deadline: string | null, now: number): string | null {
  const end = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
  const remaining = Math.max(0, end - now);
  if (!remaining) return 'Cancellation due - refreshing from WIEZ';
  const minutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  return remaining >= 48 * 3600000
    ? `Cancels in ${Math.floor(hours / 24)}d ${hours % 24}h`
    : `Cancels in ${hours}h ${minutes % 60}m`;
}

export function canRetainQueue(queue: Pick<QueuePresenter, 'lane' | 'canRetain' | 'retainOpensAt' | 'retainClosesAt'> | null | undefined, now: number): boolean {
  if (!queue || !queue.canRetain || !queue.lane || !['PENDING', 'UP_NEXT'].includes(queue.lane)) return false;
  if (!queue.retainOpensAt || !queue.retainClosesAt || !Number.isFinite(now)) return false;
  return now >= Date.parse(queue.retainOpensAt) && now <= Date.parse(queue.retainClosesAt);
}
