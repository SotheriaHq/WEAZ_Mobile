import { useCallback, useRef } from 'react';

import { prefetchFeedImage } from '@/src/features/feed/media/mediaCache';
import type { FeedResolvedMedia } from '@/src/features/feed/media/mediaTypes';

export function useFeedPrefetch() {
  const requestedRef = useRef(new Set<string>());

  const prefetchNearby = useCallback((items: Array<FeedResolvedMedia[]>, activeIndex: number) => {
    [activeIndex - 1, activeIndex + 1, activeIndex + 2].forEach((index) => {
      const primary = items[index]?.find((media) => media.type === 'image');
      const key = primary?.fileId || primary?.displayUrl;
      if (!primary || !key || requestedRef.current.has(key)) return;
      requestedRef.current.add(key);
      void prefetchFeedImage({
        src: primary.displayUrl,
        fileId: primary.fileId,
        collectionId: primary.collectionId,
        mediaIndex: primary.mediaIndex,
      });
    });
  }, []);

  return { prefetchNearby };
}
