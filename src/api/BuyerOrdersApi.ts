import { apiClient } from './httpClient';
import { markOrdersChanged } from '@/src/features/orders/orderRevision';
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

export type OrderScheduleState =
  | 'NOT_STARTED'
  | 'ON_TRACK'
  | 'DUE_SOON'
  | 'OVERDUE'
  | 'DELIVERED'
  | 'CLOSED';

/**
 * When an order is due, resolved by the API.
 *
 * The brand's production and delivery lead times are snapshotted on every
 * custom order at the moment it is placed, so "is this late?" is answerable
 * without opening it — which is the whole point: a shopper should not have to
 * tap into three orders to discover one of them has slipped.
 *
 * `estimated` is true when the dates were derived from those lead times rather
 * than from a promise recorded on the order, and the clients say so rather than
 * presenting a derived date as a commitment.
 */
export interface BuyerOrderSchedule {
  expectedProductionAt: string | null;
  expectedDeliveryAt: string | null;
  /** Whether the date the countdown measures against was derived. */
  estimated: boolean;
  productionEstimated: boolean;
  deliveryEstimated: boolean;
  state: OrderScheduleState;
  daysRemaining: number | null;
  daysOverdue: number;
  extensionDaysGranted: number;
}

const EMPTY_SCHEDULE: BuyerOrderSchedule = {
  expectedProductionAt: null,
  expectedDeliveryAt: null,
  estimated: false,
  productionEstimated: false,
  deliveryEstimated: false,
  state: 'NOT_STARTED',
  daysRemaining: null,
  daysOverdue: 0,
  extensionDaysGranted: 0,
};

const SCHEDULE_STATES: ReadonlySet<string> = new Set([
  'NOT_STARTED',
  'ON_TRACK',
  'DUE_SOON',
  'OVERDUE',
  'DELIVERED',
  'CLOSED',
]);

function normalizeSchedule(value: unknown): BuyerOrderSchedule {
  if (!value || typeof value !== 'object') return EMPTY_SCHEDULE;
  const source = value as RecordLike;
  const state = typeof source.state === 'string' ? source.state : '';
  return {
    expectedProductionAt: optionalString(source.expectedProductionAt),
    expectedDeliveryAt: optionalString(source.expectedDeliveryAt),
    estimated: source.estimated === true,
    productionEstimated: source.productionEstimated === true,
    deliveryEstimated: source.deliveryEstimated === true,
    state: (SCHEDULE_STATES.has(state) ? state : 'NOT_STARTED') as OrderScheduleState,
    daysRemaining:
      source.daysRemaining == null ? null : asNumber(source.daysRemaining),
    daysOverdue: asNumber(source.daysOverdue, 0),
    extensionDaysGranted: asNumber(source.extensionDaysGranted, 0),
  };
}

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
  /** When this order is due. Null-ish for standard orders, which carry no
   *  production lead time of their own. */
  schedule: BuyerOrderSchedule;
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

/**
 * A brand's request for more time, and the shopper's answer to it.
 *
 * `appliedExtraDays` is what was actually granted, which differs from
 * `requestedExtraDays` when a counter was accepted — the budget is audited on the
 * applied figure, never the asked one.
 */
