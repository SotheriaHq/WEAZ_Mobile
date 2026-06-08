import { apiClient } from './httpClient';
import { type Order } from './ProfileApi';

type RecordLike = Record<string, unknown>;
type StandardOrderLike = Order & {
  brand?: { name?: string; logo?: string | null } | null;
  orderCode?: string | null;
  code?: string | null;
  customerName?: string | null;
  updatedAt?: string;
  paymentStatus?: string;
  paidAt?: string | null;
  deliveredAt?: string | null;
  buyerConfirmedDeliveryAt?: string | null;
  paymentReference?: string | null;
  paymentMethod?: string | null;
  financeBreakdown?: RecordLike | null;
  buyerReceipt?: RecordLike | null;
  shippingAddress?: RecordLike | null;
  total?: number;
  orderItems?: unknown[];
  items?: unknown[];
};

export type BuyerOrderKind = 'STANDARD' | 'CUSTOM';

export interface BuyerOrderSummary {
  id: string;
  kind: BuyerOrderKind;
  title: string;
  brandName: string;
  status: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string | null;
  itemCount: number;
  thumbnail: string | null;
  progressLabel: string | null;
  sourceLabel: string;
  canConfirmDelivery: boolean;
}

export interface BuyerOrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  thumbnail: string | null;
  selectedSize: string | null;
  selectedColor: string | null;
  sizeRecommendationSnapshot: RecordLike | null;
}

export interface BuyerStandardOrderDetail {
  kind: 'STANDARD';
  id: string;
  title: string;
  brandName: string;
  status: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  orderCode: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  buyerConfirmedDeliveryAt: string | null;
  paymentReference: string | null;
  paymentMethod: string | null;
  itemCount: number;
  items: BuyerOrderItem[];
  financeBreakdown: RecordLike | null;
  buyerReceipt: RecordLike | null;
  shippingAddress: RecordLike | null;
  raw: Order;
}

export interface BuyerCustomOrderDetail {
  kind: 'CUSTOM';
  id: string;
  title: string;
  brandName: string;
  status: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  sourceType: string;
  sourceId: string;
  sourcePrimaryMediaUrl: string | null;
  currentProgressStage: string | null;
  paymentReference: string | null;
  buyerPriceSummary: {
    grandTotal: number;
    subtotal: number | null;
    shippingFee: number | null;
    rushFee: number | null;
    fabricCharge: number | null;
    currency: string;
  };
  measurementCount: number;
  measurementSnapshot: RecordLike;
  shippingAddress: RecordLike | null;
  contactInfo: RecordLike | null;
  promisedDeliveryAt: string | null;
  progressEvents: Array<{
    id: string;
    stage: string;
    note: string | null;
    changedAt: string;
  }>;
  timelineEvents: Array<{
    id: string;
    actorType: string;
    eventType: string;
    createdAt: string;
  }>;
  raw: RecordLike;
}

export type BuyerOrderDetail = BuyerStandardOrderDetail | BuyerCustomOrderDetail;

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as RecordLike)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function unwrapCollection<T>(payload: unknown): T[] {
  const unwrapped = unwrap<unknown>(payload);
  if (Array.isArray(unwrapped)) {
    return unwrapped as T[];
  }

  if (unwrapped && typeof unwrapped === 'object') {
    const source = unwrapped as { items?: T[]; data?: T[] };
    if (Array.isArray(source.items)) {
      return source.items;
    }
    if (Array.isArray(source.data)) {
      return source.data;
    }
  }

  return [];
}

function asRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' ? (value as RecordLike) : {};
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asString(value: unknown, fallback = ''): string {
  return optionalString(value) ?? fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function getHttpStatus(error: unknown): number | null {
  return (error as { response?: { status?: number } })?.response?.status ?? null;
}

function isDeliveryConfirmationPending(status: string): boolean {
  const upper = status.toUpperCase();
  return upper.includes('DELIVERED_PENDING_BUYER_CONFIRMATION') || upper.includes('READY_FOR_DISPATCH') || upper === 'IN_TRANSIT';
}

function normalizeStandardSummary(order: StandardOrderLike): BuyerOrderSummary {
  const firstItem = order.items?.[0];
  const breakdown = asRecord(order.financeBreakdown);
  return {
    id: order.id,
    kind: 'STANDARD',
    title: firstItem?.productName || order.orderCode || order.code || 'Order',
    brandName: order.brand?.name?.trim() || 'WEAZ store',
    status: order.status || 'UNKNOWN',
    paymentStatus: order.paymentStatus || 'PENDING',
    amount: asNumber(order.totalAmount ?? order.total ?? breakdown.grossAmount ?? 0),
    currency: order.currency || 'NGN',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt ?? null,
    itemCount: order.items?.length ?? 0,
    thumbnail: firstItem?.thumbnail ?? order.brand?.logo ?? null,
    progressLabel: order.deliveredAt
      ? 'Delivered'
      : order.buyerConfirmedDeliveryAt
        ? 'Completed'
        : order.paidAt
          ? 'Processing'
          : 'Placed',
    sourceLabel: 'Standard order',
    canConfirmDelivery: isDeliveryConfirmationPending(order.status),
  };
}

function normalizeStandardDetail(raw: unknown): BuyerStandardOrderDetail {
  const order = asRecord(unwrap<unknown>(raw));
  const itemSource = Array.isArray(order.orderItems)
    ? order.orderItems
    : Array.isArray(order.items)
      ? order.items
      : [];

  const items = itemSource.map((entry) => {
    const source = asRecord(entry);
    const nestedProduct = asRecord(source.product);
    return {
      id: asString(source.id),
      productName: asString(source.productName || source.name || nestedProduct.name, 'Item'),
      quantity: asNumber(source.quantity, 1),
      price: asNumber(source.price ?? source.unitPrice),
      thumbnail: optionalString(source.thumbnail || nestedProduct.thumbnail || nestedProduct.coverImage || source.image),
      selectedSize: optionalString(source.selectedSize),
      selectedColor: optionalString(source.selectedColor),
      sizeRecommendationSnapshot:
        source.sizeRecommendationSnapshot && typeof source.sizeRecommendationSnapshot === 'object'
          ? asRecord(source.sizeRecommendationSnapshot)
          : source.orderSizeRecommendationSnapshot && typeof source.orderSizeRecommendationSnapshot === 'object'
            ? asRecord(source.orderSizeRecommendationSnapshot)
            : null,
    };
  });

  const brand = asRecord(order.brand);
  const breakdown = asRecord(order.financeBreakdown);

  return {
    kind: 'STANDARD',
    id: asString(order.id),
    title: asString(order.orderCode || order.code || items[0]?.productName || 'Order', 'Order'),
    brandName: asString(brand.name, 'WEAZ store'),
    status: asString(order.status, 'UNKNOWN'),
    paymentStatus: asString(order.paymentStatus ?? breakdown.paymentStatus, 'PENDING'),
    amount: asNumber(order.totalAmount ?? order.total ?? breakdown.grossAmount ?? 0),
    currency: asString(order.currency, 'NGN'),
    createdAt: asString(order.createdAt),
    updatedAt: asString(order.updatedAt, asString(order.createdAt)),
    orderCode: optionalString(order.orderCode ?? order.code),
    paidAt: optionalString(order.paidAt),
    deliveredAt: optionalString(order.deliveredAt),
    buyerConfirmedDeliveryAt: optionalString(order.buyerConfirmedDeliveryAt),
    paymentReference: optionalString(order.paymentReference),
    paymentMethod: optionalString(order.paymentMethod),
    itemCount: items.length,
    items,
    financeBreakdown: order.financeBreakdown && typeof order.financeBreakdown === 'object' ? asRecord(order.financeBreakdown) : null,
    buyerReceipt: order.buyerReceipt && typeof order.buyerReceipt === 'object' ? asRecord(order.buyerReceipt) : null,
    shippingAddress: order.shippingAddress && typeof order.shippingAddress === 'object' ? asRecord(order.shippingAddress) : null,
    raw: order as unknown as StandardOrderLike,
  };
}

function normalizeCustomSummary(item: RecordLike): BuyerOrderSummary | null {
  const id = optionalString(item.id);
  if (!id) return null;

  const source = asRecord(item.source);
  const brand = asRecord(item.brand);
  const summary = asRecord(item.buyerPriceSummary);

  return {
    id,
    kind: 'CUSTOM',
    title: asString(source.title, 'Custom order'),
    brandName: asString(brand.name, 'WEAZ store'),
    status: asString(item.status, 'UNKNOWN'),
    paymentStatus: asString(item.paymentStatus, 'PENDING'),
    amount: asNumber(summary.grandTotal ?? 0),
    currency: asString(summary.currency, 'NGN'),
    createdAt: asString(item.createdAt),
    updatedAt: optionalString(item.updatedAt),
    itemCount: asNumber(item.measurementCount, 0),
    thumbnail: optionalString(source.primaryMediaUrl),
    progressLabel: optionalString(item.currentProgressStage),
    sourceLabel: source.type === 'PRODUCT' ? 'Custom product order' : 'Custom design order',
    canConfirmDelivery: isDeliveryConfirmationPending(asString(item.status, '')),
  };
}

function normalizeCustomDetail(raw: unknown): BuyerCustomOrderDetail {
  const item = asRecord(unwrap<unknown>(raw));
  const source = asRecord(item.source);
  const summary = asRecord(item.buyerPriceSummary);
  const brand = asRecord(item.brand);

  const progressEvents = Array.isArray(item.progressEvents)
    ? item.progressEvents.map((entry) => {
        const sourceEntry = asRecord(entry);
        return {
          id: asString(sourceEntry.id),
          stage: asString(sourceEntry.stage),
          note: optionalString(sourceEntry.note),
          changedAt: asString(sourceEntry.changedAt),
        };
      })
    : [];

  const timelineEvents = Array.isArray(item.timelineEvents)
    ? item.timelineEvents.map((entry) => {
        const sourceEntry = asRecord(entry);
        return {
          id: asString(sourceEntry.id),
          actorType: asString(sourceEntry.actorType),
          eventType: asString(sourceEntry.eventType),
          createdAt: asString(sourceEntry.createdAt),
        };
      })
    : [];

  return {
    kind: 'CUSTOM',
    id: asString(item.id),
    title: asString(source.title, 'Custom order'),
    brandName: asString(brand.name || source.brandName, 'WEAZ store'),
    status: asString(item.status, 'UNKNOWN'),
    paymentStatus: asString(item.paymentStatus, 'PENDING'),
    amount: asNumber(summary.grandTotal ?? 0),
    currency: asString(summary.currency, 'NGN'),
    createdAt: asString(item.createdAt),
    updatedAt: asString(item.updatedAt, asString(item.createdAt)),
    sourceType: asString(source.type),
    sourceId: asString(source.id),
    sourcePrimaryMediaUrl: optionalString(source.primaryMediaUrl),
    currentProgressStage: optionalString(item.currentProgressStage),
    paymentReference: optionalString(item.paymentReference),
    buyerPriceSummary: {
      grandTotal: asNumber(summary.grandTotal ?? 0),
      subtotal: summary.subtotal != null ? asNumber(summary.subtotal) : null,
      shippingFee: summary.shippingFee != null ? asNumber(summary.shippingFee) : null,
      rushFee: summary.rushFee != null ? asNumber(summary.rushFee) : null,
      fabricCharge: summary.fabricCharge != null ? asNumber(summary.fabricCharge) : null,
      currency: asString(summary.currency, 'NGN'),
    },
    measurementCount: Object.keys(asRecord(item.measurementSnapshot)).length,
    measurementSnapshot: asRecord(item.measurementSnapshot),
    shippingAddress: item.shippingAddress && typeof item.shippingAddress === 'object' ? asRecord(item.shippingAddress) : null,
    contactInfo: item.contactInfo && typeof item.contactInfo === 'object' ? asRecord(item.contactInfo) : null,
    promisedDeliveryAt: optionalString(item.promisedDeliveryAt),
    progressEvents,
    timelineEvents,
    raw: item,
  };
}

async function listCustomOrders(page = 1, limit = 50): Promise<BuyerOrderSummary[]> {
  const response = await apiClient.get('/custom-orders', {
    params: { page, limit },
  });
  const items = unwrapCollection<unknown>(response.data);

  return items
    .map((entry) => normalizeCustomSummary(asRecord(entry)))
    .filter((entry): entry is BuyerOrderSummary => Boolean(entry));
}

async function listStandardOrders(page = 1, limit = 50): Promise<BuyerOrderSummary[]> {
  const response = await apiClient.get('/store/orders', {
    params: { page, limit },
  });

  const items = unwrapCollection<StandardOrderLike>(response.data);
  return items.map((order) => normalizeStandardSummary(order));
}

export const BuyerOrdersApi = {
  async list(): Promise<BuyerOrderSummary[]> {
    const [standardOrders, customOrders] = await Promise.all([
      listStandardOrders(1, 50),
      listCustomOrders(1, 50),
    ]);

    const merged: BuyerOrderSummary[] = [
      ...customOrders,
      ...standardOrders,
    ];

    merged.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return merged;
  },

  async getById(orderId: string): Promise<BuyerOrderDetail> {
    try {
      const response = await apiClient.get(`/store/orders/${orderId}`);
      return normalizeStandardDetail(response.data);
    } catch (error) {
      if (getHttpStatus(error) !== 404) {
        throw error;
      }
    }

    const response = await apiClient.get(`/custom-orders/${orderId}`);
    return normalizeCustomDetail(response.data);
  },

  async confirmDelivery(order: BuyerOrderDetail, note?: string): Promise<BuyerOrderDetail> {
    if (order.kind === 'STANDARD') {
      const response = await apiClient.post(`/store/orders/${order.id}/confirm-delivery`, { note });
      return normalizeStandardDetail(response.data);
    }

    const response = await apiClient.post(`/custom-orders/${order.id}/confirm-delivery`, { note });
    return normalizeCustomDetail(response.data);
  },
};
