/**
 * Brand finance API — payouts overview, held funds, incoming credits.
 * Mirrors web BrandApi payout endpoints; errors propagate (no silent null).
 */
import { apiClient } from './httpClient';

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function toArrayOrItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { items?: T[] }).items)) {
    return (value as { items: T[] }).items;
  }
  return [];
}

export type BrandFinanceOverview = {
  currency: string;
  availableBalance: number;
  releasedBalance: number;
  reservedPayoutBalance: number;
  paidOutBalance: number;
  incomingCredits: number;
  totalOrders: number;
  activeEscrowHolds?: number;
  queuedCustomAllocations?: number;
  negativeBalance: boolean;
};

export type BrandIncomingTransaction = {
  id: string;
  amount: number;
  grossAmount?: number;
  commissionAmount?: number;
  netAmount?: number;
  currency: string;
  createdAt: string;
  title?: string | null;
  counterparty?: string | null;
  description?: string | null;
  stage?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type BrandHeldFund = {
  id: string;
  holdType: string;
  referenceId?: string | null;
  title: string;
  counterparty?: string | null;
  currency: string;
  grossAmount: number;
  commissionAmount?: number;
  netBrandAmount?: number;
  releasedGrossAmount?: number;
  releasedNetAmount: number;
  heldGrossAmount?: number;
  heldNetAmount: number;
  status: string;
  nextReleaseAt?: string | null;
  releaseCondition?: string | null;
  frozenReason?: string | null;
};

export type BrandPayoutRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  providerTransferStatus?: string | null;
  createdAt: string;
  processedAt?: string | null;
  paidAt?: string | null;
};

export type BrandFinanceBundle = {
  brandId: string;
  overview: BrandFinanceOverview;
  incoming: BrandIncomingTransaction[];
  heldFunds: BrandHeldFund[];
  payouts: BrandPayoutRow[];
};

const money = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const mapOverview = (raw: any): BrandFinanceOverview => ({
  currency: String(raw?.currency || 'NGN'),
  availableBalance: money(raw?.availableBalance),
  releasedBalance: money(raw?.releasedBalance),
  reservedPayoutBalance: money(raw?.reservedPayoutBalance),
  paidOutBalance: money(raw?.paidOutBalance),
  incomingCredits: money(raw?.incomingCredits),
  totalOrders: money(raw?.totalOrders),
  activeEscrowHolds: money(raw?.activeEscrowHolds),
  queuedCustomAllocations: money(raw?.queuedCustomAllocations),
  negativeBalance: Boolean(raw?.negativeBalance),
});

const mapIncoming = (raw: any): BrandIncomingTransaction => ({
  id: String(raw?.id ?? ''),
  amount: money(raw?.amount ?? raw?.netAmount),
  grossAmount: money(raw?.grossAmount),
  commissionAmount: money(raw?.commissionAmount),
  netAmount: money(raw?.netAmount ?? raw?.amount),
  currency: String(raw?.currency || 'NGN'),
  createdAt: String(raw?.createdAt ?? ''),
  title: raw?.title ?? null,
  counterparty: raw?.counterparty ?? null,
  description: raw?.description ?? null,
  stage: raw?.stage ?? null,
  referenceType: raw?.referenceType ?? null,
  referenceId: raw?.referenceId ?? null,
});

const mapHeld = (raw: any): BrandHeldFund => ({
  id: String(raw?.id ?? ''),
  holdType: String(raw?.holdType || 'STANDARD_ORDER'),
  referenceId: raw?.referenceId ?? null,
  title: String(raw?.title || 'Held funds'),
  counterparty: raw?.counterparty ?? null,
  currency: String(raw?.currency || 'NGN'),
  grossAmount: money(raw?.grossAmount),
  commissionAmount: money(raw?.commissionAmount),
  netBrandAmount: money(raw?.netBrandAmount),
  releasedGrossAmount: money(raw?.releasedGrossAmount),
  releasedNetAmount: money(raw?.releasedNetAmount),
  heldGrossAmount: money(raw?.heldGrossAmount),
  heldNetAmount: money(raw?.heldNetAmount),
  status: String(raw?.status || 'HELD'),
  nextReleaseAt: raw?.nextReleaseAt ?? null,
  releaseCondition: raw?.releaseCondition ?? null,
  frozenReason: raw?.frozenReason ?? null,
});

const mapPayout = (raw: any): BrandPayoutRow => ({
  id: String(raw?.id ?? ''),
  amount: money(raw?.amount),
  currency: String(raw?.currency || 'NGN'),
  status: String(raw?.status || 'PENDING_APPROVAL'),
  providerTransferStatus: raw?.providerTransferStatus ?? null,
  createdAt: String(raw?.createdAt ?? ''),
  processedAt: raw?.processedAt ?? null,
  paidAt: raw?.paidAt ?? null,
});

export const brandFinanceApi = {
  async getOverview(brandId: string): Promise<BrandFinanceOverview> {
    const response = await apiClient.get(`/brands/${brandId}/payouts/overview`);
    return mapOverview(unwrapData(response.data));
  },

  async getIncoming(
    brandId: string,
    params?: { page?: number; limit?: number },
  ): Promise<BrandIncomingTransaction[]> {
    const response = await apiClient.get(`/brands/${brandId}/payouts/incoming`, {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });
    return toArrayOrItems(unwrapData(response.data)).map(mapIncoming);
  },

  async getHeldFunds(
    brandId: string,
    params?: { page?: number; limit?: number },
  ): Promise<BrandHeldFund[]> {
    const response = await apiClient.get(`/brands/${brandId}/payouts/held-funds`, {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });
    return toArrayOrItems(unwrapData(response.data)).map(mapHeld);
  },

  async getPayouts(
    brandId: string,
    params?: { page?: number; limit?: number },
  ): Promise<BrandPayoutRow[]> {
    const response = await apiClient.get(`/brands/${brandId}/payouts`, {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });
    return toArrayOrItems(unwrapData(response.data)).map(mapPayout);
  },

  async requestPayout(brandId: string, amount: number): Promise<unknown> {
    const response = await apiClient.post(`/brands/${brandId}/payouts/request`, {
      amount,
    });
    return unwrapData(response.data);
  },

  async loadBundle(brandId: string): Promise<BrandFinanceBundle> {
    const [overview, incoming, heldFunds, payouts] = await Promise.all([
      brandFinanceApi.getOverview(brandId),
      brandFinanceApi.getIncoming(brandId, { page: 1, limit: 20 }),
      brandFinanceApi.getHeldFunds(brandId, { page: 1, limit: 20 }),
      brandFinanceApi.getPayouts(brandId, { page: 1, limit: 20 }),
    ]);

    return {
      brandId,
      overview,
      incoming,
      heldFunds,
      payouts,
    };
  },
};

export default brandFinanceApi;
