import { canRetainQueue } from '@/src/features/orders/customOrderQueuePresentation';
import { requestQueueExpiryRefresh } from '@/src/features/orders/orderRevision';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import type { QueuePresenter } from '@/src/api/CustomOrderQueueApi';
import { queueCountdown, useQueueClock } from '@/src/features/orders/queueClock';
import { tokens } from '@/src/styles/tokens';

export function OrderQueueBadge({ queue, onExpiry }: { queue?: QueuePresenter | null; onExpiry?: () => void }) {
  const now = useQueueClock(queue);
  const refreshed = useRef<string | null>(null);
  const retainRefreshed = useRef<string | null>(null);
  const waiting = queue?.lane === 'PENDING' || queue?.lane === 'UP_NEXT';
  const deadline = waiting ? queue.queueExpiresAt : null;
  const due = Boolean(deadline && Date.parse(deadline) <= now);
  useEffect(() => {
    if (due && deadline && refreshed.current !== deadline) {
      refreshed.current = deadline;
      (onExpiry ?? requestQueueExpiryRefresh)();
    }
  }, [deadline, due, onExpiry]);
  useEffect(() => {
    const opens = queue?.retainOpensAt;
    if (waiting && opens && now >= Date.parse(opens) && Date.parse(queue.serverNow) < Date.parse(opens) && retainRefreshed.current !== opens) {
      retainRefreshed.current = opens;
      (onExpiry ?? requestQueueExpiryRefresh)();
    }
  }, [now, onExpiry, queue, waiting]);
  if (!queue?.lane) return null;
  const countdown = waiting ? queueCountdown(deadline, now) : null;
  const exactDeadline = deadline && Number.isFinite(Date.parse(deadline))
    ? new Date(deadline).toLocaleString() : null;
  return (
    <View style={{ gap: tokens.spacing.xs }}>
      <AppText variant="small" tone="primary">
        {queue.lane === 'TERMINAL' ? queue.canResubmit ? 'Cancelled' : 'Completed' : queue.lane.replace(/_/g, ' ')}{waiting && queue.position != null ? ` · Position ${queue.position} of ${queue.waitingCount}` : ''}
      </AppText>
      {countdown ? <AppText variant="small" tone={due ? 'danger' : 'warning'} accessibilityLabel={`${countdown}. Cancellation deadline ${exactDeadline}`}>
        ⏳ {countdown}
      </AppText> : null}
      {waiting ? <AppText variant="small" tone="muted">Paid · funds held until Active</AppText> : null}
      {canRetainQueue(queue, now) ? <AppText variant="small" tone="primary">Retain available - open order to review</AppText> : null}
      {queue.adminPromotionHeld ? <AppText variant="small" tone="warning">WIEZ has paused promotion. Your cancellation deadline still applies.</AppText> : null}
    </View>
  );
}
