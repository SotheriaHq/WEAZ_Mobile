import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { FeedMediaCarousel } from '@/src/features/feed/components/FeedMediaCarousel';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

type MarketFeedItemProps = {
  collectionId: string;
  pageHeight: number;
  mediaItems: FeedViewerMedia[];
  activeMediaIndex: number;
  actionRail: React.ReactNode;
  metaOverlay: React.ReactNode;
  onCarouselIndexChange: (collectionId: string, nextIndex: number) => void;
};

export const MarketFeedItem = React.memo(function MarketFeedItem({
  collectionId,
  pageHeight,
  mediaItems,
  activeMediaIndex,
  actionRail,
  metaOverlay,
  onCarouselIndexChange,
}: MarketFeedItemProps) {
  const handleActiveIndexChange = useCallback(
    (nextIndex: number) => {
      onCarouselIndexChange(collectionId, nextIndex);
    },
    [collectionId, onCarouselIndexChange],
  );

  return (
    <View style={[styles.page, { height: pageHeight }]}>
      <FeedMediaCarousel
        collectionId={collectionId}
        mediaItems={mediaItems}
        initialActiveIndex={activeMediaIndex}
        onActiveIndexChange={handleActiveIndexChange}
      />
      {actionRail}
      {metaOverlay}
    </View>
  );
});

const styles = StyleSheet.create({
  page: {
    width: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
  },
});
