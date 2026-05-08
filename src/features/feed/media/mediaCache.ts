import { prefetchResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { prefetchDevLog } from '@/src/features/feed/utils/feedDiagnostics';

const inFlightPrefetches = new Set<string>();

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
  const key = fileId || src;
  if (!key) {
    prefetchDevLog('prefetch-skipped', { reason: 'missing-source', collectionId, mediaIndex });
    return false;
  }
  if (inFlightPrefetches.has(key)) {
    prefetchDevLog('prefetch-skipped', { reason: 'duplicate', collectionId, mediaIndex });
    return false;
  }

  inFlightPrefetches.add(key);
  prefetchDevLog('prefetch-start', { collectionId, mediaIndex, hasFileId: Boolean(fileId) });
  try {
    const ok = await prefetchResolvedImageAsset({
      src,
      fileId,
      debugContext: {
        designId: collectionId,
        mediaIndex,
        fileId,
        sourceField: fileId ? 'feed.prefetch.fileId' : 'feed.prefetch.url',
      },
    });
    prefetchDevLog('prefetch-complete', { collectionId, mediaIndex, ok });
    return ok;
  } finally {
    inFlightPrefetches.delete(key);
  }
};
