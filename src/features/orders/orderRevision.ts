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
 * `BuyerOrdersApi` bumps it after any write that can move a date or a status —
 * one chokepoint, so no screen has to remember — and the profile compares it on
 * focus and reloads only when it actually moved. A declined extension changes
 * nothing about the schedule, but it does change the order's state, so it bumps
 * too: the cost of an unnecessary reload is one request, and the cost of a
 * missed one is a shopper looking at a number that is not true.
 */

let revision = 0;

/** Called by `BuyerOrdersApi` after any order-mutating request. */
export const markOrdersChanged = (): void => {
  revision += 1;
};

/** Read by a screen that lists orders, against its own last-seen value. */
export const getOrderRevision = (): number => revision;
