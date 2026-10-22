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

import { getMediaUrlExpiryMs, getMediaUrlIdentity, hasMediaUrlSignature, isUsableMediaUrl } from '../utils/mediaUrlPolicy';

export const getSignedUrlIdentity = (value: string): string | null => {
  if (!/^https?:\/\//i.test(value) || !hasMediaUrlSignature(value)) return null;
  return getMediaUrlIdentity(value);
};

/** Retain stable row identity only while its capability is still usable. */
export const isEquivalentSignedUrl = (previous: string, next: string, now = Date.now()): boolean => {
  const identity = getSignedUrlIdentity(previous);
  if (!identity || identity !== getSignedUrlIdentity(next)) return false;
  if (!isUsableMediaUrl(previous, now, 0)) return false;
  const expiry = getMediaUrlExpiryMs(previous);
  // Gateway capabilities are deliberately short-lived; SDK URLs retain the
  // established one-hour safety margin for long-lived persisted queries.
  const margin = /[?&]sig=/.test(previous) ? 30_000 : 60 * 60 * 1000;
  return expiry === null || expiry - now > margin;
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
    const sameShape = Object.keys(previous).length === nextKeys.length;
    const merged: Record<string, unknown> = {};
    // Keys we kept the OLD string for because only the signature moved.
    const signatureOnlyKeys: string[] = [];
    let unchanged = sameShape;
    let substantiveChange = !sameShape;

    for (const key of nextKeys) {
      const previousValue = previous[key];
      const nextValue = next[key];

      if (
        typeof previousValue === 'string' &&
        typeof nextValue === 'string' &&
        previousValue !== nextValue &&
        isEquivalentSignedUrl(previousValue, nextValue)
      ) {
        merged[key] = previousValue;
        signatureOnlyKeys.push(key);
        continue;
      }

      const value = replaceEqualDeepPreservingSignedUrls(previousValue, nextValue);
      merged[key] = value;
      if (value !== previousValue) {
        unchanged = false;
        substantiveChange = true;
      }
    }

    // "Same object, new signature" only holds while the rest of the record also
    // held still. If a sibling field moved, the record genuinely changed — and
    // the case that matters is media replaced at a STABLE storage key: a new
    // avatar arrives with a new `profileImageId` but the same S3 path, so the
    // URL looks re-signed when the bytes behind it are different. Preserving it
    // there pinned the catalogue to the old image no matter how many times the
    // query was invalidated and refetched.
    if (substantiveChange) {
      for (const key of signatureOnlyKeys) {
        merged[key] = next[key];
        unchanged = false;
      }
    }

    return (unchanged ? previous : merged) as T;
  }

  return next;
};
