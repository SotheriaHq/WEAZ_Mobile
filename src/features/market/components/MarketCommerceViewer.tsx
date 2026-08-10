import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import ReviewsTab from '@/components/reviews/ReviewsTab';
import { StableImage } from '@/components/ui/StableImage';
import { AspectAwareMedia } from '@/src/components/media/AspectAwareMedia';
import {
  MobileStoreApi,
  type BagSourceType,
  type ProductBagStatus,
  type StoreProduct,
} from '@/src/api/StoreApi';
import {
  brandApi,
  type CollectionDetailDto,
  type CollectionDetailMediaDto,
} from '@/src/api/BrandApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { useAuth } from '@/src/auth/AuthContext';
import { useMobileBagging } from '@/src/features/bagging/useMobileBagging';
import { useResolvedImageAsset } from '@/src/hooks/useResolvedImageUri';
import { queryClient, WIEZ_QUERY_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { navPerf } from '@/src/utils/navPerf';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { BAG_IT_EMOJI, BAG_IT_LABEL } from '@/src/constants/bagging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import type { SizeRecommendationResponse } from '@/src/api/ProfileApi';
import { CONFIDENCE_LABELS, SIZING_REGION_LABELS } from '@/src/utils/sizeRecommendation';
import { isWiezDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';
import { backOrNavigate, drillDownPush } from '@/src/utils/mobileNavigation';
import MobileMarketSuggestionBlocks from './MobileMarketSuggestionBlocks';

type CommerceSourceType = Extract<BagSourceType, 'PRODUCT' | 'DESIGN'>;

type ViewerMediaEntry = {
  id: string;
  url: string | null;
  fileId: string | null;
  label: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAspectRatio?: number;
  blurhash?: string | null;
  dominantColor?: string | null;
};

type MarketCommerceViewerProps = {
  sourceType: CommerceSourceType;
  sourceId: string;
  initialTitle?: string | null;
  initialBrandId?: string | null;
  initialBrandName?: string | null;
  initialPriceLabel?: string | null;
  /**
   * Cover the caller already has on screen (the tapped card's image). Painted as
   * the first frame so opening an item is instant instead of a spinner held for
   * the length of the detail request — the calling surface has already loaded
   * and cached this exact bitmap.
   */
  initialMediaUrl?: string | null;
  initialMediaFileId?: string | null;
  fallbackHref?: string;
};

const EMPTY_MEDIA_ID = 'empty-media';
const ACTION_KIND_BAG = 'bag';
const ACTION_KIND_SAVE = 'save';
const ACTION_KIND_MESSAGE = 'message';
const ACTION_KIND_SHARE = 'share';

/**
 * Docked height of the metadata sheet.
 *
 * Was 56 with a 48pt handle block inside it — a slab across the bottom of a
 * full-bleed photograph for the sake of one line of type. 40 keeps the 44pt tap
 * target (the handle Pressable overhangs via hitSlop) while giving the image
 * back the strip it was eating.
 */
const COLLAPSED_SHEET_HEIGHT = 40;
/** dp/ms past which a release counts as a fling rather than a position. */
const SHEET_FLING_VELOCITY = 0.4;
/** Emoji-only dock actions — the sheet is chrome over media, not a toolbar. */
const MESSAGE_EMOJI = '💬';
const WISHLIST_EMOJI_ON = '💖';
const WISHLIST_EMOJI_OFF = '🤍';
/** Rule: navigation affordances are emoji, never icon glyphs. Matches `AppBackButton`. */
const BACK_EMOJI = '\u{1F448}';
/**
 * The stage behind the media is deep black in BOTH themes, so a letterboxed
 * image sits in one continuous field instead of on the light-theme app
 * background. This is a focused viewer opened over the app, not a tab surface —
 * unlike the Runway, which follows the theme through `theme.colors.runwayStage`.
 */
const VIEWER_STAGE_MATTE = tokens.themes.dark.colors.bg;
/** Shadow under the bare chrome glyphs — stage-scoped, so it does not follow the theme. */
const VIEWER_GLYPH_SHADOW = tokens.themes.dark.colors.backdrop;
const WHY_SIZE_EMOJI = 'ℹ️';
/** Spring config shared by open and close so the sheet feels attached, not canned. */
const SHEET_SPRING = {
  damping: 22,
  stiffness: 220,
  mass: 0.85,
  overshootClamping: true,
} as const;

const shouldLogViewerTiming = () =>
  isWiezDebugEnabled('network') ||
  process.env.EXPO_PUBLIC_BAGGING_OBSERVABILITY === 'true';

const logViewerTiming = (event: string, startedAt: number, context: Record<string, unknown>) => {
  if (!shouldLogViewerTiming()) return;
  console.debug('[bagging:timing]', {
    event: `mobile.market_viewer.${event}.duration`,
    durationMs: Date.now() - startedAt,
    ...context,
  });
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatPrice = (amount?: number | null, currency = 'NGN') => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-NG')}`;
  }
};

const getProductPrice = (product: StoreProduct) =>
  product.effectivePrice ?? product.salePrice ?? product.price;

const getTotalStock = (product: Pick<StoreProduct, 'stock' | 'variants'>) => {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  }
  return Number(product.stock || 0);
};

const getOwnerName = (owner?: CollectionDetailDto['owner'] | null) => {
  if (!owner) return null;
  const name = [
    owner.brandFullName,
    owner.username,
    [owner.firstName, owner.lastName].filter(Boolean).join(' '),
  ].map(asString).find(Boolean);
  return name ?? null;
};

const getCollectionMediaDirectUrl = (media: CollectionDetailMediaDto) =>
  asString(media.url) ??
  asString(media.secureUrl) ??
  asString(media.s3Url) ??
  asString(media.previewUrl) ??
  asString(media.file?.secureUrl) ??
  asString(media.file?.s3Url) ??
  asString(media.file?.url);

const getCollectionMediaFileId = (media: CollectionDetailMediaDto) =>
  asString(media.fileId) ??
  asString(media.fileUploadId) ??
  asString(media.uploadFileId) ??
  asString(media.file?.fileId) ??
  asString(media.file?.id) ??
  asString(media.id);

