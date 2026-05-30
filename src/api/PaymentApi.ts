import { apiClient } from '@/src/api/httpClient';

export type PaymentAttemptStatus =
  | 'PENDING'
  | 'REQUIRES_ACTION'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export type PaymentMethodType = 'PAYSTACK';

export type PaymentChannel = 'CARD' | 'BANK_TRANSFER';

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  street: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode?: string;
  country: string;
  phone: string;
}

export interface CheckoutContactInfo {
  phone: string;
  email?: string;
  billingSameAsShipping?: boolean;
  billingAddress?: ShippingAddress;
  channel?: PaymentChannel;
}

export interface InitializeUnifiedCheckoutRequest {
  paymentMethod: PaymentMethodType;
  email: string;
  customerName: string;
  shippingAddress: ShippingAddress;
  contactInfo: CheckoutContactInfo;
  callbackUrl?: string;
  paymentData?: Record<string, unknown>;
  idempotencyKey?: string;
  validationSessionId?: string;
}

export interface PaymentSummary {
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  shippingCost: number;
  discount: number;
  grandTotal: number;
  shippingName: string;
  shippingCity: string;
  shippingState: string;
}

export interface PaymentInitResult {
  paymentAttemptId: string;
  reference: string;
  gateway: string;
  status: PaymentAttemptStatus;
  currency: string;
  settlementCurrency: string;
  settlementAmount: number;
  exchangeRateSnapshotId?: string;
  channel?: PaymentChannel;
  providerAccessCode?: string;
  authorizationUrl?: string;
  callbackUrl?: string;
  checkoutSessionId?: string;
  summary?: PaymentSummary;
  nextAction?: {
    type: string;
    title: string;
    description: string;
    instructions: string[];
    ctaLabel?: string;
    expiresAt?: string;
  };
}

export interface PaymentVerifyResult {
  success: boolean;
  status: PaymentAttemptStatus;
  paymentAttemptId?: string;
  reference: string;
  amount: number;
  currency: string;
  settlementCurrency: string;
  settlementAmount: number;
  exchangeRateSnapshotId?: string;
  paidAt?: string;
  channel?: string;
  gatewayResponse?: string;
  failureMessage?: string;
  orderIds?: string[];
  customOrderIds?: string[];
  checkoutSessionId?: string;
  summary?: PaymentSummary;
}

export interface PaymentAttemptSummary {
  paymentAttemptId: string;
  reference: string;
  subjectType: 'STANDARD_ORDER' | 'CUSTOM_ORDER' | 'UNIFIED_CHECKOUT';
  customOrderId?: string;
  customOrderIds?: string[];
  checkoutIntentId?: string;
  checkoutSessionId?: string;
  gateway: string;
  providerMode: 'mock' | 'live';
  paymentMethod: PaymentMethodType;
  status: PaymentAttemptStatus;
  currency: string;
  settlementCurrency: string;
  settlementAmount: number;
  exchangeRateSnapshotId?: string;
  channel?: PaymentChannel;
  providerAccessCode?: string;
  authorizationUrl?: string;
  callbackUrl?: string;
  paymentData?: Record<string, unknown>;
  nextAction?: PaymentInitResult['nextAction'];
  canRetry: boolean;
  canSimulate: boolean;
  orderIds: string[];
  summary: PaymentSummary;
}

function extract<T>(payload: unknown): T {
  const source = payload as { data?: unknown };
  if (source?.data && typeof source.data === 'object' && 'data' in (source.data as Record<string, unknown>)) {
    return (source.data as { data: T }).data;
  }
  return (source?.data ?? payload) as T;
}

export function createMobileCheckoutIdempotencyKey() {
  return `mob_checkout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const paymentApi = {
  async initializeUnified(
    request: InitializeUnifiedCheckoutRequest,
  ): Promise<PaymentInitResult> {
    const idempotencyKey =
      request.idempotencyKey ?? createMobileCheckoutIdempotencyKey();
    const response = await apiClient.post(
      '/payment/initialize-unified',
      { ...request, idempotencyKey },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return extract<PaymentInitResult>(response);
  },

  async getAttempt(reference: string): Promise<PaymentAttemptSummary> {
    const response = await apiClient.get(
      `/payment/attempts/${encodeURIComponent(reference)}`,
    );
    return extract<PaymentAttemptSummary>(response);
  },

  async verifyWithStatus(
    reference: string,
    gateway: string,
    statusHint?: string,
  ): Promise<PaymentVerifyResult> {
    const response = await apiClient.post('/payment/verify', {
      reference,
      gateway,
      statusHint,
    });
    return extract<PaymentVerifyResult>(response);
  },
};

export default paymentApi;
