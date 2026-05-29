import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { StableImage } from '@/components/ui/StableImage';
import { MobileStoreApi, type CollectionBagStatus } from '@/src/api/StoreApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { BAG_IT_EMOJI } from '@/src/constants/bagging';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { isThreadlyDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';

type CollectionGalleryViewerProps = {
  collectionId: string;
};

type GalleryMedia = {
  id: string;
  url: string | null;
  fileId: string | null;
  title: string;
  productId: string | null;
  productName: string | null;
};

const shouldLogGalleryTiming = () =>
  isThreadlyDebugEnabled('network') ||
  process.env.EXPO_PUBLIC_BAGGING_OBSERVABILITY === 'true';

const logGalleryTiming = (event: string, startedAt: number, context: Record<string, unknown>) => {
  if (!shouldLogGalleryTiming()) return;
  console.debug('[bagging:timing]', {
    event: `mobile.collection_gallery.${event}.duration`,
    durationMs: Date.now() - startedAt,
    ...context,
  });
};

const statusBarContrast = (value: 'light' | 'dark') => (value === 'dark' ? 'light' : 'dark');

function buildGalleryMedia(status: CollectionBagStatus | null): GalleryMedia[] {
  if (!status) return [];
  const rows: GalleryMedia[] = [];
  if (status.collection.coverImage || status.collection.coverImageId) {
    rows.push({
      id: `${status.collection.id}:cover`,
      url: status.collection.coverImage,
      fileId: status.collection.coverImageId,
      title: status.collection.title,
      productId: null,
      productName: null,
    });
  }
  for (const product of status.products) {
    const productMedia = product.media.length > 0
      ? product.media
      : [{ url: product.coverImage, fileId: product.coverImageId }];
    for (const [index, media] of productMedia.entries()) {
      if (!media.url && !media.fileId) continue;
      rows.push({
        id: `${product.productId}:${media.fileId ?? media.url ?? index}`,
        url: media.url,
        fileId: media.fileId,
        title: status.collection.title,
        productId: product.productId,
        productName: product.name,
      });
    }
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.url ?? ''}:${row.fileId ?? ''}:${row.productId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function GallerySlide({
  item,
  width,
  height,
  index,
  collectionId,
}: {
  item: GalleryMedia;
  width: number;
  height: number;
  index: number;
  collectionId: string;
}) {
  const { theme } = useTheme();
  const uri = useResolvedImageUri({
    src: item.url,
    fileId: item.fileId,
    enabled: Boolean(item.url || item.fileId),
    debugContext: {
      collectionId,
      productId: item.productId ?? undefined,
      mediaIndex: index,
    },
  });

  return (
    <View style={[styles.slide, { width, height, backgroundColor: theme.colors.bg }]}>
      {uri ? (
        <StableImage uri={uri} resizeMode="contain" containerStyle={styles.image} imageStyle={styles.image} />
      ) : (
        <View style={[styles.fallback, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="display" tone="muted">{BAG_IT_EMOJI}</AppText>
          <AppText variant="bodyBold" tone="muted">Media unavailable</AppText>
        </View>
      )}
    </View>
  );
}

export function CollectionGalleryViewer({ collectionId }: CollectionGalleryViewerProps) {
  const { theme, scheme } = useTheme();
  const chrome = useScreenChrome();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<GalleryMedia> | null>(null);
  const [status, setStatus] = useState<CollectionBagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedCollectionId = String(collectionId ?? '').trim();

  const load = useCallback(async () => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await MobileStoreApi.getCollectionBagStatus(normalizedCollectionId);
      setStatus(nextStatus);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Collection gallery unavailable.');
    } finally {
      setLoading(false);
      logGalleryTiming('initial_load', startedAt, { collectionId: normalizedCollectionId });
    }
  }, [normalizedCollectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const media = useMemo(() => buildGalleryMedia(status), [status]);
  const activeMedia = media[activeIndex] ?? null;

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/collection-viewer', params: { collectionId: normalizedCollectionId } } as any);
  }, [normalizedCollectionId]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)));
  }, [media.length, width]);

  const renderItem = useCallback(
    ({ item, index }: { item: GalleryMedia; index: number }) => (
      <GallerySlide
        item={item}
        index={index}
        width={width}
        height={height}
        collectionId={normalizedCollectionId}
      />
    ),
    [height, normalizedCollectionId, width],
  );

  if (loading && !status) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: chrome.insets.top }]}>
        <StatusBar style={statusBarContrast(scheme)} />
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="bodyBold">Loading gallery</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !status) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: chrome.insets.top }]}>
        <StatusBar style={statusBarContrast(scheme)} />
        <View style={styles.centerState}>
          <AppText variant="subtitle">Gallery unavailable</AppText>
          <AppText variant="body" tone="secondary">{error ?? 'Try again later.'}</AppText>
          <Button title="Retry" onPress={() => void load()} />
          <Button title="Back to collection" variant="outline" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  if (media.length === 0) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: chrome.insets.top }]}>
        <StatusBar style={statusBarContrast(scheme)} />
        <View style={styles.centerState}>
          <AppText variant="subtitle">No media yet</AppText>
          <AppText variant="body" tone="secondary">This collection does not have gallery media available.</AppText>
          <Button title="Shop collection" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style="light" />
      <FlatList
        ref={listRef}
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <LinearGradient
        pointerEvents="none"
        colors={[theme.colors.backdropStrong, theme.colors.backdrop, 'transparent']}
        style={[styles.topGradient, { height: chrome.insets.top + 144 }]}
      />

      <View style={[styles.topBar, { top: chrome.insets.top + tokens.spacing.md }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to collection"
        >
          <AppText variant="subtitle">{String.fromCodePoint(0x2039)}</AppText>
        </Pressable>
        <View style={[styles.countPill, { backgroundColor: theme.colors.glassSurfaceStrong, borderColor: theme.colors.glassBorder }]}>
          <AppText variant="captionBold">{activeIndex + 1} / {media.length}</AppText>
        </View>
      </View>

      <View style={[styles.overlay, { bottom: chrome.immersiveOverlayBottomClearance + tokens.spacing.md }]}>
        <AppText variant="captionBold" tone="primary" numberOfLines={1}>
          {status.collection.brandName ?? 'Threadly brand'}
        </AppText>
        <AppText variant="title" tone="inverse" numberOfLines={2}>
          {status.collection.title}
        </AppText>
        {activeMedia?.productName ? (
          <AppText variant="bodyBold" tone="inverse" numberOfLines={1}>
            {activeMedia.productName}
          </AppText>
        ) : null}
        <View style={styles.actionRow}>
          <Button title="Shop collection" onPress={goBack} />
          {activeMedia?.productId ? (
            <Button
              title="View product"
              variant="outline"
              onPress={() => router.push({ pathname: '/products/[productId]', params: { productId: activeMedia.productId, returnTo: `/collection-gallery?collectionId=${normalizedCollectionId}` } } as any)}
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPill: {
    minHeight: 34,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  pressed: {
    opacity: 0.72,
  },
});

export default CollectionGalleryViewer;