const buildProductMedia = (product: StoreProduct): ViewerMediaEntry[] => {
  const fromImages = product.images.map((image, index) => ({
    id: `${product.id}:image:${image.fileId ?? image.url ?? index}`,
    url: image.url ?? null,
    fileId: image.fileId ?? null,
    label: `${product.name} ${index + 1}`,
  }));
  const entries: ViewerMediaEntry[] =
    fromImages.length > 0
      ? fromImages
      : [
          {
            id: `${product.id}:cover`,
            url: product.coverImage ?? null,
            fileId: product.coverImageId ?? null,
            label: product.name,
          },
        ];

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.url ?? ''}:${entry.fileId ?? ''}`;
    if ((!entry.url && !entry.fileId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const readPositiveNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
};

const getMediaGeometry = (media: CollectionDetailMediaDto) => {
  // Detail DTO is loosely typed at the edges; width/height ride optional file
  // metadata when the backend has preprocessed the asset. Prefer them so the
  // viewer commits cover/contain on first paint instead of after onLoad.
  const file = media.file as (CollectionDetailMediaDto['file'] & {
    width?: number | null;
    height?: number | null;
    aspectRatio?: number | null;
    blurhash?: string | null;
    dominantColor?: string | null;
  }) | null | undefined;
  const raw = media as CollectionDetailMediaDto & {
    width?: number | null;
    height?: number | null;
    aspectRatio?: number | null;
    blurhash?: string | null;
    dominantColor?: string | null;
  };
  const imageWidth = readPositiveNumber(raw.width) ?? readPositiveNumber(file?.width);
  const imageHeight = readPositiveNumber(raw.height) ?? readPositiveNumber(file?.height);
  const imageAspectRatio =
    readPositiveNumber(raw.aspectRatio) ??
    readPositiveNumber(file?.aspectRatio) ??
    (imageWidth && imageHeight ? imageWidth / imageHeight : undefined);
  return {
    imageWidth,
    imageHeight,
    imageAspectRatio,
    blurhash: asString(raw.blurhash) ?? asString(file?.blurhash),
    dominantColor: asString(raw.dominantColor) ?? asString(file?.dominantColor),
  };
};

const buildDesignMedia = (detail: CollectionDetailDto): ViewerMediaEntry[] => {
  // Prefer the medias array. Cover is only a fallback when medias is empty —
  // prepending cover *and* medias doubled the pager (dots/count) whenever the
  // cover file was the same shot under a different id.
  const fromMedias = (detail.medias ?? []).map((media, index) => ({
    id: `${detail.id}:media:${media.id ?? index}`,
    url: getCollectionMediaDirectUrl(media),
    fileId: getCollectionMediaFileId(media),
    label: media.caption ?? `${detail.title} ${index + 1}`,
    ...getMediaGeometry(media),
  }));

  const entries: ViewerMediaEntry[] =
    fromMedias.length > 0
      ? fromMedias
      : [
          {
            id: `${detail.id}:cover`,
            url: detail.coverImageUrl ?? null,
            fileId: detail.coverMediaId ?? null,
            label: detail.title,
          },
        ];

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.url ?? ''}:${entry.fileId ?? ''}`;
    if ((!entry.url && !entry.fileId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function MediaSlide({
  item,
  width,
  height,
  sourceId,
  sourceType,
  index,
}: {
  item: ViewerMediaEntry;
  width: number;
  height: number;
  sourceId: string;
  sourceType: CommerceSourceType;
  index: number;
}) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const debugContext = useMemo(
    () => ({
      designId: sourceType === 'DESIGN' ? sourceId : undefined,
      productId: sourceType === 'PRODUCT' ? sourceId : undefined,
      fileId: item.fileId ?? undefined,
      mediaIndex: index,
    }),
    [index, item.fileId, sourceId, sourceType],
  );
  const { uri, loading } = useResolvedImageAsset({
    src: item.url,
    fileId: item.fileId,
    enabled: Boolean(item.url || item.fileId),
    debugContext,
  });

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const fallback = (
    <View style={[styles.mediaFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
      <AppText variant="display" tone="muted">{BAG_IT_EMOJI}</AppText>
      <AppText variant="captionBold" tone="muted">Preview unavailable</AppText>
    </View>
  );

  return (
    <View style={[styles.mediaPage, { width, height, backgroundColor: theme.colors.bg }]}>
      {loading && !uri ? (
        <View style={[styles.mediaFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText variant="captionBold" tone="muted">Loading image</AppText>
        </View>
      ) : uri && !failed ? (
        <AspectAwareMedia
          source={{ uri }}
          imageWidth={item.imageWidth}
          imageHeight={item.imageHeight}
          imageAspectRatio={item.imageAspectRatio}
          style={[styles.mediaImage, { width, height }]}
          imageStyle={styles.mediaImage}
          blurhash={item.blurhash}
          dominantColor={item.dominantColor}
          // Viewer pages are full-bleed and stable; a 160ms cross-fade on every
          // strategy settle was reading as a shake on open.
          transition={item.imageAspectRatio || item.imageWidth ? 0 : 120}
          diagnosticsLabel={`MarketCommerceViewer:${sourceType}`}
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </View>
  );
}

export function MarketCommerceViewer({
  sourceType,
  sourceId,
  initialTitle,
  initialBrandId,
  initialBrandName,
  initialPriceLabel,
  initialMediaUrl,
  initialMediaFileId,
  fallbackHref = '/(tabs)/discover',
}: MarketCommerceViewerProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const { status: authStatus, user } = useAuth();
  const { width, height } = useWindowDimensions();
  const chrome = useScreenChrome();
  const mediaRef = useRef<FlatList<ViewerMediaEntry> | null>(null);
  const {
    bagProduct,
    bagSource,
    prepareBag,
    prepareSourceBag,
    loadingByProductId,
  } = useMobileBagging();

  // Seed from React Query cache so returning to a previously viewed item shows
  // content immediately and revalidates in the background (no full-screen loader).
  const initialSourceId = String(sourceId ?? '').trim();
  const productCacheKey = queryKeys.store.product(initialSourceId);
  const designCacheKey = queryKeys.brand.collectionDetail(initialSourceId, 'design');
  const cachedProduct =
    sourceType === 'PRODUCT'
      ? queryClient.getQueryData<StoreProduct>(productCacheKey) ?? null
      : null;
  const cachedDesign =
    sourceType === 'DESIGN'
      ? queryClient.getQueryData<CollectionDetailDto>(designCacheKey) ?? null
      : null;

  const [product, setProduct] = useState<StoreProduct | null>(cachedProduct);
  const [design, setDesign] = useState<CollectionDetailDto | null>(cachedDesign);
  const [bagStatus, setBagStatus] = useState<ProductBagStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [loading, setLoading] = useState(!(cachedProduct || cachedDesign));
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sizeRecommendation, setSizeRecommendation] = useState<SizeRecommendationResponse | null>(null);
  const [sizeRecommendationLoading, setSizeRecommendationLoading] = useState(false);
  const [sizeRecommendationError, setSizeRecommendationError] = useState<string | null>(null);
  const [whySizeOpen, setWhySizeOpen] = useState(false);

  const normalizedSourceId = String(sourceId ?? '').trim();
  const sourceStatusKey = sourceType === 'PRODUCT' ? normalizedSourceId : `${sourceType}:${normalizedSourceId}`;
  const bagBusy = Boolean(loadingByProductId[sourceStatusKey] || busyAction === ACTION_KIND_BAG);
  const expandedSheetHeight = Math.min(440, Math.max(320, Math.round(height * 0.5)));
  // Under Android edge-to-edge `useWindowDimensions().height` EXCLUDES the
  // system bars, so a page sized to it stops short of the gesture bar and the
  // root's own background shows through as a band along the bottom — white in
  // light theme, which read as "an extra padding the phone added". The Runway
  // solves the same problem the same way (`windowHeight + insets.top +
  // insets.bottom`); this screen was the one full-bleed surface still using the
  // bare window height.
  const mediaHeight = height + chrome.insets.top + chrome.insets.bottom;
  // Top-of-media chrome (pagination, in-bag confirmation) now that bag/wishlist/
  // message have moved down to the dock and freed this band.
  const topChromeBaseline = chrome.insets.top + tokens.spacing['3xl'] + tokens.spacing.md;

  // ── Metadata dock: collapse/expand ────────────────────────────────────────
  //
  // `sheetProgress` (0 collapsed → 1 expanded) is the single source of truth for
  // both the height and the content fade, and it lives on the UI thread. The
  // previous version had NO animation at all: `height` jumped between two
  // numbers while the body was conditionally mounted, so expanding was a hard
  // cut plus a layout spike. Reanimated applies layout props on the UI thread,
  // so height can be tweened here without a per-frame JS round trip.
  //
  // The drag maps 1:1 onto the same value, which is what makes the gesture feel
  // attached to the finger rather than being a switch that plays a canned
  // animation on release.
  const sheetProgress = useSharedValue(0);
  const [sheetBodyMounted, setSheetBodyMounted] = useState(false);
  const sheetExpandedRef = useRef(sheetExpanded);
  sheetExpandedRef.current = sheetExpanded;

  const animateSheet = useCallback(
    (expand: boolean) => {
      setSheetExpanded(expand);
      if (expand) setSheetBodyMounted(true);
      // Spring tracks the finger better than a fixed 280ms curve — withTiming
      // felt like a second, delayed motion after the swipe released.
      sheetProgress.value = withSpring(
        expand ? 1 : 0,
        SHEET_SPRING,
        (finished) => {
          // Keep the body mounted for the whole collapse so the closing frames
          // animate real content instead of an empty box.
          if (finished && !expand) runOnJS(setSheetBodyMounted)(false);
        },
      );
    },
    [sheetProgress],
  );

  const toggleSheet = useCallback(() => {
    animateSheet(!sheetExpandedRef.current);
  }, [animateSheet]);

  const collapseSheet = useCallback(() => {
    if (sheetExpandedRef.current) animateSheet(false);
  }, [animateSheet]);

  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        // Vertical intent only, and only past the tap slop — otherwise this
        // swallows taps on the handle and horizontal swipes on the media pager.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          const base = sheetExpandedRef.current ? 1 : 0;
          const travel = Math.max(1, expandedSheetHeight - COLLAPSED_SHEET_HEIGHT);
          // Upward drag (negative dy) opens.
          const next = base - gesture.dy / travel;
          sheetProgress.value = Math.min(1, Math.max(0, next));
        },
        onPanResponderRelease: (_event, gesture) => {
          const flungOpen = gesture.vy < -SHEET_FLING_VELOCITY;
          const flungShut = gesture.vy > SHEET_FLING_VELOCITY;
          if (flungOpen) return animateSheet(true);
          if (flungShut) return animateSheet(false);
          // No decisive fling: settle to whichever end the sheet is nearer.
          animateSheet(sheetProgress.value >= 0.5);
        },
        onPanResponderTerminate: () => animateSheet(sheetExpandedRef.current),
      }),
    [animateSheet, expandedSheetHeight, sheetProgress],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(sheetProgress.value, [0, 1], [COLLAPSED_SHEET_HEIGHT, expandedSheetHeight]),
  }));

  // Collapsed, the sheet has NO surface at all — just the grab handle floating
  // on the media, the way a short-form video player marks its pull-up. The old
  // always-on panel painted a plate the full width of the dock, and because the
  // emoji flanks sit above it the whole row read as one opaque island glued
  // over the photograph. The surface now belongs to the *expanded* state only.
  //
  // It is a separate fading layer rather than an animated `backgroundColor`:
  // `interpolateColor` treats `'transparent'` as fully-transparent BLACK, so
  // tweening from it toward a light surface passes through a grey wash mid-drag.
  const sheetSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetProgress.value, [0, 0.3, 1], [0, 0, 1]),
  }));

  // The collapsed state is the handle alone; the label belongs to the open
  // panel. Fading (not unmounting) keeps the handle band's layout constant.
  const sheetLabelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetProgress.value, [0, 0.6, 1], [0, 0, 1]),
  }));

  // Body fades in earlier (from ~20%) so expand does not feel like an empty
  // growing slab that only populates at the end.
  const sheetBodyAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetProgress.value, [0, 0.2, 0.55, 1], [0, 0, 1, 1]),
  }));

  // Flanking actions stay mounted for the whole expand so they fade under the
  // sheet instead of popping out (the old `{!sheetExpanded ? … : null}` cut).
  const dockFlankAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetProgress.value, [0, 0.35, 0.55], [1, 0.35, 0]),
  }));

  const load = useCallback(async () => {
    if (!normalizedSourceId) {
      setError('This market item is missing an identifier.');
      setLoading(false);
      return;
    }

    const startedAt = Date.now();
    // Only show the full-screen loader when there is nothing cached to render.
    const productKey = queryKeys.store.product(normalizedSourceId);
    const designKey = queryKeys.brand.collectionDetail(normalizedSourceId, 'design');
    const hasCached = Boolean(
      sourceType === 'PRODUCT'
        ? queryClient.getQueryData(productKey)
        : queryClient.getQueryData(designKey),
    );
    setLoading(!hasCached);
    setError(null);
    try {
      if (sourceType === 'PRODUCT') {
        const nextProduct = await queryClient.fetchQuery({
          queryKey: productKey,
          queryFn: () => MobileStoreApi.getProductById(normalizedSourceId),
          staleTime: WIEZ_QUERY_STALE_TIME_MS,
        });
        setProduct(nextProduct);
        setDesign(null);
        setSaved(Boolean(nextProduct.isWishlisted));
        void prepareBag(normalizedSourceId)
          .then((nextStatus) => {
            if (nextStatus) setBagStatus(nextStatus);
          })
          .catch(() => undefined);
        return;
      }

      const nextDesign = await queryClient.fetchQuery({
        queryKey: designKey,
        queryFn: () => brandApi.getCollectionDetail(normalizedSourceId, { scope: 'design' }),
        staleTime: WIEZ_QUERY_STALE_TIME_MS,
      });
      if (!nextDesign) {
        throw new Error('Design unavailable.');
      }
      setProduct(null);
      setDesign(nextDesign);
      void prepareSourceBag('DESIGN', normalizedSourceId)
        .then((nextStatus) => {
          if (nextStatus) setBagStatus(nextStatus);
        })
        .catch(() => undefined);

      if (authStatus === 'authenticated') {
        void SavedItemsApi
          .checkBatch('COLLECTION', [normalizedSourceId])
          .then((savedResult: Record<string, boolean>) => {
            setSaved(Boolean(savedResult[normalizedSourceId]));
          })
          .catch(() => undefined);
      } else {
        setSaved(false);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'This market item is unavailable.');
    } finally {
      setLoading(false);
      logViewerTiming('initial_load', startedAt, {
        sourceType,
        sourceId: normalizedSourceId,
      });
    }
  }, [authStatus, normalizedSourceId, prepareBag, prepareSourceBag, sourceType]);

  useEffect(() => {
    // Shell (media pager + action cluster) renders immediately; the loader is an
    // overlay, so mount == first visible UI here.
    navPerf.screenMounted('product_detail');
    navPerf.shellVisible('product_detail');
    navPerf.firstVisibleUi('product_detail');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && (product || design)) {
      navPerf.dataReady('product_detail');
    }
  }, [loading, product, design]);

  useEffect(() => {
    if (sourceType !== 'PRODUCT' || authStatus !== 'authenticated' || !normalizedSourceId) {
      setSizeRecommendation(null);
      setSizeRecommendationError(null);
      return;
    }
    let active = true;
    setSizeRecommendationLoading(true);
    setSizeRecommendationError(null);
    void MobileStoreApi.getProductSizeRecommendation(normalizedSourceId)
      .then((recommendation) => {
        if (active) setSizeRecommendation(recommendation);
      })
      .catch((error) => {
        const statusCode = Number(error?.response?.status);
        if (active && statusCode !== 404 && statusCode !== 422) {
          setSizeRecommendationError('Size recommendation is temporarily unavailable.');
        }
      })
      .finally(() => {
        if (active) setSizeRecommendationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus, normalizedSourceId, sourceType]);

  const media = useMemo(() => {
    const entries = product ? buildProductMedia(product) : design ? buildDesignMedia(design) : [];
    return entries.length > 0
      ? entries
      : [
          {
            id: EMPTY_MEDIA_ID,
            // Handed down from the tapped card, so the first frame is the image
            // the user just pressed rather than an empty state.
            url: initialMediaUrl ?? null,
            fileId: initialMediaFileId ?? null,
            label: initialTitle ?? 'Market item',
          },
        ];
  }, [design, initialMediaFileId, initialMediaUrl, initialTitle, product]);

  /** A cover was handed in, so there is something real to look at while the detail loads. */
  const hasPreviewFrame = Boolean(initialMediaUrl || initialMediaFileId);

  const title = product?.name ?? design?.title ?? initialTitle ?? 'Market item';
  const brandName =
    product?.brandName ??
    getOwnerName(design?.owner) ??
    initialBrandName ??
    'WIEZ brand';
  const brandId = product?.brandId ?? initialBrandId ?? design?.owner?.id ?? null;
  const description = product?.description ?? design?.description ?? null;
  const productStock = product ? getTotalStock(product) : null;
  const priceLabel = product
    ? formatPrice(getProductPrice(product), product.currency)
    : initialPriceLabel ?? 'Custom quote';
  const canMessageBrand = Boolean(brandId);
  const isOwnBrand =
    Boolean(bagStatus?.userState.isOwner) ||
    Boolean(brandId && (user?.activeBrandId === brandId || user?.storeId === brandId));
  const disabledReason =
    bagStatus?.ui.disabledReason ??
    (isOwnBrand ? 'Owner view cannot bag or message this brand item.' : null);
  const bagDisabled = Boolean(
    loading ||
      bagBusy ||
      (bagStatus && bagStatus.ui.defaultAction === 'DISABLED') ||
      isOwnBrand,
  );
  const actionPriceLabel = priceLabel ? ` - ${priceLabel}` : '';
  const bagLabel = `${BAG_IT_EMOJI} ${BAG_IT_LABEL}${actionPriceLabel}`;

  const productOptions = useMemo(() => {
    if (!product) return [];
    const options: string[] = [];
    if (product.sizes.length > 0) options.push(`Sizes: ${product.sizes.join(', ')}`);
    if (product.colors.length > 0) options.push(`Colors: ${product.colors.join(', ')}`);
    if (product.categoryName) options.push(`Category: ${product.categoryName}`);
    if (product.tags && product.tags.length > 0) options.push(`Tags: ${product.tags.join(', ')}`);
    return options;
  }, [product]);

  const designOptions = useMemo(() => {
    if (!design) return [];
    const options: string[] = [];
    if (typeof design.itemCount === 'number') options.push(`${design.itemCount} item${design.itemCount === 1 ? '' : 's'}`);
    if (design.tags && design.tags.length > 0) options.push(`Tags: ${design.tags.join(', ')}`);
    if (design.isAvailableInStore) options.push('Available for custom request');
    return options;
  }, [design]);

  const stockLabel = product
    ? productStock && productStock > 0
      ? `${productStock} in stock`
      : product.customOrderEnabled
        ? 'Custom-order only'
        : 'Out of stock'
    : bagStatus?.custom.available || design?.isAvailableInStore
      ? 'Custom request available'
      : 'Custom request unavailable';
  const customLabel = bagStatus?.custom.available
    ? bagStatus.custom.freshnessState === 'STALE' ||
      bagStatus.custom.freshnessState === 'VERY_STALE'
      ? 'Fittings need confirmation'
      : bagStatus.custom.fittingState === 'MISSING' || bagStatus.custom.fittingState === 'PARTIAL'
        ? 'Fittings needed'
        : 'Custom bagging ready'
    : sourceType === 'PRODUCT' && product?.customOrderEnabled
      ? 'Checking custom setup'
      : 'Custom bagging unavailable';

  const handleBack = useCallback(() => {
    backOrNavigate(fallbackHref as any);
  }, [fallbackHref]);

  const routePath = sourceType === 'PRODUCT'
    ? `/products/${normalizedSourceId}`
    : `/market-viewer?sourceType=DESIGN&sourceId=${normalizedSourceId}`;

  const requireAuth = useCallback((message: string) => {
    if (authStatus === 'authenticated') return true;
    toast.info(message);
    drillDownPush({ pathname: '/(auth)/login', params: { next: routePath } } as any);
    return false;
  }, [authStatus, routePath, toast]);

  const handleBagPress = useCallback(async () => {
    if (!normalizedSourceId || bagDisabled) {
      if (disabledReason) toast.info(disabledReason);
      return;
    }

    const startedAt = Date.now();
    setBusyAction(ACTION_KIND_BAG);
    try {
      trackMobileEvent('bag_tapped', {
        sourceScreen: 'market_viewer',
        sourceType,
        sourceId: normalizedSourceId,
        productId: sourceType === 'PRODUCT' ? normalizedSourceId : null,
        designId: sourceType === 'DESIGN' ? normalizedSourceId : null,
        eligibilityState: bagStatus?.ui.defaultAction ?? null,
      });
      if (sourceType === 'DESIGN') {
        trackMobileEvent('custom_order_tapped', {
          sourceScreen: 'market_viewer',
          sourceType: 'DESIGN',
          sourceId: normalizedSourceId,
          brandId,
          eligibilityState: bagStatus?.ui.defaultAction ?? null,
        });
      }
      const result = sourceType === 'PRODUCT'
        ? await bagProduct({ id: normalizedSourceId, name: title })
        : await bagSource({
            sourceType: 'DESIGN',
            sourceId: normalizedSourceId,
            name: title,
          });
      if (result?.status) setBagStatus(result.status);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update your bag right now.');
    } finally {
      setBusyAction(null);
      logViewerTiming('bag_action', startedAt, {
        sourceType,
        sourceId: normalizedSourceId,
        defaultAction: bagStatus?.ui.defaultAction ?? null,
      });
    }
  }, [bagDisabled, bagProduct, bagSource, bagStatus?.ui.defaultAction, brandId, disabledReason, normalizedSourceId, sourceType, title, toast]);

  const handleSavePress = useCallback(async () => {
    if (!requireAuth('Sign in to save market items.')) return;
    if (!normalizedSourceId || busyAction === ACTION_KIND_SAVE) return;

    const wasSaved = saved;
    setSaved(!wasSaved);
    setBusyAction(ACTION_KIND_SAVE);
    try {
      if (sourceType === 'PRODUCT') {
        if (wasSaved) await MobileStoreApi.removeFromWishlist(normalizedSourceId);
        else await MobileStoreApi.addToWishlist(normalizedSourceId);
      } else if (wasSaved) {
        await SavedItemsApi.unsaveCatalogTarget({
          targetType: 'DESIGN',
          designId: normalizedSourceId,
          legacyCollectionId: normalizedSourceId,
        });
        trackMobileEvent('design_unsaved', {
          sourceScreen: 'market_viewer',
          targetType: 'DESIGN',
          targetId: normalizedSourceId,
          collectionId: normalizedSourceId,
          brandId,
        });
      } else {
        await SavedItemsApi.saveCatalogTarget({
          targetType: 'DESIGN',
          designId: normalizedSourceId,
          legacyCollectionId: normalizedSourceId,
        });
        trackMobileEvent('design_saved', {
          sourceScreen: 'market_viewer',
          targetType: 'DESIGN',
          targetId: normalizedSourceId,
          collectionId: normalizedSourceId,
          brandId,
        });
      }
      toast.success(
        sourceType === 'PRODUCT'
          ? wasSaved ? 'Removed from wishlist.' : 'Saved to wishlist.'
          : wasSaved ? 'Removed from Saved Looks.' : 'Saved to Saved Looks.',
      );
    } catch (nextError) {
      setSaved(wasSaved);
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update saved items.');
    } finally {
      setBusyAction(null);
    }
  }, [brandId, busyAction, normalizedSourceId, requireAuth, saved, sourceType, toast]);

  const handleMessagePress = useCallback(() => {
    if (!canMessageBrand || !brandId) {
      toast.info('Brand messaging is unavailable for this item.');
      return;
    }
    if (!requireAuth('Sign in to message this brand.')) return;
    if (isOwnBrand) {
      toast.info('Messaging is disabled for your own brand item.');
      return;
    }

    drillDownPush({ pathname: '/messages/[threadId]', params: { threadId: 'resolve', brandId } } as any);
  }, [brandId, canMessageBrand, isOwnBrand, requireAuth, toast]);

  const handleSharePress = useCallback(async () => {
    setBusyAction(ACTION_KIND_SHARE);
    try {
      await Share.share({
        title,
        message: `${title}\n${brandName}\n${routePath}`,
      });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to share this item.');
    } finally {
      setBusyAction(null);
    }
  }, [brandName, routePath, title, toast]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)));
  }, [media.length, width]);

  const renderMedia = useCallback(
    ({ item, index }: { item: ViewerMediaEntry; index: number }) => (
      <MediaSlide
        item={item}
        width={width}
        height={mediaHeight}
        sourceId={normalizedSourceId}
        sourceType={sourceType}
        index={index}
      />
    ),
    [mediaHeight, normalizedSourceId, sourceType, width],
  );

  const renderBagAction = (variant: 'dock' | 'sheet') => (
    <Pressable
      onPress={handleBagPress}
      disabled={bagDisabled}
      style={({ pressed }) => [
        variant === 'dock' ? styles.dockBagAction : styles.sheetBagAction,
        variant === 'dock'
          ? null
          : {
              backgroundColor: bagDisabled ? theme.colors.surfaceAlt : theme.colors.primary,
              borderColor: bagDisabled ? theme.colors.border : theme.colors.primary,
            },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={bagLabel}
    >
      {bagBusy ? (
        <ActivityIndicator color={variant === 'dock' ? theme.colors.textInverse : bagDisabled ? theme.colors.primary : theme.colors.onPrimary} />
      ) : (
        <AppText
          variant={variant === 'dock' ? 'title' : 'captionBold'}
          tone={variant === 'dock' ? 'inverse' : bagDisabled ? 'muted' : 'inverse'}
          numberOfLines={1}
          style={variant === 'dock' ? styles.dockGlyphText : undefined}
        >
          {variant === 'dock' ? BAG_IT_EMOJI : bagLabel}
        </AppText>
      )}
    </Pressable>
  );

  const renderWishlistAction = (variant: 'dock' | 'sheet') => (
    <Pressable
      onPress={handleSavePress}
      disabled={busyAction === ACTION_KIND_SAVE}
      style={({ pressed }) => [
        variant === 'dock' ? styles.dockGlyphAction : styles.sheetInlineAction,
        variant === 'dock'
          ? null
          : { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        sourceType === 'PRODUCT'
          ? saved ? 'Remove from wishlist' : 'Save to wishlist'
          : saved ? 'Remove from Saved Looks' : 'Save look for inspiration'
      }
    >
      <AppText
        variant={variant === 'dock' ? 'title' : 'bodyBold'}
        tone={variant === 'dock' ? 'inverse' : 'default'}
        numberOfLines={1}
        style={variant === 'dock' ? styles.dockGlyphText : undefined}
      >
        {variant === 'dock'
          ? saved ? WISHLIST_EMOJI_ON : WISHLIST_EMOJI_OFF
          : `${saved ? WISHLIST_EMOJI_ON : WISHLIST_EMOJI_OFF}  ${
              sourceType === 'PRODUCT' ? (saved ? 'Wishlisted' : 'Wishlist') : saved ? 'Saved' : 'Save'
            }`}
      </AppText>
    </Pressable>
  );

  const renderMessageAction = (variant: 'dock' | 'sheet') => (
    <Pressable
      onPress={handleMessagePress}
      disabled={!canMessageBrand || busyAction === ACTION_KIND_MESSAGE}
      style={({ pressed }) => [
        variant === 'dock' ? styles.dockGlyphAction : styles.sheetInlineAction,
        variant === 'dock'
          ? { opacity: canMessageBrand ? 1 : 0.5 }
          : {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
              opacity: canMessageBrand ? 1 : 0.62,
            },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Message brand"
    >
      <AppText
        variant={variant === 'dock' ? 'title' : 'bodyBold'}
        tone={variant === 'dock' ? 'inverse' : 'default'}
        numberOfLines={1}
        style={variant === 'dock' ? styles.dockGlyphText : undefined}
      >
        {variant === 'dock' ? MESSAGE_EMOJI : `${MESSAGE_EMOJI}  Message`}
      </AppText>
    </Pressable>
  );

  /**
   * Bottom dock.
   *
   * Collapsed: absolute flanks over a full-width sheet
   *   [💬][🤍]  ——— metadata ———  [👜]
   * Expanded: sheet alone, edge-to-edge of the dock padding (same width as
   * before the flank row was introduced — flanks must NOT steal flex width).
   */
  const renderMetadataDock = () => (
    <View
      style={[styles.bottomDock, { bottom: chrome.immersiveOverlayBottomClearance }]}
      pointerEvents="box-none"
    >
      <Animated.View style={[styles.metadataSheet, sheetAnimatedStyle]}>
        {/* Surface layer — invisible while collapsed, so the handle reads as a
            bare grabber on the media rather than a plate. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheetSurface,
            sheetSurfaceAnimatedStyle,
            {
              backgroundColor: theme.colors.bottomSheetSurface,
              borderColor: theme.colors.border,
            },
          ]}
        />

        {/* The drag lives on the grab strip, NOT the whole panel. Claiming
            vertical gestures across the panel would steal every scroll from the
            details ScrollView once expanded. Collapsed, the strip *is* the whole
            visible sheet, so a swipe anywhere on it still opens it. */}
        <View {...sheetPan.panHandlers}>
          <Pressable
            onPress={toggleSheet}
            hitSlop={12}
            style={styles.sheetHandleWrap}
            accessibilityRole="button"
            accessibilityLabel={sheetExpanded ? 'Collapse details' : 'Expand details'}
            accessibilityHint="Swipe up or down to change the details panel"
          >
            <View
              style={[
                styles.sheetHandle,
                {
                  backgroundColor: sheetExpanded
                    ? theme.colors.bottomSheetHandle
                    : theme.colors.textInverse,
                },
              ]}
            />
            <Animated.View style={sheetLabelAnimatedStyle} pointerEvents="none">
              <AppText variant="captionBold" tone="muted" numberOfLines={1}>
                Details
              </AppText>
            </Animated.View>
          </Pressable>
        </View>

        {sheetBodyMounted ? (
          <Animated.View style={[styles.sheetBody, sheetBodyAnimatedStyle]}>
            <View style={styles.sheetActionRow}>
              {renderWishlistAction('sheet')}
              {renderMessageAction('sheet')}
              {renderBagAction('sheet')}
            </View>
            {renderSheetBody()}
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* Flanks are absolute so they never shrink the sheet's width. */}
      <Animated.View
        style={[styles.dockFlankLeft, dockFlankAnimatedStyle]}
        pointerEvents={sheetExpanded ? 'none' : 'box-none'}
      >
        {renderMessageAction('dock')}
        {renderWishlistAction('dock')}
      </Animated.View>
      <Animated.View
        style={[styles.dockFlankRight, dockFlankAnimatedStyle]}
        pointerEvents={sheetExpanded ? 'none' : 'box-none'}
      >
        {renderBagAction('dock')}
      </Animated.View>
    </View>
  );

  const renderSheetBody = () => (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
        >
          <View style={styles.sheetTitleRow}>
            <View style={styles.sheetTitleCopy}>
              <AppText variant="captionBold" tone="primary" numberOfLines={1}>
                {brandName}
              </AppText>
              <AppText variant="title" numberOfLines={2}>
                {title}
              </AppText>
            </View>
            <View style={[styles.pricePill, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="primary" numberOfLines={1}>
                {priceLabel ?? 'Quote'}
              </AppText>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={[styles.metaCell, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">Stock</AppText>
              <AppText variant="bodyBold" numberOfLines={2}>{stockLabel}</AppText>
            </View>
            <View style={[styles.metaCell, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">Bagging</AppText>
              <AppText variant="bodyBold" numberOfLines={2}>{customLabel}</AppText>
            </View>
          </View>

          {sourceType === 'PRODUCT' && authStatus === 'authenticated' ? (
            <View style={[styles.sizeRecommendationCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <AppText variant="captionBold" tone="muted">Recommended for you</AppText>
              {sizeRecommendationLoading ? (
                <AppText variant="body" tone="secondary">Checking saved measurements...</AppText>
              ) : sizeRecommendation?.recommendedSize ? (
                <>
                  <View style={styles.sizeRecommendationHeader}>
                    <AppText variant="title">{sizeRecommendation.recommendedSize}</AppText>
                    <AppText variant="captionBold" tone="primary">
                      {CONFIDENCE_LABELS[sizeRecommendation.confidenceLabel]}
                    </AppText>
                  </View>
                  {sizeRecommendation.alternativeSize ? (
                    <AppText variant="caption" tone="muted">Alternative: {sizeRecommendation.alternativeSize}</AppText>
                  ) : null}
                  {sizeRecommendation.fallbackUsed ? (
                    <AppText variant="caption" tone="muted">
                      This uses the best available fallback chart because this product does not have a more specific approved chart yet.
                    </AppText>
                  ) : null}
                  {sizeRecommendation.selectedRegion === 'NG_WEST_AFRICA' ? (
                    <AppText variant="caption" tone="muted">
                      Nigeria/West Africa support uses approved product, brand, regional, or mapped chart data where available.
                    </AppText>
                  ) : null}
                  <Pressable
                    onPress={() => setWhySizeOpen((current) => !current)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.inlineLinkButton, pressed && styles.pressed]}
                  >
                    <AppText variant="captionBold" tone="primary">
                      {WHY_SIZE_EMOJI} Why this size?
                    </AppText>
                  </Pressable>
                  {whySizeOpen ? (
                    <View style={styles.whySizeBlock}>
                      <AppText variant="caption" tone="muted">
                        Region: {SIZING_REGION_LABELS[sizeRecommendation.selectedRegion]}
                      </AppText>
                      {(sizeRecommendation.reasons.length ? sizeRecommendation.reasons : ['WIEZ compared your saved measurements with approved chart ranges.']).map((reason) => (
                        <AppText key={reason} variant="caption">- {reason}</AppText>
                      ))}
                      <AppText variant="caption" tone="muted">
                        Size charts are guides. Fit may vary by brand, fabric, and cut.
                      </AppText>
                    </View>
                  ) : null}
                </>
              ) : (
                <AppText variant="body" tone={sizeRecommendationError ? 'warning' : 'muted'}>
                  {sizeRecommendationError || 'Add your measurements to get size recommendations.'}
                </AppText>
              )}
            </View>
          ) : null}

          {description ? (
            <View style={styles.detailBlock}>
              <AppText variant="bodyBold">Details</AppText>
              <AppText variant="body" tone="secondary">{description}</AppText>
            </View>
          ) : null}

          <View style={styles.detailBlock}>
            <AppText variant="bodyBold">Options</AppText>
            {[...productOptions, ...designOptions].length > 0 ? (
              [...productOptions, ...designOptions].map((option) => (
                <AppText key={option} variant="body" tone="secondary">{option}</AppText>
              ))
            ) : (
              <AppText variant="body" tone="muted">No size, color, or product option details are listed.</AppText>
            )}
          </View>

          <View style={styles.detailBlock}>
            <AppText variant="bodyBold">Fittings</AppText>
            <AppText variant="body" tone="secondary">
              {bagStatus
                ? `${bagStatus.custom.freshnessState} / ${bagStatus.custom.fittingState}`
                : 'Eligibility will be checked before bagging.'}
            </AppText>
            {disabledReason ? (
              <AppText variant="captionBold" tone="warning">{disabledReason}</AppText>
            ) : null}
          </View>

          {sourceType === 'PRODUCT' && sheetExpanded ? (
            <View style={styles.reviewSummaryWrap}>
              {/* Only fetch reviews while the sheet is open — remounting the
                  compact tab on every parent re-render was hammering
                  /reviews/product (7× in one open session in the logs). */}
              <ReviewsTab productId={normalizedSourceId} compact enabled={sheetExpanded} />
            </View>
          ) : null}

          {sourceType === 'PRODUCT' ? (
            <View style={styles.detailBlock}>
              <Pressable
                onPress={() => setSuggestionsExpanded(!suggestionsExpanded)}
                style={({ pressed }) => [styles.suggestionsToggle, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={suggestionsExpanded ? "Hide similar pieces" : "Show similar pieces"}
              >
                <AppText variant="bodyBold">Similar pieces</AppText>
                <AppText variant="bodyBold" tone="muted">{suggestionsExpanded ? '−' : '+'}</AppText>
              </Pressable>
              {suggestionsExpanded ? (
                <MobileMarketSuggestionBlocks
                  context="PRODUCT_DETAIL"
                  targetType="PRODUCT"
                  targetId={normalizedSourceId}
                  surface="PRODUCT_DETAIL"
                  screenContext="PRODUCT_DETAIL"
                  style={styles.suggestionBlocks}
                />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
  );

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: VIEWER_STAGE_MATTE }]}>
      <StatusBar style="light" />

      <FlatList
        ref={mediaRef}
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderMedia}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollToIndexFailed={() => undefined}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        scrollEnabled={media.length > 1}
      />

      <LinearGradient
        pointerEvents="none"
        colors={[theme.colors.backdropStrong, theme.colors.backdrop, 'transparent']}
        style={[styles.topGradient, { height: Math.max(150, chrome.insets.top + 112) }]}
      />

      {/* Bottom scrim. With the dock's plate gone the bare emojis and grabber
          have to read over whatever photograph is behind them; a gradient is
          the affordance that buys that contrast WITHOUT reintroducing a bounded
          box. Mirrors `topGradient`. */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', theme.colors.backdrop, theme.colors.backdropStrong]}
        style={[
          styles.bottomScrim,
          { height: chrome.immersiveOverlayBottomClearance + COLLAPSED_SHEET_HEIGHT + tokens.spacing.xl },
        ]}
      />

      <View style={[styles.topControls, { top: chrome.insets.top + tokens.spacing.md }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButtonBare, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <AppText variant="title" tone="inverse" style={styles.dockGlyphText}>
            {BACK_EMOJI}
          </AppText>
        </Pressable>

        <Pressable
          onPress={handleSharePress}
          disabled={busyAction === ACTION_KIND_SHARE}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButtonBare, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <AppText variant="title" tone="inverse" style={styles.dockGlyphText}>
            ↗️
          </AppText>
        </Pressable>
      </View>

      {media.length > 1 ? (
        <View style={[styles.paginationDots, { top: topChromeBaseline }]} pointerEvents="none">
          {media.map((entry, index) => (
            <View
              key={entry.id}
              style={[
                styles.paginationDot,
                {
                  opacity: index === activeIndex ? 1 : 0.38,
                  width: index === activeIndex ? 16 : 6,
                  backgroundColor: theme.colors.textInverse,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      {bagStatus?.standard.inBag || bagStatus?.custom.alreadyBagged ? (
        <View
          style={[
            styles.inBagPill,
            {
              top: topChromeBaseline,
              backgroundColor: theme.colors.glassSurfaceStrong,
              borderColor: theme.colors.glassBorder,
            },
          ]}
          pointerEvents="none"
        >
          <AppText variant="captionBold" tone="default">Already in My Bag</AppText>
        </View>
      ) : null}

      {/* Tap-outside-to-collapse. Only mounted while the sheet is open, so it
          never sits between the user and the media pager. */}
      {sheetExpanded ? (
        <Pressable
          style={styles.sheetDismissLayer}
          onPress={collapseSheet}
          accessibilityRole="button"
          accessibilityLabel="Collapse details"
        />
      ) : null}

      {renderMetadataDock()}

      {/* The blocking loader is only for a cold open with nothing to show. When
          the caller handed down the tapped card's cover, that image IS the
          screen while the detail request finishes — covering it with a spinner
          is what made opening content feel like a second of dead time. */}
      {loading && !hasPreviewFrame ? (
        <View style={[styles.stateOverlay, { backgroundColor: theme.colors.backdrop }]}>
          <ActivityIndicator color={theme.colors.textInverse} />
          <AppText variant="bodyBold" tone="inverse">Loading market item</AppText>
        </View>
      ) : error ? (
        <View style={[styles.stateOverlay, { backgroundColor: theme.colors.backdropStrong }]}>
          <AppText variant="subtitle" tone="inverse">Item unavailable</AppText>
          <AppText variant="body" tone="inverse">{error}</AppText>
          <Pressable
            onPress={() => void load()}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="bodyBold">Retry</AppText>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mediaPage: {
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: {
    flex: 1,
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
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  topControls: {
    position: 'absolute',
    left: tokens.spacing.lg,
    right: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonBare: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  paginationDots: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 20,
  },
  paginationDot: {
    height: 6,
    borderRadius: tokens.radius.full,
  },
  inBagPill: {
    position: 'absolute',
    alignSelf: 'center',
    minHeight: 30,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDismissLayer: {
    ...StyleSheet.absoluteFill,
  },
  bottomDock: {
    position: 'absolute',
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    // Sheet is full dock width; flanks float over it via absolute position so
    // expand never narrows the panel.
  },
  dockFlankLeft: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  dockFlankRight: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Emoji-only dock glyphs: no glass plate, no border. A frosted chip behind
  // the emoji made the actions read as broken links over the photograph.
  //
  // With no plate the glyphs have to earn their own contrast, so they carry a
  // soft drop shadow (the standard trick for bare controls over unpredictable
  // photography). `textShadow*` is not in AppText's forbidden-style list —
  // only typography and colour must come from variant/tone.
  dockGlyphText: {
    textShadowColor: VIEWER_GLYPH_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dockGlyphAction: {
    width: 44,
    height: COLLAPSED_SHEET_HEIGHT,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  dockBagAction: {
    width: 52,
    height: COLLAPSED_SHEET_HEIGHT,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  metadataSheet: {
    width: '100%',
    // Radii stay on the clipping container so the expanded body is cut to the
    // same rounded shape the surface layer paints. Harmless while collapsed —
    // the container itself is transparent.
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderBottomLeftRadius: tokens.radius.lg,
    borderBottomRightRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  // Painted separately from `metadataSheet` so it can fade independently of the
  // handle and body (see `sheetSurfaceAnimatedStyle`).
  sheetSurface: {
    ...StyleSheet.absoluteFill,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    borderBottomLeftRadius: tokens.radius.lg,
    borderBottomRightRadius: tokens.radius.lg,
    borderWidth: 1,
  },
  sheetHandleWrap: {
    height: COLLAPSED_SHEET_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // Clears the absolute-positioned emoji flanks so the grabber stays centered
    // in the free middle band of the full-width sheet.
    paddingHorizontal: 96,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: tokens.radius.full,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  sheetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.sm,
  },
  sheetInlineAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  sheetBagAction: {
    flex: 1.1,
    minHeight: 40,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  sheetContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  sheetTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  pricePill: {
    maxWidth: 142,
    minHeight: 34,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  metaCell: {
    flex: 1,
    minHeight: 78,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  sizeRecommendationCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  sizeRecommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  inlineLinkButton: {
    alignSelf: 'flex-start',
    paddingVertical: tokens.spacing.xs,
  },
  whySizeBlock: {
    gap: tokens.spacing.xs,
  },
  detailBlock: {
    gap: tokens.spacing.xs,
  },
  suggestionsToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  reviewSummaryWrap: {
    gap: tokens.spacing.sm,
  },
  suggestionBlocks: {
    marginTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

export default MarketCommerceViewer;
