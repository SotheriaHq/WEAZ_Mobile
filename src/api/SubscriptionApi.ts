import { apiClient } from './httpClient';
import { LEGAL_PAGE_VERSION } from '@/src/legal/legalDocuments';

export type Subscription = {
  id?: string;
  tierKey: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  lockedMonthlyPriceNgn: number;
  cancelAtPeriodEnd: boolean;
  pendingTierKey?: string | null;
  recoveryUntil?: string | null;
  savedPaymentMethodId?: string | null;
};
export type SubscriptionTier = {
  tierKey: string;
  label: string;
  monthlyPriceNgn: number;
  maxActive: number | null;
  maxInDelivery: number | null;
  queueJumpAllowed: boolean;
};
export type SubscriptionCard = {
  id: string;
  nickname?: string | null;
  brand?: string | null;
  last4: string;
  expMonth?: string;
  expYear?: string;
  reusable: boolean;
  isDefault?: boolean;
};
export type SubscriptionPreview = {
  amountNgn: number;
  effectiveAt: string;
  periodEnd: string;
  kind: string;
};
export type SubscriptionPayment = {
  reference?: string;
  authorizationUrl?: string;
  amountNgn: number;
  status?: string;
  action: string;
};
export type SubscriptionHistoryItem = Partial<Subscription> & {
  id: string;
  createdAt: string;
  amountNgn?: number;
  currency?: string;
  reference?: string;
  periodStart?: string;
  periodEnd?: string;
  cancelRequestedAt?: string | null;
};
export type UpgradeNotice = { title: string; message: string; tierKey: string };
const root = (brandId: string) => `/brands/${brandId}/subscription`;
function unwrap<T>(data: unknown): T {
  return (
    data && typeof data === 'object' && 'data' in data ? data.data : data
  ) as T;
}
async function get<T>(url: string, params?: Record<string, unknown>) {
  return unwrap<T>((await apiClient.get(url, { params })).data);
}
async function post<T>(url: string, body: unknown = {}) {
  return unwrap<T>((await apiClient.post(url, body)).data);
}
export const SubscriptionApi = {
  get: (id: string) =>
    get<{
      subscription: Subscription | null;
      legacyEligible: boolean;
      tiers: SubscriptionTier[];
      invoices: Array<{
        id: string;
        reference: string;
        status: string;
        amountNgn: number;
        authorizationUrl?: string;
      }>;
    }>(root(id)),
  preview: (id: string, tierKey: string) =>
    post<SubscriptionPreview>(`${root(id)}/preview`, { tierKey }),
  checkout: (
    id: string,
    tierKey: string,
    amount: number,
    callbackUrl: string,
    savedCardId?: string,
  ) =>
    post<SubscriptionPayment>(`${root(id)}/checkout`, {
      tierKey,
      expectedAmountNgn: amount,
      callbackUrl,
      savedCardId,
      recurringConsent: true,
      legalVersion: LEGAL_PAGE_VERSION,
    }),
  cancel: (id: string) => post(`${root(id)}/cancel-renewal`),
  verify: (id: string, reference: string) =>
    post<{ status: string }>(`${root(id)}/verify`, { reference }),
  history: (id: string, kind: 'BILLING' | 'SUBSCRIPTIONS', cursor?: string) =>
    get<{ items: SubscriptionHistoryItem[]; nextCursor: string | null }>(
      `${root(id)}/history`,
      { kind, cursor },
    ),
  cards: (id: string) => get<SubscriptionCard[]>(`${root(id)}/payment-methods`),
  changeCard: (id: string, savedCardId: string) =>
    post(`${root(id)}/payment-method`, {
      savedCardId,
      recurringConsent: true,
      legalVersion: LEGAL_PAGE_VERSION,
    }),
  renameCard: (id: string, nickname: string) =>
    apiClient.patch(`/payment/saved-cards/${id}`, { nickname }),
  deleteCard: (id: string) => apiClient.delete(`/payment/saved-cards/${id}`),
  defaultCard: (id: string) => post(`/payment/saved-cards/${id}/default`),
  claimNotice: (id: string) =>
    post<{ notice: UpgradeNotice | null }>(`${root(id)}/notice`),
  dismissNotice: (id: string) => post(`${root(id)}/notice/dismiss`),
};
