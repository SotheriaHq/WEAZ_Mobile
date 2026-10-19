import { apiClient } from './httpClient';

export type QueuePresenter = {
  refundHistory?: Array<{ id: string; kind: string; status: string; amount: number; currency: string; createdAt: string }>;
  lane: 'PENDING' | 'UP_NEXT' | 'ACTIVE' | 'IN_DELIVERY' | 'TERMINAL' | null;
  orderRevision: number;
  serverNow: string;
  queueExpiresAt: string | null;
  retainOpensAt: string | null;
  retainClosesAt: string | null;
  canRetain: boolean;
  canCancel: boolean;
  canResubmit: boolean;
  adminPromotionHeld: boolean;
  position: number | null;
  waitingCount: number;
  activatedAt: string | null;
  captureSummary: Record<string, unknown> | null;
  refundSummary: Record<string, unknown> | null;
};

export type QueueRefundQuote = {
  settlement?: { status: 'RECORDED' | 'REQUIRES_RECONCILIATION'; amount?: number; currency?: string; rate?: string };
  settlementIsEstimate?: boolean;
  currency: string;
  captureAmount: number;
  garmentSubtotal: number;
  vatAmount: number;
  deliveryAmount: number;
  jumpFeeAmount: number;
  garmentCharge: number;
  jumpCharge: number;
  withheldAmount: number;
  refundAmount: number;
  orderRevision: number;
};

export type BrandQueueSummary = {
  counts: Record<'PENDING' | 'UP_NEXT' | 'ACTIVE' | 'IN_DELIVERY', number>;
  capacity: { tierKey: string; active: number | null; inDelivery: number | null; queueJumpAllowed: boolean };
  queueJumpEnabled: boolean;
  intakeBlocked: boolean;
  intakeAllowed: boolean;
  jumpAvailable: boolean;
  openOrderCount: number;
  serverNow: string;
};

function unwrap<T>(value: unknown): T {
  const envelope = value as { data?: unknown };
  return (envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : value) as T;
}

const orderPath = (id: string) => `/custom-orders/queue/orders/${encodeURIComponent(id)}`;

export const CustomOrderQueueApi = {
  async settings(id: string, queueJumpEnabled: boolean) {
    return unwrap<BrandQueueSummary>((await apiClient.patch(`/custom-orders/queue/brands/${encodeURIComponent(id)}/settings`, { queueJumpEnabled })).data);
  },
  async summaries(orderIds: string[]) {
    if (!orderIds.length) return {} as Record<string, QueuePresenter>;
    const response = await apiClient.post('/custom-orders/queue/summaries', { orderIds });
    return unwrap<{ orders: Record<string, QueuePresenter> }>(response.data).orders;
  },
  async get(id: string) {
    return unwrap<QueuePresenter>((await apiClient.get(orderPath(id))).data);
  },
  async brand(id: string) {
    return unwrap<BrandQueueSummary>((await apiClient.get(`/custom-orders/queue/brands/${encodeURIComponent(id)}`)).data);
  },
  async quote(id: string) {
    return unwrap<QueueRefundQuote>((await apiClient.get(`${orderPath(id)}/refund-quote`)).data);
  },
  async retain(id: string, expectedRevision: number) {
    return unwrap<{ queue: QueuePresenter }>((await apiClient.post(`${orderPath(id)}/retain`, { expectedRevision })).data);
  },
  async cancel(id: string, expectedRevision: number, reason: string) {
    return unwrap<{ queue: QueuePresenter }>((await apiClient.post(`${orderPath(id)}/cancel`, { expectedRevision, reason })).data);
  },
  async resubmit(id: string) {
    return unwrap<{ sourceType: 'PRODUCT' | 'DESIGN'; sourceId: string; configurationId: string; previousOrderId: string; refundPending: boolean; requiresNewPayment: true }>(
      (await apiClient.post(`${orderPath(id)}/resubmit`)).data,
    );
  },
  async notices() {
    return unwrap<{ notices: Array<{ id: string; title: string; body: string; startsAt?: string; endsAt?: string | null }>; serverNow: string }>(
      (await apiClient.get('/custom-orders/queue/notices')).data,
    );
  },
};
