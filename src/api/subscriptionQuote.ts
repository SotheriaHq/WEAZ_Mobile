export type SubscriptionQuoteClock = {
  quoteId: string;
  expiresAt: string;
  serverNow: string;
  validUntilMonotonicMs: number;
  brandId: string;
};
type WireClock = Pick<SubscriptionQuoteClock, 'quoteId' | 'expiresAt' | 'serverNow'>;
const expired = () => new Error('This price quote expired. Review a fresh price before paying.');

/** Server timestamps plus elapsed request time; a wrong device clock cannot extend the offer. */
export function timeSubscriptionQuote<T extends WireClock>(quote: T, brandId: string, requestedAt: number): T & SubscriptionQuoteClock {
  if (!quote || typeof quote !== 'object') throw expired();
  const lifetime = Date.parse(quote.expiresAt) - Date.parse(quote.serverNow);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quote.quoteId ?? '') ||
    !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 300_000 || !Number.isFinite(requestedAt)) throw expired();
  return { ...quote, brandId, validUntilMonotonicMs: requestedAt + lifetime };
}
export function subscriptionQuoteRemainingMs(quote: SubscriptionQuoteClock | null): number {
  if (!quote || !Number.isFinite(quote.validUntilMonotonicMs)) return 0;
  return Math.max(0, quote.validUntilMonotonicMs - performance.now());
}
export function assertSubscriptionQuoteFresh(quote: SubscriptionQuoteClock, brandId: string): void {
  if (!quote?.quoteId || quote.brandId !== brandId || subscriptionQuoteRemainingMs(quote) <= 0) throw expired();
}