export interface BuyerExtensionRequest {
  id: string;
  targetType: string;
  requestedExtraDays: number;
  reason: string;
  buyerResponseStatus: string;
  buyerCounterDays: number | null;
  buyerNote: string | null;
  brandNote: string | null;
  /** Past this, the request expires unanswered and an admin takes it on. */
  respondByAt: string | null;
  appliedExtraDays: number | null;
  sequence: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * The extension budget, as the server resolved it. Policy is two approved
 * extensions of at most three days each, six days total, and none at all on an
 * order the shopper paid a rush fee on.
 */
export interface BuyerExtensionPolicy {
  maxDaysPerRequest: number;
  maxApprovedExtensions: number;
  maxTotalDays: number;
  totalExtensionDaysGranted: number;
  approvedExtensionCount: number;
  rushBlocked: boolean;
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
  promisedProductionAt: string | null;
  /** The promise before any extension moved it. Null means none was granted. */
  originalPromisedDeliveryAt: string | null;
  extensionRequests: BuyerExtensionRequest[];
  extensionPolicy: BuyerExtensionPolicy;
  /** Open disputes on the order, so the screen can offer the way out of one. */
  disputes: Array<{
    id: string;
    status: string;
    reasonType: string;
    openedAt: string | null;
  }>;
  /**
   * Whether this order can be escalated for lateness. Decided by the API — the
   * grace period and the precedence between the two promises are policy, and a
   * client that recomputes them eventually disagrees with the endpoint and
   * offers a button that fails.
   */
  delayDispute: {
    eligible: boolean;
    basis: 'PRODUCTION' | 'DELIVERY' | null;
    availableAt: string | null;
    reason: string;
  };
  /** Same resolver as the list row, so a row and this screen cannot disagree. */
  schedule: BuyerOrderSchedule;
  buyerAdminNoticeAt: string | null;
  hasUnreadBuyerAdminNotice: boolean;
  adminInterventionAt: string | null;
  adminInterventionReason: string | null;
  adminInterventionResolvedAt: string | null;
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
    payload: RecordLike;
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
    brandName: order.brand?.name?.trim() || 'WIEZ store',
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
    // A standard order ships from stock against the store's dispatch SLA, not
    // against a per-order production commitment, so there is no countdown to
    // derive. The row falls back to its status, which is what it has always
    // shown.
    schedule: EMPTY_SCHEDULE,
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
    brandName: asString(brand.name, 'WIEZ store'),
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

/**
 * The custom-order LIST and DETAIL payloads describe their source differently.
 *
 * `mapDetail` nests it under `source: { type, id, title, primaryMediaUrl }`.
 * `mapListItem` — the one `GET /custom-orders` returns — flattens the same
 * facts to `sourceType` / `sourceId` / `sourceTitle` / `sourcePrimaryMediaUrl`.
 *
 * This normaliser read only the nested shape, so for every row in the list
 * `source` was `{}` and each of its three reads fell through to a default:
 * every custom order was titled "Custom order", carried no cover photo (hence
 * the placeholder emoji in the orders list), and was labelled a design order
 * whether or not it was one. Read both shapes.
 */
function readCustomSource(item: RecordLike) {
  const nested = asRecord(item.source);
  return {
    type: optionalString(nested.type) ?? optionalString(item.sourceType),
    id: optionalString(nested.id) ?? optionalString(item.sourceId),
    title: optionalString(nested.title) ?? optionalString(item.sourceTitle),
    primaryMediaUrl:
      optionalString(nested.primaryMediaUrl) ?? optionalString(item.sourcePrimaryMediaUrl),
    brandName: optionalString(nested.brandName) ?? optionalString(item.sourceBrandName),
  };
}

function normalizeCustomSummary(item: RecordLike): BuyerOrderSummary | null {
  const id = optionalString(item.id);
  if (!id) return null;

  const source = readCustomSource(item);
  const brand = asRecord(item.brand);
  const summary = asRecord(item.buyerPriceSummary);

  return {
    id,
    kind: 'CUSTOM',
    title: source.title ?? 'Custom order',
    brandName: optionalString(brand.name) ?? source.brandName ?? 'WIEZ store',
    status: asString(item.status, 'UNKNOWN'),
    paymentStatus: asString(item.paymentStatus, 'PENDING'),
    amount: asNumber(summary.grandTotal ?? 0),
    currency: asString(summary.currency, 'NGN'),
    createdAt: asString(item.createdAt),
    updatedAt: optionalString(item.updatedAt),
    // A custom order has no line items — this is how many measurements were
    // taken, which is why the row labels it as measurements and not as items.
    itemCount: asNumber(item.measurementCount, 0),
    thumbnail: source.primaryMediaUrl,
    progressLabel: optionalString(item.currentProgressStage),
    sourceLabel: source.type === 'PRODUCT' ? 'Custom product order' : 'Custom design order',
    canConfirmDelivery: isDeliveryConfirmationPending(asString(item.status, '')),
    schedule: normalizeSchedule(item.schedule),
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
          // Admin notices carry their text in the payload, and the shopper's
          // notice panel is the only place that text is ever shown.
          payload: asRecord(sourceEntry.payloadJson),
        };
      })
    : [];

