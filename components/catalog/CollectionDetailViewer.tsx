import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import CollectionCommentsSheet from '@/components/catalog/CollectionCommentsSheet';
import ThreadRailAction from '@/components/catalog/ThreadRailAction';
import { AppLoaderScreen } from '@/components/ui/AppLoader';
import { Button } from '@/components/ui/Button';
import { ThreadlyLogoLoader } from '@/components/ui/ThreadlyLogoLoader';
import {
  brandApi,
  type CollectionDetailDto,
  type CollectionDetailMediaDto,
  type CollectionScope,
} from '@/src/api/BrandApi';
import { toggleCollectionMediaThread } from '@/src/api/MarketApi';
import { useAuth } from '@/src/auth/AuthContext';
import { resolveImageUri, useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { useDiscreteTapGesture } from '@/src/hooks/useDiscreteTapGesture';
import { useTheme } from '@/src/theme/ThemeProvider';
import { getAvatarFallback } from '@/src/utils/profileImage';
import { AppText } from '@/components/ui/AppText';

type ViewerMedia = {
  id: string;
  collectionId: string;
  mediaIndex: number;
  url: string;
  fileId: string | null;
  type: 'image' | 'video';
  label: string;
  threadsCount: number;
};

type CarouselMedia = ViewerMedia & {
  virtualKey: string;
};

const normalizeScope = (scope?: string): CollectionScope => {
  if (scope === 'store' || scope === 'all') return scope;
  return 'design';
};

const getDisplayName = (owner?: CollectionDetailDto['owner']) => {
  if (!owner) return 'Brand';
  return owner.brandFullName || [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.username || 'Brand';
};

const getMediaType = (media: CollectionDetailMediaDto): 'image' | 'video' => {
  const rawType = String(media.mediaType ?? media.file?.originalName ?? media.file?.fileName ?? '').toLowerCase();
  return rawType.includes('video') ? 'video' : 'image';
};

const normalizeStableUri = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const getCollectionMediaDirectUrl = (media: CollectionDetailMediaDto) =>
  normalizeStableUri(media.url) ??
  normalizeStableUri(media.secureUrl) ??
  normalizeStableUri(media.s3Url) ??
  normalizeStableUri(media.previewUrl) ??
  normalizeStableUri(media.file?.secureUrl) ??
  normalizeStableUri(media.file?.s3Url) ??
  normalizeStableUri(media.file?.url);

const getCollectionMediaFileId = (media: CollectionDetailMediaDto) =>
  normalizeStableUri(media.fileId) ??
  normalizeStableUri(media.fileUploadId) ??
  normalizeStableUri(media.uploadFileId) ??
  normalizeStableUri(media.file?.fileId) ??
  normalizeStableUri(media.file?.id);

function ViewerMediaSlide({ media, fallbackMedia }: { media: ViewerMedia | null; fallbackMedia?: ViewerMedia | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const primaryDebugContext = useMemo(
    () => ({
      designId: media?.collectionId ?? null,
      mediaIndex: media?.mediaIndex ?? null,
      fileId: media?.fileId ?? null,
      sourceField: media?.fileId ? 'collection.media.fileId' : 'collection.media.url',
    }),
    [media?.collectionId, media?.fileId, media?.mediaIndex],
  );
  const fallbackDebugContext = useMemo(
    () => ({
      designId: fallbackMedia?.collectionId ?? media?.collectionId ?? null,
      mediaIndex: 0,
      fileId: fallbackMedia?.fileId ?? null,
      sourceField: fallbackMedia?.fileId ? 'collection.cover.fileId' : 'collection.cover.url',
    }),
    [fallbackMedia?.collectionId, fallbackMedia?.fileId, media?.collectionId],
  );
  const { uri: primaryUri, loading: primaryLoading } = useResolvedImageAsset({
    src: media?.url,
    fileId: media?.fileId,
    enabled: Boolean(media),
    debugContext: primaryDebugContext,
  });
  const fallbackCandidate = fallbackMedia && fallbackMedia.id !== media?.id ? fallbackMedia : null;
  const shouldUseFallback = Boolean(fallbackCandidate && !primaryLoading && (!primaryUri || imageFailed));
  const { uri: fallbackUri, loading: fallbackLoading } = useResolvedImageAsset({
    src: fallbackCandidate?.url,
    fileId: fallbackCandidate?.fileId,
    enabled: shouldUseFallback,
    debugContext: fallbackDebugContext,
  });
  const uri = imageFailed ? fallbackUri : primaryUri ?? fallbackUri;
  const loading = primaryLoading || (shouldUseFallback && fallbackLoading);

  useEffect(() => {
    setImageFailed(false);
  }, [uri]);

  if (!media) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.emptySlide]}>
        <AppText style={styles.emptySlideEmoji}>🖼️</AppText>
        <AppText style={styles.emptySlideTitle}>No views yet</AppText>
        <AppText style={styles.emptySlideText}>This design does not have any media to browse.</AppText>
      </View>
    );
  }

  if (media.type === 'video') {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.videoSlide]}>
        <AppText style={styles.videoEmoji}>🎬</AppText>
        <AppText style={styles.videoTitle}>Video view</AppText>
        <AppText style={styles.videoCaption} numberOfLines={2}>
          {media.label || 'Swipe to another view'}
        </AppText>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.mediaLoadingSlide]}>
        <ThreadlyLogoLoader size={72} />
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.brokenSlide]}>
        <AppText style={styles.emptySlideEmoji}>🖼️</AppText>
        <AppText style={styles.emptySlideTitle}>No image available</AppText>
        <AppText style={styles.emptySlideText}>This media is unavailable right now.</AppText>
      </View>
    );
  }

  return <Image source={{ uri }} style={styles.slideImage} resizeMode="cover" onError={() => setImageFailed(true)} />;
}

