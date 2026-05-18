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
  onContentPress: () => void;
};

export const MarketFeedItem = React.memo(function MarketFeedItem({
  collectionId,
  pageHeight,
  mediaItems,
  activeMediaIndex,
  actionRail,
  metaOverlay,
  onCarouselIndexChange,
  onContentPress,
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
        pageHeight={pageHeight}
        initialActiveIndex={activeMediaIndex}
        onActiveIndexChange={handleActiveIndexChange}
        onContentPress={onContentPress}
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
    overflow: 'hidden',
  },
});
