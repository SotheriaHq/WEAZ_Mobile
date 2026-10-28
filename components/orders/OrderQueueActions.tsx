import { acceptQueueSnapshot } from '@/src/features/orders/queueSnapshotStore';
import { CustomOrderPriceBreakdown } from './CustomOrderPriceBreakdown';
import { canRetainQueue } from '@/src/features/orders/customOrderQueuePresentation';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OrderQueueBadge } from './OrderQueueBadge';
import { BuyerOrdersApi, toBuyerOrderSummary, type BuyerCustomOrderDetail } from '@/src/api/BuyerOrdersApi';
import { CustomOrderQueueApi, type QueueRefundQuote } from '@/src/api/CustomOrderQueueApi';
import { useBagFlow } from '@/src/features/bagging/BagFlowContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { markOrdersChanged } from '@/src/features/orders/orderRevision';
import { useQueueClock, syncQueueClock } from '@/src/features/orders/queueClock';
import { tokens } from '@/src/styles/tokens';
import { formatMoney } from '@/src/utils/money';
import { describeRefund } from '@/src/lib/refundPresentation';

export function OrderQueueActions({ order, onChange, onRefresh }: {
  order: BuyerCustomOrderDetail;
  onChange: (order: BuyerCustomOrderDetail) => void;
  onRefresh: () => void;
}) {
  const queue = order.queue;
  const bagFlow = useBagFlow();
  const bagging = useMobileBagging();
  const now = useQueueClock(queue);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'cancel' | 'retain' | 'resubmit' | null>(null);
  const [quote, setQuote] = useState<QueueRefundQuote | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    busyRef.current = false;
    setBusy(false); setDialog(null); setQuote(null); setError(null); setReason('');
    return () => { generation.current += 1; };
  }, [order.id]);
  if (!queue) return null;
  const waiting = queue.lane === 'PENDING' || queue.lane === 'UP_NEXT';
  const retainOpen = canRetainQueue(queue, now);
  const operation = async (run: () => Promise<void>) => {
    if (busyRef.current) return;
    const started = generation.current;
    busyRef.current = true; setBusy(true); setError(null);
    try { await run(); }
    catch (failure) {
      if (started !== generation.current) return;
      const message = (failure as { response?: { data?: { message?: string } }; message?: string });
      setError(typeof message.response?.data?.message === 'string' ? message.response.data.message : message.message || 'Unable to update this order. Refresh and try again.');
      onRefresh();
    }
    finally { if (started === generation.current) { busyRef.current = false; setBusy(false); } }
  };
  const apply = async (action: 'retain' | 'cancel') => {
    const started = generation.current;
    const result = action === 'retain'
      ? await CustomOrderQueueApi.retain(order.id, queue.orderRevision)
      : await CustomOrderQueueApi.cancel(order.id, quote!.orderRevision, reason.trim());
    if (started !== generation.current) return;
    if (result.queue.serverNow) syncQueueClock(result.queue.serverNow);
    const updated = { ...order, queue: acceptQueueSnapshot(order.id, result.queue) };
    onChange(updated);
    markOrdersChanged({ summary: toBuyerOrderSummary(updated) });
    setDialog(null); setQuote(null);
    // The mutation is already confirmed; preserve it if this background read fails.
    void BuyerOrdersApi.getById(order.id, { prefer: 'CUSTOM' }).then((detail) => {
      if (started === generation.current && detail.kind === 'CUSTOM' && (!detail.queue || detail.queue.orderRevision >= result.queue.orderRevision)) {
        onChange(detail); markOrdersChanged({ summary: toBuyerOrderSummary(detail) });
      }
    }).catch(() => { if (started === generation.current) onRefresh(); });
  };
  const refund = queue.refundSummary;
  const settlement = refund?.settlement as { status?: string; currency?: string; amount?: number } | undefined;
  const refundDescription = describeRefund(refund?.status);
  return (
    <View style={styles.section}>
      <AppText variant="subtitle">Queue and payment</AppText>
      <OrderQueueBadge queue={queue} onExpiry={onRefresh} />
      <CustomOrderPriceBreakdown summary={order.buyerPriceSummary} currency={order.currency} />
      {queue.queueExpiresAt && waiting ? <AppText variant="captionRegular" tone="muted">Cancellation deadline: {new Date(queue.queueExpiresAt).toLocaleString()}. Cancellation proceeds even if reminders cannot be delivered.</AppText> : null}
      {queue.captureSummary && order.paymentStatus === 'PAID' ? <AppText variant="body" tone="muted">Captured: {formatMoney(Number(queue.captureSummary.amount ?? order.amount), order.currency)}. {queue.captureSummary.held === true ? 'Held until Active.' : 'See the receipt and current order state below.'} Becoming Up Next does not charge you again.</AppText> : null}
      {refund && refundDescription ? <AppText variant="body">{refundDescription.title}{refund.refundAmount != null || refund.amount != null ? ` · ${formatMoney(Number(refund.refundAmount ?? refund.amount), order.currency)}` : ''}. {refundDescription.description}</AppText> : null}
      {settlement?.status === 'RECORDED' && settlement.currency !== order.currency ? <AppText variant="body">Original payment method refund: {formatMoney(Number(settlement.amount), settlement.currency)}, using the recorded payment rate.</AppText> : null}
      {refund?.kind === 'PARTIAL' && !queue.canResubmit ? <AppText variant="body">This is a partial refund. Your order continues in its existing fulfilment stage.</AppText> : null}
      {(queue.refundHistory?.length ?? 0) > 1 ? <View style={styles.stack}><AppText variant="subtitle">Refund history</AppText>{queue.refundHistory!.map(item => <AppText key={item.id} variant="body">{item.kind === 'PARTIAL' ? 'Partial refund' : 'Cancellation refund'}: {formatMoney(item.amount, item.currency)} · {item.status}</AppText>)}</View> : null}
      {error ? <AppText variant="body" tone="danger">{error}</AppText> : null}
      {retainOpen ? <Button title="Retain my position" disabled={busy} onPress={() => { setError(null); setDialog('retain'); }} /> : null}
      {queue.canCancel ? <Button title="Review cancellation and refund" variant="ghost" disabled={busy} onPress={() => void operation(async () => { const started = generation.current; const value = await CustomOrderQueueApi.quote(order.id); if (started === generation.current) { setQuote(value); setDialog('cancel'); if (value.orderRevision !== queue.orderRevision) onRefresh(); } })} /> : null}
      {queue.canResubmit ? <Button title="Order again at current price" variant="ghost" disabled={busy || !bagFlow} onPress={() => { setError(null); setDialog('resubmit'); }} /> : null}
      <AppBottomSheet visible={dialog !== null} title={dialog === 'cancel' ? 'Review your refund' : dialog === 'retain' ? 'Retain your position' : 'Place a new order'} onClose={() => { if (!busy) setDialog(null); }} scrollable>
        <View style={styles.stack}>
          {dialog === 'cancel' && quote ? <>
            {([
              ['Captured', quote.captureAmount], ['Garment subtotal', quote.garmentSubtotal],
              ['VAT withheld', quote.vatAmount], ['Garment cancellation charge', quote.garmentCharge],
              ['Jump fee cancellation charge', quote.jumpCharge], ['Delivery refunded in full', quote.deliveryAmount],
              ['Total withheld', quote.withheldAmount], ['Refund requested', quote.refundAmount],
            ] as const).map(([label, value]) => <AppText key={label} variant="body">{label}: {formatMoney(value, quote.currency)}</AppText>)}
            {quote.settlement?.status === 'RECORDED' && quote.settlement.currency !== quote.currency ? <AppText variant="body">Estimated refund to your original payment method: {formatMoney(Number(quote.settlement.amount), quote.settlement.currency)}. Uses the original payment rate of {quote.settlement.rate}. Minor-unit rounding is finalized when the refund is recorded.</AppText> : null}
            {quote.settlement?.status === 'REQUIRES_RECONCILIATION' ? <AppText variant="body" tone="warning">Your cancellation will be recorded. WIEZ must verify the original payment conversion before submitting the refund.</AppText> : null}
            <AppText variant="body" tone="muted">These deductions also apply if the brand, WIEZ or automatic expiry cancels before Active. Cancellation requests a refund; it does not confirm bank credit.</AppText>
            {quote.orderRevision !== queue.orderRevision ? <>
              <AppText variant="body" tone="warning">The order changed. Review an updated refund quote before confirming.</AppText>
              <Button title="Refresh refund quote" variant="ghost" disabled={busy} onPress={() => void operation(async () => { const started = generation.current; const value = await CustomOrderQueueApi.quote(order.id); if (started === generation.current) { setQuote(value); onRefresh(); } })} />
            </> : null}
            <Input label="Cancellation reason (at least 3 characters)" value={reason} onChangeText={setReason} maxLength={1000} multiline />
            <Button title={busy ? 'Cancelling…' : 'Confirm cancellation'} disabled={busy || reason.trim().length < 3 || quote.orderRevision !== queue.orderRevision} onPress={() => void operation(() => apply('cancel'))} />
          </> : null}
          {dialog === 'retain' ? <>
            <AppText variant="body">Use your one retain to add 42 days to the existing cancellation deadline. Your position and priority remain unchanged.</AppText>
            <Button title="Confirm retain" disabled={busy || !retainOpen} onPress={() => void operation(() => apply('retain'))} />
          </> : null}
          {dialog === 'resubmit' ? <>
            <AppText variant="body">This creates a new order at the current price and back of the queue. Your old refund continues separately and cannot pay for this order. Measurements, delivery and availability will be checked again. A new payment is required.</AppText>
            <Button title="Review new order" disabled={busy} onPress={() => void operation(async () => {
              const started = generation.current;
              const next = await CustomOrderQueueApi.resubmit(order.id);
              if (started !== generation.current) return;
              const sourceStatus = await bagging.prepareSourceBag(next.sourceType, next.sourceId, { forceRefresh: true });
              if (started !== generation.current) return;
              setDialog(null);
              bagFlow?.openCustomFlow({ id: next.sourceId, sourceId: next.sourceId, sourceType: next.sourceType, name: order.title, previousOrderId: next.previousOrderId }, sourceStatus);
            })} />
          </> : null}
          {error ? <AppText variant="body" tone="danger">{error}</AppText> : null}
          <Button title="Go back" variant="ghost" disabled={busy} onPress={() => setDialog(null)} />
        </View>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: tokens.spacing.md }, section: { gap: tokens.spacing.md, paddingVertical: tokens.spacing.lg } });
