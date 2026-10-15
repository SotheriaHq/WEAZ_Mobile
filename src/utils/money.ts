/**
 * One money formatter for the whole app. WIEZ trades in Naira.
 *
 * There were fourteen separate `Intl.NumberFormat` call sites, and they
 * disagreed in two ways that both reached users:
 *
 * 1. `CollectionCard` formatted every catalog price as **USD** — `$40,000` on a
 *    Nigerian storefront, on the card a shopper sees before anything else.
 *
 * 2. The rest asked for `style: 'currency'` with NGN and got "NGN 40,000"
 *    rather than "₦40,000". That is not a bug in the call — it is Hermes.
 *    React Native ships a cut-down ICU, and when the runtime has no symbol data
 *    for a currency `Intl` falls back to printing the ISO code. So the same
 *    build renders "₦" on one device and "NGN" on another, which is exactly the
 *    kind of thing that never reproduces for whoever is asked to fix it.
 *
 * Formatting the NUMBER with `toLocaleString` (grouping is reliable everywhere)
 * and prepending the symbol ourselves removes the runtime from the decision.
 * The map is the single place to add a currency if WIEZ ever takes a second
 * one; unknown codes degrade to "CODE 1,234", which is honest rather than
 * wrong.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

/** WIEZ is Naira-first: every unset or unknown amount is Naira. */
export const DEFAULT_CURRENCY = 'NGN';

export function currencySymbol(currency: string = DEFAULT_CURRENCY): string {
  const code = String(currency || DEFAULT_CURRENCY).toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

export type FormatMoneyOptions = {
  /** Show kobo/cents. Off by default — WIEZ prices are whole Naira. */
  withDecimals?: boolean;
};

/**
 * `40000` → `₦40,000`. Returns null for anything that is not a real amount, so
 * callers can choose their own "price on request" copy rather than printing
 * "₦0" or "₦NaN".
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  options?: FormatMoneyOptions,
): string | null {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const fractionDigits = options?.withDecimals ? 2 : 0;
  const rounded = options?.withDecimals ? value : Math.round(value);

  const formatted = rounded.toLocaleString('en-NG', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return `${currencySymbol(currency)}${formatted}`;
}

/** Same as `formatMoney` but never null — for slots that must render something. */
export function formatMoneyOr(
  amount: number | string | null | undefined,
  fallback: string,
  currency: string = DEFAULT_CURRENCY,
  options?: FormatMoneyOptions,
): string {
  return formatMoney(amount, currency, options) ?? fallback;
}

/**
 * `₦15,000 – ₦45,000`, `From ₦15,000`, `Up to ₦45,000`, or null.
 *
 * The symbol repeats on both ends on purpose: "15,000 – ₦45,000" reads as a
 * single number to anyone scanning, and a range is the common shape for a
 * design whose final price depends on the commission.
 */
export function formatMoneyRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string | null {
  const low = formatMoney(min, currency);
  const high = formatMoney(max, currency);

  if (low && high) return low === high ? low : `${low} – ${high}`;
  if (low) return `From ${low}`;
  if (high) return `Up to ${high}`;
  return null;
}
