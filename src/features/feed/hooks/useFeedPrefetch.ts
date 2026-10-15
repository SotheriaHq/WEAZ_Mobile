import { useCallback, useRef } from 'react';

import { prefetchFeedImage } from '@/src/features/feed/media/mediaCache';
import type { FeedResolvedMedia } from '@/src/features/feed/media/mediaTypes';

export function useFeedPrefetch() {
  const requestedRef = useRef(new Set<string>());

  const prefetchNearby = useCallback((items: Array<FeedResolvedMedia[]>, activeIndex: number) => {
    const primary = items[activeIndex + 1]?.find((media) => media.type === 'image');
    const source = primary?.previewUrl ?? primary?.thumbnailUrl ?? primary?.displayUrl;
    const key = primary?.fileId || source;
    if (!primary || !key || requestedRef.current.has(key)) return;
    requestedRef.current.add(key);
    void prefetchFeedImage({
      src: source,
      fileId: primary.fileId,
      collectionId: primary.collectionId,
      mediaIndex: primary.mediaIndex,
    });
  }, []);

  return { prefetchNearby };
}
