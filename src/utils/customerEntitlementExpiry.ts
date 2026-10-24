/** Server-relative duration tolerates a shopper's incorrect device clock. */
export function customerEntitlementRemainingMs(
  timing: { serverNow: string; entitlementExpiresAt: string | null },
  receivedAt: number,
  now = Date.now(),
): number | null {
  if (!timing.entitlementExpiresAt) return null;
  const end = Date.parse(timing.entitlementExpiresAt);
  const server = Date.parse(timing.serverNow);
  if (!Number.isFinite(end) || !Number.isFinite(server) || !Number.isFinite(receivedAt) || !Number.isFinite(now)) return null;
  return Math.max(0, end - server - Math.max(0, now - receivedAt));
}