  // Extension requests were not mapped at all, which is why a shopper who
  // tapped "your maker needs more time" arrived at a screen with nothing on it.
  const extensionRequests = Array.isArray(item.extensionRequests)
    ? item.extensionRequests.map((entry) => {
        const request = asRecord(entry);
        return {
          id: asString(request.id),
          targetType: asString(request.targetType, 'PRODUCTION'),
          requestedExtraDays: asNumber(request.requestedExtraDays ?? 0),
          reason: asString(request.reason),
          buyerResponseStatus: asString(request.buyerResponseStatus, 'OPEN'),
          buyerCounterDays:
            request.buyerCounterDays != null ? asNumber(request.buyerCounterDays) : null,
          buyerNote: optionalString(request.buyerNote),
          brandNote: optionalString(request.brandNote),
          respondByAt: optionalString(request.respondByAt),
          appliedExtraDays:
            request.appliedExtraDays != null ? asNumber(request.appliedExtraDays) : null,
          sequence: request.sequence != null ? asNumber(request.sequence) : null,
          resolvedAt: optionalString(request.resolvedAt),
          createdAt: asString(request.createdAt),
        };
      })
    : [];

  const policy = asRecord(item.extensionPolicy);
  const delayDispute = asRecord(item.delayDispute);

  return {
    kind: 'CUSTOM',
    id: asString(item.id),
    title: asString(source.title, 'Custom order'),
    brandName: asString(brand.name || source.brandName, 'WIEZ store'),
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
    promisedProductionAt: optionalString(item.promisedProductionAt),
    // The promise as it stood before any extension moved it. Null means none was
    // ever granted, in which case the current promise IS the original.
    originalPromisedDeliveryAt: optionalString(item.originalPromisedDeliveryAt),
    extensionRequests,
    extensionPolicy: {
      maxDaysPerRequest: asNumber(policy.maxDaysPerRequest ?? 3),
      maxApprovedExtensions: asNumber(policy.maxApprovedExtensions ?? 2),
      maxTotalDays: asNumber(policy.maxTotalDays ?? 6),
      totalExtensionDaysGranted: asNumber(policy.totalExtensionDaysGranted ?? 0),
      approvedExtensionCount: asNumber(policy.approvedExtensionCount ?? 0),
      rushBlocked: policy.rushBlocked === true,
    },
    disputes: Array.isArray(item.disputes)
      ? item.disputes.map((entry) => {
          const dispute = asRecord(entry);
          return {
            id: asString(dispute.id),
            status: asString(dispute.status, 'OPEN'),
            reasonType: asString(dispute.reasonType),
            openedAt: optionalString(dispute.openedAt),
          };
        })
      : [],
    delayDispute: {
      eligible: delayDispute.eligible === true,
      basis:
        delayDispute.basis === 'DELIVERY' || delayDispute.basis === 'PRODUCTION'
          ? delayDispute.basis
          : null,
      availableAt: optionalString(delayDispute.availableAt),
      reason: asString(delayDispute.reason, 'NOT_LATE_YET'),
    },
    schedule: normalizeSchedule(item.schedule),
    buyerAdminNoticeAt: optionalString(item.buyerAdminNoticeAt),
    hasUnreadBuyerAdminNotice: item.hasUnreadBuyerAdminNotice === true,
    adminInterventionAt: optionalString(item.adminInterventionAt),
    adminInterventionReason: optionalString(item.adminInterventionReason),
    adminInterventionResolvedAt: optionalString(item.adminInterventionResolvedAt),
    progressEvents,
    timelineEvents,
    raw: item,
  };
}

/**
 * `/custom-orders` is buyer-only — the API answers 400 "Endpoint requires user
 * type REGULAR" for BRAND accounts. Two problems followed from calling it
 * blindly: the `Promise.all` below rejected, so a brand viewing Orders lost the
 * standard orders that HAD loaded; and the request was re-issued on every
 * refresh, once per screen focus, purely to fail again. Remember the refusal
 * and stop asking for the rest of the session.
 */
let customOrdersUnavailable = false;

async function listCustomOrders(page = 1, limit = 50): Promise<BuyerOrderSummary[]> {
  if (customOrdersUnavailable) return [];

  try {
    const response = await apiClient.get('/custom-orders', {
      params: { page, limit },
    });
    const items = unwrapCollection<unknown>(response.data);

    return items
      .map((entry) => normalizeCustomSummary(asRecord(entry)))
      .filter((entry): entry is BuyerOrderSummary => Boolean(entry));
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    // 400/403 here means "this account type has no custom orders", not a
    // transient failure — anything else stays a real error worth surfacing.
    if (status === 400 || status === 403) {
      customOrdersUnavailable = true;
      return [];
    }
    throw error;
  }
}

/** Clear the cached "not a buyer" verdict — call on sign-out / account switch. */
export function resetCustomOrdersAvailability() {
  customOrdersUnavailable = false;
}