function OwnerAvatar({
  owner,
  onPress,
}: {
  owner?: CollectionDetailDto['owner'] | null;
  onPress: () => void;
}) {
  const { uri, loading } = useResolvedImageAsset({
    src: owner?.profileImage ?? owner?.profileImageFile?.s3Url ?? owner?.profileImageFile?.url ?? null,
    fileId: owner?.profileImageId ?? owner?.profileImageFile?.id ?? null,
    enabled: Boolean(owner),
  });
  const initials = getAvatarFallback(getDisplayName(owner), owner?.username);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ownerAvatarWrap, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${getDisplayName(owner)} profile`}
    >
      <View style={styles.ownerAvatarCircle}>
        {uri && !loading ? (
          <Image source={{ uri }} style={styles.ownerAvatarImage} resizeMode="cover" />
        ) : (
          <AppText style={styles.ownerAvatarInitials}>{initials}</AppText>
        )}
      </View>
    </Pressable>
  );
}

function LoopCarousel({
  mediaItems,
  activeIndex,
  onActiveIndexChange,
  onTap,
  onDoubleTap,
}: {
  mediaItems: ViewerMedia[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onTap: () => void;
  onDoubleTap?: () => void;
}) {
  const { width } = useWindowDimensions();
  const carouselRef = useRef<FlatList<CarouselMedia>>(null);
  const hasMultipleItems = mediaItems.length > 1;
  const safeActiveIndex = mediaItems.length > 0 ? Math.min(activeIndex, mediaItems.length - 1) : 0;
  const tapHandlers = useDiscreteTapGesture({
    onTap,
    onDoubleTap,
  });

  const carouselItems = useMemo<CarouselMedia[]>(() => {
    if (!hasMultipleItems) {
      return mediaItems.map((item, index) => ({ ...item, virtualKey: `real-${item.id}-${index}` }));
    }

    const first = mediaItems[0];
    const last = mediaItems[mediaItems.length - 1];

    return [
      { ...last, virtualKey: `loop-last-${last.id}` },
      ...mediaItems.map((item, index) => ({ ...item, virtualKey: `real-${item.id}-${index}` })),
      { ...first, virtualKey: `loop-first-${first.id}` },
    ];
  }, [hasMultipleItems, mediaItems]);
  const fallbackMedia = useMemo(
    () => mediaItems.find((item) => item.type === 'image' && Boolean(item.url || item.fileId)) ?? null,
    [mediaItems],
  );

  const internalIndex = hasMultipleItems ? safeActiveIndex + 1 : safeActiveIndex;

  useEffect(() => {
    if (!carouselRef.current || !carouselItems.length) {
      return;
    }

    carouselRef.current.scrollToOffset({
      offset: internalIndex * width,
      animated: false,
    });
  }, [carouselItems.length, internalIndex, width]);

  if (!mediaItems.length) {
    return (
      <View style={StyleSheet.absoluteFillObject} {...tapHandlers}>
        <ViewerMediaSlide media={null} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} {...tapHandlers}>
      <FlatList
        ref={carouselRef}
        data={carouselItems}
        key={`${mediaItems.length}-${width}`}
        keyExtractor={(item) => item.virtualKey}
        horizontal
        pagingEnabled
        directionalLockEnabled
        nestedScrollEnabled
        bounces={false}
        decelerationRate="fast"
        disableIntervalMomentum
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEnabled={hasMultipleItems}
        initialNumToRender={Math.min(carouselItems.length, 4)}
        windowSize={3}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={(event) => {
          const rawIndex = Math.max(
            0,
            Math.min(carouselItems.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
          );

          if (!hasMultipleItems) {
            onActiveIndexChange(rawIndex);
            return;
          }

          if (rawIndex === 0) {
            const loopIndex = mediaItems.length - 1;
            onActiveIndexChange(loopIndex);
            requestAnimationFrame(() => {
              carouselRef.current?.scrollToOffset({
                offset: mediaItems.length * width,
                animated: false,
              });
            });
            return;
          }

          if (rawIndex === carouselItems.length - 1) {
            onActiveIndexChange(0);
            requestAnimationFrame(() => {
              carouselRef.current?.scrollToOffset({
                offset: width,
                animated: false,
              });
            });
            return;
          }

          onActiveIndexChange(rawIndex - 1);
        }}
        renderItem={({ item }) => (
          <View style={{ width }}>
            <ViewerMediaSlide media={item} fallbackMedia={fallbackMedia} />
          </View>
        )}
      />

      {hasMultipleItems ? (
        <View style={styles.dotRow} pointerEvents="none">
          {mediaItems.map((item, index) => (
            <View
              key={`${item.id}-${index}`}
              style={[styles.dot, index === safeActiveIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function CollectionDetailViewer({
  collectionId,
  scope,
  autoOpenComments = false,
  initialCommentId = null,
}: {
  collectionId: string;
  scope?: string;
  autoOpenComments?: boolean;
  initialCommentId?: string | null;
}) {
  const { theme } = useTheme();
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();

  const [detail, setDetail] = useState<CollectionDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [requestState, setRequestState] = useState<'NONE' | 'PENDING' | 'APPROVED' | 'REVOKED'>('NONE');
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [mediaItems, setMediaItems] = useState<ViewerMedia[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [infoVisible, setInfoVisible] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(autoOpenComments);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [threadStateByMedia, setThreadStateByMedia] = useState<Record<string, { threaded: boolean; count: number }>>({});
  const [threadingMediaById, setThreadingMediaById] = useState<Record<string, boolean>>({});
  const threadStateByMediaRef = useRef<Record<string, { threaded: boolean; count: number }>>({});
  const threadingMediaByIdRef = useRef<Record<string, boolean>>({});
  const queuedThreadIntentByMediaRef = useRef<Record<string, boolean>>({});
  const infoOpacity = useRef(new Animated.Value(0)).current;

  const resolvedScope = normalizeScope(scope);
  const brandName = useMemo(() => getDisplayName(detail?.owner), [detail?.owner]);
  const brandHandle = detail?.owner?.username ? `@${detail.owner.username}` : null;
  const mediaCount = mediaItems.length;
  const tags = Array.isArray(detail?.tags) ? detail.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : [];
  const isStoreCollection = Boolean(detail?.isAvailableInStore || resolvedScope === 'store');

  const currentMedia = mediaItems[activeIndex] ?? null;
  const currentThreadState = currentMedia ? threadStateByMedia[currentMedia.id] : undefined;
  const currentThreadCount = currentMedia
    ? currentThreadState?.count ?? currentMedia.threadsCount
    : detail?.threadsCount ?? 0;
  const isCurrentThreaded = currentMedia ? Boolean(currentThreadState?.threaded) : false;
  const isCurrentThreading = currentMedia ? Boolean(threadingMediaById[currentMedia.id]) : false;

  useEffect(() => {
    threadStateByMediaRef.current = threadStateByMedia;
  }, [threadStateByMedia]);

  useEffect(() => {
    threadingMediaByIdRef.current = threadingMediaById;
  }, [threadingMediaById]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!collectionId) {
        if (mounted) {
          setError('Missing collection id.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setLocked(false);
      setRequestState('NONE');
      setThreadingMediaById({});
      queuedThreadIntentByMediaRef.current = {};
      threadingMediaByIdRef.current = {};

      try {
        const response = await brandApi.getCollectionDetail(collectionId, { scope: resolvedScope });
        if (!mounted) return;

        if (!response) {
          setDetail(null);
          setError('Collection unavailable right now.');
          setMediaItems([]);
          setActiveIndex(0);
          setThreadStateByMedia({});
          threadStateByMediaRef.current = {};
          return;
        }

        const medias = Array.isArray(response.medias) ? response.medias : [];
        const nextItems = await Promise.all(
          medias.map(async (media, index) => {
            const directUrl = getCollectionMediaDirectUrl(media);
            const fileId = getCollectionMediaFileId(media);
            const url = (await resolveImageUri({
              src: directUrl,
              fileId,
              debugContext: {
                designId: collectionId,
                mediaIndex: index,
                fileId,
                sourceField: fileId ? 'collection.media.fileId' : 'collection.media.url',
              },
            })) ?? '';
            return {
              id: media.id || media.file?.id || `${collectionId}-${index}`,
              collectionId,
              mediaIndex: index,
              url,
              fileId,
              type: getMediaType(media),
              label: media.caption ?? media.file?.originalName ?? response.title,
              threadsCount: typeof media.threadsCount === 'number' ? media.threadsCount : 0,
            } satisfies ViewerMedia;
          }),
        );

        if (!mounted) return;

        const normalizedItems = nextItems.filter((item) => Boolean(item.id));
        const nextThreadState = normalizedItems.reduce<Record<string, { threaded: boolean; count: number }>>((acc, item) => {
          acc[item.id] = {
            threaded: false,
            count: item.threadsCount,
          };
          return acc;
        }, {});

        setDetail(response);
        setMediaItems(normalizedItems);
        setThreadStateByMedia(nextThreadState);
        threadStateByMediaRef.current = nextThreadState;
        setActiveIndex(0);
      } catch (fetchError: any) {
        if (!mounted) return;
        const statusCode = fetchError?.response?.status;
        if (statusCode === 403 || statusCode === 401) {
          setLocked(true);
          setError(null);
        } else if (statusCode === 404 || statusCode === 410) {
          setError('This design is no longer available.');
        } else {
          setError('Unable to load this design right now.');
        }
        setDetail(null);
        setMediaItems([]);
        setActiveIndex(0);
        setThreadStateByMedia({});
        threadStateByMediaRef.current = {};
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [collectionId, reloadToken, resolvedScope]);

  useEffect(() => {
    if (!autoOpenComments) {
      return;
    }
    setCommentsOpen(true);
  }, [autoOpenComments]);

  const toggleInfo = useCallback(() => {
    const nextVisible = !infoVisible;
    setInfoVisible(nextVisible);
    Animated.timing(infoOpacity, {
      toValue: nextVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [infoOpacity, infoVisible]);

  const hideInfo = useCallback(() => {
    setInfoVisible(false);
    Animated.timing(infoOpacity, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [infoOpacity]);

  const openBrandProfile = useCallback(() => {
    if (!detail?.owner?.id) return;
    router.push({ pathname: '/catalog/[brandId]', params: { brandId: detail.owner.id } } as any);
  }, [detail?.owner?.id]);

  const shareCollection = useCallback(async () => {
    if (!detail) return;
    try {
      await Share.share({ message: `${detail.title} by ${brandName} on Threadly` });
    } catch {
      // Best effort.
    }
  }, [brandName, detail]);

  const executeThreadIntent = useCallback(
    async (
      mediaId: string,
      nextThreaded: boolean,
      baselineState?: { threaded: boolean; count: number },
    ) => {
      const previousState =
        baselineState ??
        threadStateByMediaRef.current[mediaId] ?? {
          threaded: false,
          count: 0,
        };
      const optimisticCount = Math.max(0, previousState.count + (nextThreaded ? 1 : -1));

      const optimisticState = {
        threaded: nextThreaded,
        count: optimisticCount,
      };

      threadStateByMediaRef.current = {
        ...threadStateByMediaRef.current,
        [mediaId]: optimisticState,
      };
      setThreadStateByMedia((prev) => ({
        ...prev,
        [mediaId]: optimisticState,
      }));

      threadingMediaByIdRef.current = {
        ...threadingMediaByIdRef.current,
        [mediaId]: true,
      };
      setThreadingMediaById((prev) => ({ ...prev, [mediaId]: true }));

      let finalState = previousState;

      try {
        const result = await toggleCollectionMediaThread(mediaId);
        finalState = {
          threaded: result.threaded,
          count: result.threads,
        };

        threadStateByMediaRef.current = {
          ...threadStateByMediaRef.current,
          [mediaId]: finalState,
        };
        setThreadStateByMedia((prev) => ({
          ...prev,
          [mediaId]: finalState,
        }));

      } catch {
        finalState = previousState;

        threadStateByMediaRef.current = {
          ...threadStateByMediaRef.current,
          [mediaId]: previousState,
        };
        setThreadStateByMedia((prev) => ({
          ...prev,
          [mediaId]: previousState,
        }));
      } finally {
        const nextBusy = { ...threadingMediaByIdRef.current };
        delete nextBusy[mediaId];
        threadingMediaByIdRef.current = nextBusy;

        setThreadingMediaById((prev) => {
          const next = { ...prev };
          delete next[mediaId];
          return next;
        });

        const queuedIntent = queuedThreadIntentByMediaRef.current[mediaId];
        delete queuedThreadIntentByMediaRef.current[mediaId];

        if (typeof queuedIntent === 'boolean' && queuedIntent !== finalState.threaded) {
          void executeThreadIntent(mediaId, queuedIntent, finalState);
        }
      }
    },
    [],
  );

  const handleThread = useCallback(() => {
    const mediaId = currentMedia?.id?.trim();
    if (!mediaId || status !== 'authenticated') return;

    const currentState =
      threadStateByMediaRef.current[mediaId] ?? {
        threaded: isCurrentThreaded,
        count: currentThreadCount,
      };

    if (!threadStateByMediaRef.current[mediaId]) {
      threadStateByMediaRef.current = {
        ...threadStateByMediaRef.current,
        [mediaId]: currentState,
      };
    }

    const nextThreaded = !currentState.threaded;

    if (threadingMediaByIdRef.current[mediaId]) {
      queuedThreadIntentByMediaRef.current[mediaId] = nextThreaded;
      return;
    }

    void executeThreadIntent(mediaId, nextThreaded, currentState);
  }, [currentMedia?.id, currentThreadCount, executeThreadIntent, isCurrentThreaded, status]);

  if (loading) {
    return <AppLoaderScreen message="Loading design" />;
  }

  if (locked) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.errorWrap}>
          <AppText style={styles.errorEmoji}>🔒</AppText>
          <AppText style={[styles.errorTitle, { color: theme.colors.text }]}>Private design</AppText>
          <AppText style={[styles.errorText, { color: theme.colors.textMuted }]}>
            Request access to unlock this brand&apos;s private designs.
          </AppText>
          {requestState === 'PENDING' ? (
            <AppText style={[styles.requestStateText, { color: theme.colors.textMuted }]}>
              ⏳ Access request pending
            </AppText>
          ) : requestState === 'REVOKED' ? (
            <AppText style={[styles.requestStateText, { color: theme.colors.textMuted }]}>
              ❌ Access request declined. Wait 72 hours before retrying.
            </AppText>
          ) : null}
          <View style={styles.errorActions}>
            <Button title="Back" variant="secondary" onPress={() => router.back()} />
            <Button
              title={
                requestingAccess
                  ? 'Requesting...'
                  : status === 'authenticated'
                    ? 'Request access'
                    : 'Log in'
              }
              variant="primary"
              onPress={async () => {
                if (status !== 'authenticated') {
                  router.push({ pathname: '/login', params: { next: `/catalog/view/${collectionId}` } } as any);
                  return;
                }
                setRequestingAccess(true);
                try {
                  const result = await brandApi.requestPrivateAccess(collectionId);
                  if (!result) {
                    return;
                  }
                  if (result.cooldownActive) {
                    setRequestState('REVOKED');
                    return;
                  }
                  setRequestState(result.state);
                  if (result.state === 'APPROVED') {
                    setReloadToken((value) => value + 1);
                  }
                } catch (requestError: any) {
                  if (requestError?.response?.status === 403) {
                    setRequestState('REVOKED');
                  }
                } finally {
                  setRequestingAccess(false);
                }
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.errorWrap}>
          <AppText style={styles.errorEmoji}>😕</AppText>
          <AppText style={[styles.errorTitle, { color: theme.colors.text }]}>Viewer unavailable</AppText>
          <AppText style={[styles.errorText, { color: theme.colors.textMuted }]}>{error ?? 'Unable to load this design.'}</AppText>
          <View style={styles.errorActions}>
            <Button title="Back" variant="secondary" onPress={() => router.back()} />
            <Button title="Retry" variant="primary" onPress={() => setReloadToken((value) => value + 1)} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      <View style={{ width, height, overflow: 'hidden' }}>
        <LoopCarousel
          mediaItems={mediaItems}
          activeIndex={activeIndex}
          onActiveIndexChange={(nextIndex) => {
            setActiveIndex(nextIndex);
            hideInfo();
          }}
          onTap={() => {
            if (commentsOpen) {
              setCommentsOpen(false);
              return;
            }
            toggleInfo();
          }}
          onDoubleTap={() => {
            void handleThread();
          }}
        />
        <LinearGradient colors={['#121826', '#0B0F17']} style={styles.topGradient} pointerEvents="none" />
        <LinearGradient colors={['#0B0F17', '#000000']} style={styles.bottomGradient} pointerEvents="none" />

        <View style={[styles.topLeft, { top: insets.top + 12 }]} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.glassButton, pressed && { opacity: 0.75 }]}>
            <AppText style={styles.glassButtonText}>← Back</AppText>
          </Pressable>
        </View>

        <View style={[styles.topRight, { top: insets.top + 12 }]} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push({ pathname: '/(tabs)/me', params: { tab: 'Saved' } } as any)}
            style={({ pressed }) => [styles.glassIconBtn, pressed && { opacity: 0.75 }]}
            accessibilityLabel="Saved items"
          >
            <AppText style={styles.glassIconText}>🛍️</AppText>
          </Pressable>
          <Pressable
            onPress={() => setIsWishlisted((value) => !value)}
            style={({ pressed }) => [styles.glassIconBtn, pressed && { opacity: 0.75 }]}
            accessibilityLabel="Wishlist"
          >
            <AppText style={styles.glassIconText}>{isWishlisted ? '❤️' : '🤍'}</AppText>
          </Pressable>
        </View>

        <View style={[styles.rightRail, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
          <OwnerAvatar owner={detail.owner} onPress={openBrandProfile} />

          <ThreadRailAction
            threaded={isCurrentThreaded}
            count={String(currentThreadCount)}
            busy={isCurrentThreading}
            onPress={() => {
              void handleThread();
            }}
          />

          <View style={styles.railItem}>
            <Pressable
              onPress={() => setCommentsOpen(true)}
              style={({ pressed }) => [styles.railBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Comments"
            >
              <AppText style={styles.railEmoji}>💬</AppText>
            </Pressable>
            <AppText style={styles.railLabel}>Comments</AppText>
          </View>

          <View style={styles.railItem}>
            <Pressable
              onPress={shareCollection}
              style={({ pressed }) => [styles.railBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Share"
            >
              <AppText style={styles.railEmoji}>📤</AppText>
            </Pressable>
            <AppText style={styles.railLabel}>Share</AppText>
          </View>
        </View>

        <Animated.View
          style={[styles.infoOverlay, { opacity: infoOpacity, bottom: insets.bottom + 20 }]}
          pointerEvents={infoVisible ? 'box-none' : 'none'}
        >
          <Pressable onPress={openBrandProfile} style={styles.infoBrandRow}>
            <View style={styles.infoAvatar}>
              <OwnerAvatar owner={detail.owner} onPress={openBrandProfile} />
            </View>
            <View style={styles.infoBrandTextWrap}>
              <AppText style={styles.infoBrandName} numberOfLines={1}>
                {brandName}
              </AppText>
              {brandHandle ? (
                <AppText style={styles.infoBrandHandle} numberOfLines={1}>
                  {brandHandle}
                </AppText>
              ) : null}
            </View>
          </Pressable>

          <AppText style={styles.infoTitle} numberOfLines={2}>
            {detail.title}
          </AppText>
          {detail.description ? (
            <AppText style={styles.infoDescription} numberOfLines={3}>
              {detail.description}
            </AppText>
          ) : null}

          <View style={styles.infoPillRow}>
            <View style={styles.infoPill}>
              <AppText style={styles.infoPillText}>{isStoreCollection ? 'Store' : 'Design'}</AppText>
            </View>
            {mediaCount > 0 ? (
              <View style={styles.infoPill}>
                <AppText style={styles.infoPillText}>{mediaCount} views</AppText>
              </View>
            ) : null}
            {tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.infoPill}>
                <AppText style={styles.infoPillText}>#{tag}</AppText>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      <CollectionCommentsSheet
        visible={commentsOpen}
        collectionId={collectionId}
        collectionTitle={detail.title}
        initialCommentId={initialCommentId}
        onClose={() => setCommentsOpen(false)}
      />
    </View>
  );
}

export default CollectionDetailViewer;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  errorEmoji: {
    fontSize: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  requestStateText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  mediaLoadingSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06060b',
  },
  brokenSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0b0b12',
  },
  videoSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#111',
  },
  videoEmoji: {
    fontSize: 34,
    marginBottom: 8,
    color: '#fff',
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: '#fff',
  },
  videoCaption: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    color: '#CBD5E1',
  },
  emptySlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#111',
  },
  emptySlideEmoji: {
    fontSize: 36,
    marginBottom: 8,
    color: '#fff',
  },
  emptySlideTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  emptySlideText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: '#94A3B8',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: '#121826',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: '#0B0F17',
  },
  topLeft: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  topRight: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    gap: 10,
    zIndex: 10,
  },
  glassButton: {
    backgroundColor: '#121826',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#273244',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  glassIconBtn: {
    backgroundColor: '#121826',
    borderRadius: 999,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#273244',
  },
  glassIconText: {
    fontSize: 18,
    lineHeight: 22,
  },
  ownerAvatarWrap: {
    marginBottom: 2,
  },
  ownerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#9333EA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#C084FC',
    overflow: 'hidden',
  },
  ownerAvatarImage: {
    ...StyleSheet.absoluteFillObject,
  },
  ownerAvatarInitials: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  rightRail: {
    position: 'absolute',
    right: 14,
    flexDirection: 'column',
    gap: 18,
    alignItems: 'center',
    zIndex: 10,
  },
  railItem: {
    alignItems: 'center',
    gap: 4,
  },
  railBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: '#273244',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railEmoji: {
    fontSize: 21,
    lineHeight: 23,
  },
  railLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  dotRow: {
    position: 'absolute',
    bottom: 112,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
  infoOverlay: {
    position: 'absolute',
    left: 16,
    right: 82,
    gap: 8,
    zIndex: 8,
  },
  infoBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoAvatar: {
    width: 44,
    height: 44,
  },
  infoBrandTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  infoBrandName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  infoBrandHandle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  infoTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  infoDescription: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  infoPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoPill: {
    backgroundColor: '#121826',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#273244',
  },
  infoPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
