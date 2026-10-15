/**
 * "Something about an order changed since you last looked."
 *
 * Same problem as `clipRevision`, and the same shape of answer. The profile's
 * Orders tab is `state.orders`, filled by that screen's own `load()` — not a
 * react-query list — so invalidating the orders query keys never reaches it,
 * and `load()` coalesces anything inside 15 seconds. Accept a request for more
 * time, route back to the profile, and the row still shows the old countdown.
 *
 * That matters more here than it does for clips, because the number on the row
 * is a DEADLINE. A stale clip count is untidy; a stale "2 days left" next to an
 * order whose date just moved is wrong about the one fact the row exists to
 * state.
 *
 * `BuyerOrdersApi` publishes the server-resolved row after every write. Mounted
 * lists replace that row immediately; the revision remains a focus-time safety
 * net for a list that was not mounted at the time. A declined extension returns
 * the unchanged schedule, while an approved one arrives with the shifted date.
 */

import type { BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';

let revision = 0;
const listeners = new Set<(change: OrderChange) => void>();

/** A server-resolved replacement for a row that is already visible. */
export type OrderChange = {
  summary?: BuyerOrderSummary;
};

/** Called by `BuyerOrdersApi` after any order-mutating request. */
export const markOrdersChanged = (change: OrderChange = {}): void => {
  revision += 1;
  listeners.forEach((listener) => listener(change));
};

/** Read by a screen that lists orders, against its own last-seen value. */
export const getOrderRevision = (): number => revision;

/**
 * Apply a single server-confirmed order to a list without waiting for focus,
 * navigation, or an eventually-consistent list refetch.
 */
export function applyOrderSummaryUpdate(
  orders: BuyerOrderSummary[],
  summary: BuyerOrderSummary,
): BuyerOrderSummary[] {
  return orders.map((order) => (order.id === summary.id ? summary : order));
}

/** Listen for a confirmed order mutation while a list screen is mounted. */
export function subscribeOrderChanges(listener: (change: OrderChange) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
