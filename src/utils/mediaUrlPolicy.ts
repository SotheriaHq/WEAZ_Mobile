const AUTH_QUERY_NAMES = new Set([
  'X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires',
  'X-Amz-Security-Token', 'X-Amz-SignedHeaders', 'X-Amz-Signature',
  'Signature', 'Key-Pair-Id', 'Policy', 'Expires', 'expires', 'expiresAt', 'ExpiresAt',
  'sig', 'exp', 'token',
]);

export const MEDIA_URL_REFRESH_SKEW_MS = 30_000;

// Parse query strings without URL.searchParams: native URL implementations vary.
function pairs(value: string): string[] {
  const start = value.indexOf('?');
  if (start < 0) return [];
  return value.slice(start + 1).split('#')[0].split('&').filter(Boolean);
}

function parameter(value: string, name: string): string | null {
  const found = pairs(value).find((pair) => pair.split('=', 1)[0] === name);
  if (!found) return null;
  if (!found.includes('=')) return ''; 
  try { return decodeURIComponent(found.slice(found.indexOf('=') + 1).replace(/\+/g, ' ')); }
  catch { return null; }
}

export function hasMediaUrlSignature(value?: string | null): boolean {
  return Boolean(value && ['X-Amz-Signature', 'Signature', 'Policy', 'sig', 'token'].some((name) => parameter(value, name)));
}

export function isStorageProviderUrl(value?: string | null): boolean {
  if (!value || !/^https?:\/\//i.test(value)) return false;
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1] ?? '';
  if (authority.includes('@')) return false;
  const hostname = authority.split(':')[0].toLowerCase();
  return /(?:^|\.)amazonaws\.com(?:\.cn)?$/.test(hostname)
    || /(?:^|\.)r2\.cloudflarestorage\.com$/.test(hostname)
    || /(?:^|\.)r2\.dev$/.test(hostname);
}

export function getMediaUrlExpiryMs(value?: string | null): number | null {
  if (!value) return null;
  const explicit = parameter(value, 'expiresAt') ?? parameter(value, 'ExpiresAt');
  if (explicit) {
    const timestamp = Date.parse(explicit);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const absolute = parameter(value, 'Expires') ?? parameter(value, 'expires') ?? parameter(value, 'exp');
  if (absolute && /^\d+$/.test(absolute)) {
    const timestamp = Number(absolute) * 1000;
    if (Number.isSafeInteger(timestamp)) return timestamp;
  }
  const amzDate = parameter(value, 'X-Amz-Date');
  const ttl = parameter(value, 'X-Amz-Expires');
  const match = amzDate && /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
  if (match && ttl && /^\d+$/.test(ttl)) {
    const [, year, month, day, hour, minute, second] = match;
    const issued = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
    const expires = issued + Number(ttl) * 1000;
    if (Number.isSafeInteger(expires) && Number.isFinite(issued)
        && new Date(issued).toISOString().replace(/[-:]/g, '').replace('.000', '') === amzDate) return expires;
  }
  return null;
}

export function isRenewableMediaUrl(value?: string | null): boolean {
  return Boolean(value && (isStorageProviderUrl(value) || hasMediaUrlSignature(value)));
}

export function isUsableMediaUrl(value?: string | null, now = Date.now(), skew = MEDIA_URL_REFRESH_SKEW_MS): boolean {
  if (!value) return false;
  if (/^(?:blob:|file:|content:|asset:|data:image\/)/i.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  if (isStorageProviderUrl(value) && !hasMediaUrlSignature(value)) return false;
  const expires = getMediaUrlExpiryMs(value);
  if (expires !== null) return expires > now + skew;
  // Unknown external signatures remain usable; explicit but malformed expiry fails closed.
  return !hasMediaUrlSignature(value) || !['exp', 'Expires', 'expires', 'X-Amz-Expires', 'expiresAt', 'ExpiresAt'].some((name) => parameter(value, name) !== null);
}

export function mediaUrlCacheExpiresAt(value: string, maxAgeMs: number, now = Date.now()): number {
  const signedExpiry = getMediaUrlExpiryMs(value);
  return Math.min(now + maxAgeMs, signedExpiry === null ? Infinity : signedExpiry - MEDIA_URL_REFRESH_SKEW_MS);
}

/** Keep environment, permission and content transforms; discard credentials only. */
export function getMediaUrlIdentity(value: string): string {
  const base = value.split('?')[0].split('#')[0];
  const stable = pairs(value).filter((pair) => !AUTH_QUERY_NAMES.has(pair.split('=', 1)[0])).sort();
  return base + (stable.length ? `?${stable.join('&')}` : '');
}
