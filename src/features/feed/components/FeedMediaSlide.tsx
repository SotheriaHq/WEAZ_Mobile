import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { FeedImage } from '@/src/features/feed/components/FeedImage';
import type { FeedViewerMedia } from '@/src/features/feed/components/feedComponentTypes';

type FeedMediaSlideProps = {
  media: FeedViewerMedia | null;
  imageIndex: number;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  onPress?: () => void;
};

const getMediaAspectRatio = (media: FeedViewerMedia | null) => {
  if (!media) return null;
  if (typeof media.aspectRatio === 'number' && Number.isFinite(media.aspectRatio) && media.aspectRatio > 0) {
    return media.aspectRatio;
  }
  if (
    typeof media.width === 'number' &&
    typeof media.height === 'number' &&
    Number.isFinite(media.width) &&
    Number.isFinite(media.height) &&
    media.width > 0 &&
    media.height > 0
  ) {
    return media.width / media.height;
  }
  return null;
};

const getAspectClass = (aspectRatio: number | null) => {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return 'unknown' as const;
  if (aspectRatio > 1.08) return 'landscape' as const;
  if (aspectRatio < 0.92) return 'portrait' as const;
  return 'square' as const;
};

export const FeedMediaSlide = React.memo(function FeedMediaSlide({
  media,
  imageIndex,
  viewportWidth,
  viewportHeight,
  onPress,
}: FeedMediaSlideProps) {
  const { scheme, theme } = useTheme();
  const placeholderSurface = scheme === 'dark' ? theme.colors.surface : theme.colors.surfaceAlt;
  const aspectRatio = getMediaAspectRatio(media);
  const aspectClass = getAspectClass(aspectRatio);

  if (!media) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.emptySlide, { backgroundColor: placeholderSurface }]}>
        <AppText variant="display">Image</AppText>
        <AppText variant="subtitle" tone="inverse">No views yet</AppText>
        <AppText variant="body" tone="secondary" style={styles.slideBody}>
          This design does not have any media to browse.
        </AppText>
      </View>
    );
  }

  if (media.type === 'video') {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.videoSlide, { backgroundColor: placeholderSurface }]}>
        <AppText variant="display">Video</AppText>
        <AppText variant="subtitle" tone="inverse">Video view</AppText>
        <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.slideBody}>
          {media.label || 'Swipe to another view'}
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: placeholderSurface }]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Show details for ${media.label || 'this design'}` : undefined}
    >
      <FeedImage
        id={media.id}
        displayUrl={media.displayUrl ?? media.url}
        thumbnailUrl={media.thumbnailUrl}
        previewUrl={media.previewUrl}
        fileId={media.fileId}
        blurHash={media.blurHash}
        dominantColor={media.dominantColor}
        label={media.label}
        style={styles.pageImage}
        sourceType={media.fileId ? 'feed-media-file' : 'feed-media-url'}
        imageIndex={imageIndex}
        contentFit="contain"
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        naturalWidth={media.width}
        naturalHeight={media.height}
        aspectRatio={aspectRatio}
        aspectClass={aspectClass}
        frostedBackdrop
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pageImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  videoSlide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptySlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  slideBody: {
    marginTop: 6,
    textAlign: 'center',
  },
});
