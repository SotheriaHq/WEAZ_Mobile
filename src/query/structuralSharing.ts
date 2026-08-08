/**
 * Structural sharing that survives re-signed media URLs.
 *
 * THE PROBLEM
 * -----------
 * React Query already does structural sharing: if a refetch returns data that
 * is deeply equal to what is cached, it keeps the OLD references, no observer
 * re-renders, and nothing on screen moves. That is what makes silent background
 * revalidation invisible.
 *
 * It never worked for us, because almost every payload we cache carries S3
 * signed display URLs. The backend re-signs on every request, so `coverImage`
 * comes back as a byte-different string each time even when the underlying
 * object has not changed:
 *
 *   .../cover.jpg?X-Amz-Date=20260808T090000Z&X-Amz-Signature=a1b2...
 *   .../cover.jpg?X-Amz-Date=20260808T090500Z&X-Amz-Signature=c3d4...
 *
 * One changed leaf propagates all the way up: new media object -> new card
 * object -> new array -> every card re-renders, every `<img src>` changes, the
 * browser drops the decoded image and refetches it, and the grid collapses to
 * placeholder height and springs back as images land. That is the "content is
 * empty, then the cards flicker and shake in" report, and it fires on EVERY
 * revalidation of collections, drafts, reviews, market rails and the feed.
 *
 * THE FIX
 * -------
 * Treat two signed URLs that point at the same object as the same value, and
 * keep the older string so the reference chain above it stays identical. The
 * result is real structural sharing for our actual payloads: a revalidation
 * that found no changes produces zero re-renders and zero image reloads.
 *
 * Freshness is preserved by `SIGNED_URL_MIN_REMAINING_MS` — a URL close enough
 * to expiry to be risky is replaced with the new one even though it addresses
 * the same object.
 */

/**
 * Query params that mean "this URL is a credential, not an address". Presence
 * of any one of them is what tells us the query string is a signature and can
 * be ignored when deciding whether two URLs name the same object.
 */
const SIGNATURE_PARAMS = [
  // AWS SigV4 (S3 presigned GET — what UploadService issues).
  'X-Amz-Signature',
  'X-Amz-Credential',
  'X-Amz-Security-Token',
  // AWS SigV2 / CloudFront canned policies.
  'Signature',
  'Key-Pair-Id',
  'Policy',
];

/**
 * Never hold on to a cached URL that is about to expire. A preserved URL can
 * live as long as the persisted cache (24h) and the signatures we issue last 7
 * days, so this margin is not normally in play — it exists so a shorter TTL
 * somewhere else can never strand a screen on a dead URL.
 */
const SIGNED_URL_MIN_REMAINING_MS = 60 * 60 * 1000;

/**
 * Deliberately parsed by hand instead of with `new URL(...).searchParams`.
 * React Native ships a minimal `URL` with no `searchParams`, and this file is
 * mirrored verbatim into threadly-mobile — one implementation, identical
 * behaviour on both platforms, and no polyfill dependency.
 */
const splitQuery = (value: string): string | null => {
  const hashAt = value.indexOf('#');
  const withoutHash = hashAt === -1 ? value : value.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  if (queryAt === -1) return null;
  return withoutHash.slice(queryAt + 1);
};

const getQueryParam = (query: string, name: string): string | null => {
  const prefix = `${name}=`;
  for (const pair of query.split('&')) {
    if (pair.startsWith(prefix)) {
      return decodeURIComponent(pair.slice(prefix.length));
    }
  }
  return null;
};

const hasQueryParam = (query: string, name: string): boolean => {
  const prefix = `${name}=`;
  return query.split('&').some((pair) => pair.startsWith(prefix) || pair === name);
};

const parseAmzDate = (value: string): number | null => {
  // Basic ISO 8601: 20260808T090000Z
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
};

const getSignedUrlExpiryMs = (query: string): number | null => {
  const amzDate = getQueryParam(query, 'X-Amz-Date');
  const amzExpires = getQueryParam(query, 'X-Amz-Expires');
  if (amzDate && amzExpires) {
    const issuedAt = parseAmzDate(amzDate);
    const ttlSeconds = Number(amzExpires);
    if (issuedAt !== null && Number.isFinite(ttlSeconds)) {
      return issuedAt + ttlSeconds * 1000;
    }
  }
  // SigV2 / CloudFront canned policy: absolute epoch seconds.
  const expires = getQueryParam(query, 'Expires');
  if (expires) {
    const epochSeconds = Number(expires);
    if (Number.isFinite(epochSeconds)) return epochSeconds * 1000;
  }
  return null;
};

/**
 * The addressing part of a signed URL (everything before `?`), or null if this
 * is not a signed URL we recognise. Null means "compare these strings normally".
 */
export const getSignedUrlIdentity = (value: string): string | null => {
  if (value.length < 12 || !/^https?:\/\//i.test(value)) return null;

  const query = splitQuery(value);
  if (!query) return null;
  if (!SIGNATURE_PARAMS.some((param) => hasQueryParam(query, param))) {
    return null;
  }

  return value.slice(0, value.indexOf('?'));
};

/**
 * True when `previous` and `next` address the same object with different
 * signatures AND `previous` has enough life left to keep using.
 */
export const isEquivalentSignedUrl = (
  previous: string,
  next: string,
  now: number = Date.now(),
): boolean => {
  const previousIdentity = getSignedUrlIdentity(previous);
  if (previousIdentity === null) return false;
  if (previousIdentity !== getSignedUrlIdentity(next)) return false;

  const previousQuery = splitQuery(previous);
  const expiresAt = previousQuery ? getSignedUrlExpiryMs(previousQuery) : null;
  // Unparseable expiry: keep the cached URL. It came from the same cache
  // lifetime as the data around it, and churning it would reintroduce exactly
  // the re-render this module exists to stop.
  if (expiresAt === null) return true;

  return expiresAt - now > SIGNED_URL_MIN_REMAINING_MS;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/**
 * `replaceEqualDeep` with one extra leaf rule: re-signed URLs for the same
 * object count as unchanged. Returns `previous` (by reference) wherever the two
 * trees are equivalent, so React Query sees no change and skips the re-render.
 */
export const replaceEqualDeepPreservingSignedUrls = <T>(
  previous: unknown,
  next: T,
): T => {
  if (previous === (next as unknown)) return previous as T;

  if (typeof previous === 'string' && typeof next === 'string') {
    return (isEquivalentSignedUrl(previous, next) ? previous : next) as T;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) {
      return next.map((item, index) =>
        replaceEqualDeepPreservingSignedUrls(previous[index], item),
      ) as T;
    }
    let unchanged = true;
    const merged = next.map((item, index) => {
      const value = replaceEqualDeepPreservingSignedUrls(previous[index], item);
      if (value !== previous[index]) unchanged = false;
      return value;
    });
    return (unchanged ? previous : merged) as T;
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    const nextKeys = Object.keys(next);
    let unchanged = Object.keys(previous).length === nextKeys.length;
    const merged: Record<string, unknown> = {};
    for (const key of nextKeys) {
      const value = replaceEqualDeepPreservingSignedUrls(previous[key], next[key]);
      merged[key] = value;
      if (value !== previous[key]) unchanged = false;
    }
    return (unchanged ? previous : merged) as T;
  }

  return next;
};
