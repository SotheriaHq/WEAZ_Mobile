import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { FeedMediaCarousel } from '@/src/features/feed/components/FeedMediaCarousel';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

type MarketFeedItemProps = {
  collectionId: string;
  pageHeight: number;
  mediaItems: FeedViewerMedia[];
  activeMediaIndex: number;
  isActive: boolean;
  renderVersion: string;
  actionRail: React.ReactNode;
  metaOverlay: React.ReactNode;
  badgeOverlay?: React.ReactNode;
  onCarouselIndexChange: (collectionId: string, nextIndex: number) => void;
  onContentPress: (collectionId: string) => void;
};

function MarketFeedItemComponent({
  collectionId,
  pageHeight,
  mediaItems,
  activeMediaIndex,
  isActive,
  actionRail,
  metaOverlay,
  badgeOverlay,
  onCarouselIndexChange,
  onContentPress,
}: MarketFeedItemProps) {
  const handleActiveIndexChange = useCallback(
    (nextIndex: number) => {
      onCarouselIndexChange(collectionId, nextIndex);
    },
    [collectionId, onCarouselIndexChange],
  );
  const handleContentPress = useCallback(() => {
    onContentPress(collectionId);
  }, [collectionId, onContentPress]);

  return (
    <View style={[styles.page, { height: pageHeight }]}>
      <FeedMediaCarousel
        collectionId={collectionId}
        mediaItems={mediaItems}
        pageHeight={pageHeight}
        isActive={isActive}
        initialActiveIndex={activeMediaIndex}
        onActiveIndexChange={handleActiveIndexChange}
        onContentPress={handleContentPress}
      />
      {badgeOverlay}
      {actionRail}
      {metaOverlay}
    </View>
  );
}

export const MarketFeedItem = React.memo(
  MarketFeedItemComponent,
  // Overlay/action elements are composed by the parent. The primitive version
  // captures their visible state so unrelated row updates can skip safely.
  (previous, next) =>
    previous.collectionId === next.collectionId &&
    previous.pageHeight === next.pageHeight &&
    previous.mediaItems === next.mediaItems &&
    previous.activeMediaIndex === next.activeMediaIndex &&
    previous.isActive === next.isActive &&
    previous.renderVersion === next.renderVersion &&
    previous.onCarouselIndexChange === next.onCarouselIndexChange &&
    previous.onContentPress === next.onContentPress,
);

const styles = StyleSheet.create({
  page: {
    width: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
});