async function listStandardOrders(page = 1, limit = 50): Promise<BuyerOrderSummary[]> {
  const response = await apiClient.get('/store/orders', {
    params: { page, limit },
  });

  const items = unwrapCollection<StandardOrderLike>(response.data);
  return items.map((order) => normalizeStandardSummary(order));
}

export const BuyerOrdersApi = {
  async list(options?: { limit?: number }): Promise<BuyerOrderSummary[]> {
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 50));
    const [standardOrders, customOrders] = await Promise.all([
      listStandardOrders(1, limit),
      listCustomOrders(1, limit),
    ]);

    const merged: BuyerOrderSummary[] = [
      ...customOrders,
      ...standardOrders,
    ];

    merged.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return merged.slice(0, limit);
  },

  async getById(
    orderId: string,
    options?: { prefer?: 'STANDARD' | 'CUSTOM' },
  ): Promise<BuyerOrderDetail> {
    // Prefer the known kind to avoid a guaranteed 404 RTT on custom-order taps.
    const prefer = options?.prefer ?? 'STANDARD';
    const tryCustom = async () => {
      const response = await apiClient.get(`/custom-orders/${orderId}`);
      return normalizeCustomDetail(response.data);
    };
    const tryStandard = async () => {
      const response = await apiClient.get(`/store/orders/${orderId}`);
      return normalizeStandardDetail(response.data);
    };

    if (prefer === 'CUSTOM') {
      try {
        return await tryCustom();
      } catch (error) {
        if (getHttpStatus(error) !== 404) {
          throw error;
        }
        return tryStandard();
      }
    }

    try {
      return await tryStandard();
    } catch (error) {
      if (getHttpStatus(error) !== 404) {
        throw error;
      }
      return tryCustom();
    }
  },

  /**
   * Accept or decline a request for more time.
   *
   * The note is optional on both answers: requiring a reason to say no is a way
   * of discouraging no, and the shopper already has the harder job here. Counters
   * are deliberately not offered on mobile — two answers is the whole decision,
   * and a third option on a phone turns it into a form.
   */
  async respondToExtension(
    orderId: string,
    requestId: string,
    payload: { response: 'ACCEPTED' | 'REJECTED'; note?: string },
  ): Promise<BuyerCustomOrderDetail> {
    const response = await apiClient.post(
      `/custom-orders/${orderId}/extension-requests/${requestId}/respond`,
      payload,
    );
    markOrdersChanged();
    return normalizeCustomDetail(response.data);
  },

  /**
   * Report that a bespoke order is late.
   *
   * No photographs: there is nothing to photograph, which is exactly why this
   * was impossible before — the evidence validator demanded one and a shopper
   * with an overdue order could not supply it.
   */
  async reportDelay(
    orderId: string,
    payload: { basis: 'PRODUCTION' | 'DELIVERY' | null; description: string },
  ): Promise<BuyerCustomOrderDetail> {
    const response = await apiClient.post(`/custom-orders/${orderId}/report-issue`, {
      issueType: payload.basis === 'DELIVERY' ? 'NON_DELIVERY' : 'UNREASONABLE_DELAY',
      description: payload.description,
      evidenceJson: {},
    });
    markOrdersChanged();
    return normalizeCustomDetail(response.data);
  },

  /** "It arrived — I'll take it late." The shopper ends their own report. */
  async closeDelayDispute(
    orderId: string,
    disputeId: string,
    note?: string,
  ): Promise<BuyerCustomOrderDetail> {
    const response = await apiClient.post(
      `/custom-orders/${orderId}/disputes/${disputeId}/close`,
      { note },
    );
    markOrdersChanged();
    return normalizeCustomDetail(response.data);
  },

  /** Mark WIEZ's notices on this order as read. Read-only channel: no replies. */
  async ackAdminNotices(orderId: string): Promise<BuyerCustomOrderDetail> {
    const response = await apiClient.post(`/custom-orders/${orderId}/admin-notices/ack`);
    markOrdersChanged();
    return normalizeCustomDetail(response.data);
  },

  async confirmDelivery(order: BuyerOrderDetail, note?: string): Promise<BuyerOrderDetail> {
    if (order.kind === 'STANDARD') {
      const response = await apiClient.post(`/store/orders/${order.id}/confirm-delivery`, { note });
      markOrdersChanged();
      return normalizeStandardDetail(response.data);
    }

    const response = await apiClient.post(`/custom-orders/${order.id}/confirm-delivery`, { note });
    markOrdersChanged();
    return normalizeCustomDetail(response.data);
  },
};
