import { isUsableImageHttpUrl, prefetchResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { prefetchDevLog } from '@/src/features/feed/utils/feedDiagnostics';

const inFlightPrefetches = new Set<string>();
const completedPrefetches = new Map<string, number>();
const PREFETCH_DEDUPE_TTL_MS = 5 * 60 * 1000;

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

export const prefetchFeedImage = async ({
  src,
  fileId,
  collectionId,
  mediaIndex,
}: {
  src?: string | null;
  fileId?: string | null;
  collectionId?: string | null;
  mediaIndex?: number | null;
}) => {
  const directSrc = normalizeStableUri(src);
  const normalizedFileId = normalizeStableUri(fileId);
  if (!directSrc && !normalizedFileId) {
    prefetchDevLog('prefetch-skipped', { reason: 'missing-source', collectionId, mediaIndex, hasFileId: false });
    return false;
  }
  if (directSrc && !isUsableImageHttpUrl(directSrc) && !normalizedFileId) {
    prefetchDevLog('prefetch-skipped', { reason: 'unusable-url-without-file-id', collectionId, mediaIndex, hasFileId: false });
    return false;
  }
  // File IDs are the durable identity. Some legacy rows expose only a file ID
  // (or an unsigned S3 URL beside it), so keying on the usable URL alone left
  // precisely those next pages cold until the user swiped onto them.
  const key = normalizedFileId ? `file:${normalizedFileId}` : directSrc!;
  if (inFlightPrefetches.has(key)) {
    prefetchDevLog('prefetch-skipped', { reason: 'duplicate', collectionId, mediaIndex });
    return false;
  }
  const prefetchedUntil = completedPrefetches.get(key);
  if (prefetchedUntil && prefetchedUntil > Date.now()) {
    prefetchDevLog('prefetch-skipped', { reason: 'recently-prefetched', collectionId, mediaIndex });
    return false;
  }
  if (prefetchedUntil) {
    completedPrefetches.delete(key);
  }

  inFlightPrefetches.add(key);
  prefetchDevLog('prefetch-start', { collectionId, mediaIndex, hasFileId: Boolean(fileId) });
  try {
    const ok = await prefetchResolvedImageAsset({
      src: directSrc,
      fileId: normalizedFileId,
      allowSignedFallback: false,
      debugContext: {
        designId: collectionId,
        mediaIndex,
        sourceField: 'feed.prefetch.url',
      },
    });
    if (ok) {
      completedPrefetches.set(key, Date.now() + PREFETCH_DEDUPE_TTL_MS);
    }
    prefetchDevLog('prefetch-complete', { collectionId, mediaIndex, ok });
    return ok;
  } finally {
    inFlightPrefetches.delete(key);
  }
};
