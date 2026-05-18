import type { AxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';

import { apiClient } from '@/src/api/httpClient';
import { feedContractDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { resolveCatalogEntityType } from '@/src/features/catalog/catalogEntity';
import type { MarketFeedResponse } from '@/src/types/market';
import type { FeedMediaAsset, MarketFeedBrand, MarketItem, MarketMediaType } from '@/src/types/market';

export type GetMarketFeedParams = {
  cursor?: string | null;
  limit?: number;
  tag?: string | null;
  counts?: 'combined' | undefined;
};

export type MarketFilterChip = {
  id: string;
  label: string;
  tag: string | null;
};

type MarketFilterPreference = {
  dimensionSlug: string;
  valueSlug: string;
  label: string;
  tag: string;
};

type RawMarketItem = Record<string, unknown>;
type DropReason =
  | 'missing id'
  | 'missing primaryMedia'
  | 'missing displayUrl'
  | 'invalid media status'
  | 'invalid aspectRatio'
  | 'unsupported media type'
  | 'missing collectionId'
  | 'invalid displayUrl';

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

let currentDropReasons: Partial<Record<DropReason, number>> | null = null;

const isStrictDtoShape = (raw: RawMarketItem) =>
  raw.primaryMedia !== undefined || raw.mediaItems !== undefined || raw.sourceType === 'DESIGN';

const summarizeUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1';
    const isPrivateLan =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    return {
      protocol: parsed.protocol,
      hostname,
      isLoopback,
      isPrivateLan,
      isS3: hostname.includes('amazonaws.com') || hostname.includes('.s3.'),
      isSigned:
        parsed.searchParams.has('X-Amz-Signature') ||
        parsed.searchParams.has('Signature') ||
        parsed.searchParams.has('Expires') ||
        parsed.searchParams.has('token'),
    };
  } catch {
    return null;
  }
};

const isUsableFeedDisplayUrl = (value: string, item: RawMarketItem, mediaId: string) => {
  const summary = summarizeUrl(value);
  if (!summary || (summary.protocol !== 'http:' && summary.protocol !== 'https:')) {
    return false;
  }

  if (summary.isLoopback) {
    if (__DEV__) {
      console.warn('[feed-contract]', {
        event: 'loopback-display-url-rejected',
        id: asString(item.id),
        collectionId: asString(item.collectionId),
        mediaId,
        hostname: summary.hostname,
        platform: Platform.OS,
      });
    }
    return false;
  }

  if (__DEV__ && summary.isPrivateLan) {
    console.warn('[feed-contract]', {
      event: 'private-lan-display-url',
      id: asString(item.id),
      collectionId: asString(item.collectionId),
      mediaId,
      hostname: summary.hostname,
      platform: Platform.OS,
    });
  }

  return true;
};

const warnDroppedFeedItem = (reason: DropReason, item: RawMarketItem) => {
  if (currentDropReasons) {
    currentDropReasons[reason] = (currentDropReasons[reason] ?? 0) + 1;
  }
  if (!__DEV__) return;
  console.warn('[feed-contract]', {
    event: 'dropped-item',
    reason,
    id: asString(item.id),
    collectionId: asString(item.collectionId),
  });
};

const parseFeedMediaAsset = (value: unknown, item: RawMarketItem): { asset: FeedMediaAsset | null; reason?: DropReason } => {
  const media = asRecord(value);
  if (!Object.keys(media).length) return { asset: null, reason: 'missing primaryMedia' };

  const id = asString(media.id);
  if (!id) return { asset: null, reason: 'missing id' };

  const displayUrl = asString(media.displayUrl);
  if (!displayUrl) return { asset: null, reason: 'missing displayUrl' };
  if (!isUsableFeedDisplayUrl(displayUrl, item, id)) return { asset: null, reason: 'invalid displayUrl' };

  const status = asString(media.status);
  if (status !== 'READY') return { asset: null, reason: 'invalid media status' };

  const type = asString(media.type);
  if (type !== 'IMAGE' && type !== 'VIDEO') return { asset: null, reason: 'unsupported media type' };

  const aspectRatio = asNumber(media.aspectRatio);
  if (!aspectRatio || aspectRatio <= 0) return { asset: null, reason: 'invalid aspectRatio' };

  return {
    asset: {
      id,
      fileId: asString(media.fileId),
      type,
      displayUrl,
      thumbnailUrl: asString(media.thumbnailUrl),
      previewUrl: asString(media.previewUrl),
      blurHash: asString(media.blurHash),
      dominantColor: asString(media.dominantColor),
      width: asNumber(media.width),
      height: asNumber(media.height),
      aspectRatio,
      status: 'READY',
      orderIndex: asNumber(media.orderIndex) ?? 0,
    },
  };
};

const mapStrictAssetToLegacyMedia = (asset: FeedMediaAsset) => ({
  fileId: asset.fileId ?? '',
  url: asset.displayUrl,
  previewUrl: asset.previewUrl ?? asset.thumbnailUrl ?? asset.displayUrl,
  type: asset.type === 'VIDEO' ? 'POST_VIDEO' : 'POST_IMAGE',
  aspectRatio: asset.aspectRatio,
  createdAt: null,
});

export const parseStrictMarketFeedItem = (raw: RawMarketItem): MarketItem | null => {
  const id = asString(raw.id);
  if (!id) {
    warnDroppedFeedItem('missing id', raw);
    return null;
  }

  const collectionId = asString(raw.collectionId);
  if (!collectionId) {
    warnDroppedFeedItem('missing collectionId', raw);
    return null;
  }

  const primaryResult = parseFeedMediaAsset(raw.primaryMedia, raw);
  if (!primaryResult.asset) {
    warnDroppedFeedItem(primaryResult.reason ?? 'missing primaryMedia', raw);
    return null;
  }

  const rawMediaItems = Array.isArray(raw.mediaItems) ? raw.mediaItems : [];
  const mediaItems = rawMediaItems
    .map((entry) => parseFeedMediaAsset(entry, raw).asset)
    .filter((asset): asset is FeedMediaAsset => Boolean(asset));

  if (mediaItems.length === 0) {
    mediaItems.push(primaryResult.asset);
  }

  const brandRecord = asRecord(raw.brand);
  const brandId = asString(brandRecord.id);
  const brand: MarketFeedBrand = {
    id: brandId ?? '',
    name: asString(brandRecord.name) ?? asString(raw.brandName) ?? 'Brand',
    username: asString(brandRecord.username),
    avatar: parseFeedMediaAsset(brandRecord.avatar, raw).asset,
  };

  const stats = asRecord(raw.stats);
  const viewerState = asRecord(raw.viewerState);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => asString(tag)).filter((tag): tag is string => Boolean(tag))
    : [];

  return {
    id,
    entityType: resolveCatalogEntityType(raw, 'DESIGN') ?? 'DESIGN',
    collectionId,
    sourceType: asString(raw.sourceType) as MarketItem['sourceType'],
    title: asString(raw.title) ?? '',
    description: asString(raw.description),
    brand,
    primaryMedia: primaryResult.asset,
    mediaItems,
    stats: {
      likes: asNumber(stats.likes) ?? 0,
      comments: asNumber(stats.comments) ?? 0,
      threads: asNumber(stats.threads) ?? 0,
      patches: asNumber(stats.patches) ?? undefined,
    },
    viewerState: {
      isLiked: asBoolean(viewerState.isLiked),
      isThreaded: asBoolean(viewerState.isThreaded),
      isPatched: asBoolean(viewerState.isPatched),
      canBag: asBoolean(viewerState.canBag),
      isBagged: asBoolean(viewerState.isBagged),
    },
    createdAt: asString(raw.createdAt) ?? undefined,
    updatedAt: asString(raw.updatedAt) ?? undefined,
    collectionTitle: asString(raw.title) ?? '',
    collectionDescription: asString(raw.description),
    brandId: brand.id,
    brandName: brand.name,
    username: brand.username,
    brandLogo: brand.avatar?.displayUrl ?? null,
    brandLogoFileId: brand.avatar?.fileId ?? null,
    threadsCount: asNumber(stats.threads),
    likesCount: asNumber(stats.likes),
    commentsCount: asNumber(stats.comments),
    combinedCommentsCount: asNumber(stats.comments),
    patchesCount: asNumber(stats.patches),
    tags,
    isLiked: asBoolean(viewerState.isLiked),
    isThreaded: asBoolean(viewerState.isThreaded),
    media: mapStrictAssetToLegacyMedia(primaryResult.asset),
  };
};

const isFileLikeRecord = (value: Record<string, unknown>) =>
  Boolean(
    asString(value.key) ||
      asString(value.fileName) ||
      asString(value.originalName) ||
      asString(value.mimeType) ||
      asString(value.fileType),
  );

const unwrapPayload = <T,>(payload: unknown): T | unknown => {
  if (!payload || typeof payload !== 'object') return payload;
  const obj = payload as Record<string, unknown>;
  if ('data' in obj) return obj.data as unknown;
  return payload;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  const unwrapped = unwrapPayload<T>(payload);
  return (unwrapped ?? null) as T | null;
};

export const DEFAULT_MARKET_FILTER_CHIPS: MarketFilterChip[] = [
  { id: 'discover-for-you', label: 'Discover for you', tag: null },
  { id: 'explore', label: 'Explore', tag: null },
  { id: 'african-culture', label: 'African culture', tag: 'african-fashion' },
  { id: 'casual', label: 'Casual', tag: 'casual-style' },
];

const MARKET_FILTER_PREFERENCES: MarketFilterPreference[] = [
  { dimensionSlug: 'heritage', valueSlug: 'african-cultural', label: 'African culture', tag: 'african-fashion' },
  { dimensionSlug: 'style', valueSlug: 'casual-streetwear', label: 'Casual', tag: 'casual-style' },
  { dimensionSlug: 'fabric', valueSlug: 'ankara', label: 'Ankara', tag: 'ankara-fashion' },
  { dimensionSlug: 'heritage', valueSlug: 'afro-modern', label: 'Afro-modern', tag: 'afro-modern' },
  { dimensionSlug: 'occasion', valueSlug: 'owambe-party', label: 'Owambe', tag: 'owambe' },
  { dimensionSlug: 'style', valueSlug: 'contemporary', label: 'Contemporary', tag: 'contemporary-style' },
];

type RawCategoryFilterValue = {
  slug?: string | null;
  label?: string | null;
  name?: string | null;
};

type RawCategoryFilterDimension = {
  slug?: string | null;
  label?: string | null;
  values?: RawCategoryFilterValue[];
};

type RawCategoryFiltersResponse = {
  dimensions?: RawCategoryFilterDimension[];
  items?: RawCategoryFilterDimension[];
};

type RawCategoryFiltersPayload = RawCategoryFilterDimension[] | RawCategoryFiltersResponse | null;

const normalizeSlug = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;

const mapSeededFiltersToChips = (payload: RawCategoryFiltersPayload): MarketFilterChip[] => {
  const dimensions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.dimensions)
      ? payload.dimensions
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  const chips = MARKET_FILTER_PREFERENCES.flatMap((preference) => {
    const dimension = dimensions.find((candidate) => normalizeSlug(candidate.slug) === preference.dimensionSlug);
    const values = Array.isArray(dimension?.values) ? dimension.values : [];
    const value = values.find((candidate) => normalizeSlug(candidate.slug) === preference.valueSlug);
    if (!value) return [];
    return {
      id: normalizeSlug(value.slug) ?? preference.valueSlug,
      label: preference.label,
      tag: preference.tag,
    };
  });
  const uniqueChips = Array.from(new Map(chips.map((chip) => [chip.id, chip])).values());
  return uniqueChips.length > 0
    ? [
        DEFAULT_MARKET_FILTER_CHIPS[0],
        DEFAULT_MARKET_FILTER_CHIPS[1],
        ...uniqueChips,
      ]
    : DEFAULT_MARKET_FILTER_CHIPS;
};

export const normalizeLegacyMarketFeedItem = (raw: RawMarketItem): MarketItem | null => {
  const collection = asRecord(raw.collection);
  const owner = asRecord(collection.owner);
  const media = asRecord(raw.media ?? raw.file ?? raw);
  const mediaFile = asRecord(media.file);

  const rawTags = Array.isArray(raw.tags)
    ? (raw.tags as unknown[]).map((tag) => (typeof tag === 'string' ? tag : '')).filter(Boolean)
    : [];

  const collectionTags = Array.isArray(collection.tags)
    ? (collection.tags as unknown[]).map((tag) => (typeof tag === 'string' ? tag : '')).filter(Boolean)
    : [];

  const tags = collectionTags.length ? collectionTags : rawTags;

  const mediaFileId =
    asString(media.fileId) ??
    asString(media.fileUploadId) ??
    asString(media.uploadFileId) ??
    asString(mediaFile.fileId) ??
    asString(mediaFile.id) ??
    asString(raw.mediaFileId) ??
    asString(raw.fileUploadId) ??
    asString(raw.uploadFileId) ??
    (isFileLikeRecord(media) ? asString(media.id) : null) ??
    '';

  const mediaUrl =
    asString(media.url) ??
    asString((media as any).secureUrl) ??
    asString((media as any).s3Url) ??
    asString(media.previewUrl) ??
    asString(mediaFile.url) ??
    asString(mediaFile.secureUrl) ??
    asString(mediaFile.s3Url) ??
    asString(raw.mediaUrl) ??
    undefined;

  if (!asString(raw.id) && !mediaFileId) {
    warnDroppedFeedItem('missing id', raw);
    return null;
  }
  if (!asString(raw.collectionId) && !asString(collection.id)) {
    warnDroppedFeedItem('missing collectionId', raw);
    return null;
  }
  if (!asString(mediaUrl)) {
    warnDroppedFeedItem('missing displayUrl', raw);
    return null;
  }

  const mediaType =
    (raw.mediaType as MarketMediaType) ??
    (((media as any).mediaType || (media as any).type) as MarketMediaType) ??
    'POST_IMAGE';

  return {
    id: String(raw.id ?? mediaFileId ?? ''),
    entityType: resolveCatalogEntityType(raw, 'DESIGN') ?? 'DESIGN',
    collectionId: String(raw.collectionId ?? collection.id ?? ''),
    collectionTitle: String((collection as any).title ?? raw.collectionTitle ?? ''),
    collectionDescription:
      typeof (collection as any).description === 'string'
        ? ((collection as any).description as string)
        : typeof raw.collectionDescription === 'string'
          ? (raw.collectionDescription as string)
          : null,
    brandId: String((raw as any).brandId ?? owner.id ?? ''),
    brandName:
      ((owner as any).brandFullName as string) ??
      ((owner as any).brandName as string) ??
      ((raw as any).brandName as string) ??
      ((owner as any).username as string) ??
      null,
    username: ((owner as any).username as string) ?? ((raw as any).username as string) ?? null,
    brandLogo: ((owner as any).profileImage as string) ?? ((raw as any).brandLogo as string) ?? null,
    brandLogoFileId:
      ((owner as any).profileImageId as string) ??
      ((((owner as any).profileImageFile as Record<string, unknown> | undefined)?.id as string | undefined) ?? undefined) ??
      (((raw as any).brandLogoFileId as string | undefined) ?? undefined) ??
      null,
    minPrice: asNumber((collection as any).minPrice) ?? asNumber((raw as any).minPrice),
    maxPrice: asNumber((collection as any).maxPrice) ?? asNumber((raw as any).maxPrice),
    saleMinPrice: asNumber((collection as any).saleMinPrice ?? (raw as any).saleMinPrice),
    saleMaxPrice: asNumber((collection as any).saleMaxPrice ?? (raw as any).saleMaxPrice),
    saleStartAt:
      typeof (collection as any).saleStartAt === 'string'
        ? ((collection as any).saleStartAt as string)
        : typeof (raw as any).saleStartAt === 'string'
          ? ((raw as any).saleStartAt as string)
          : null,
    saleEndAt:
      typeof (collection as any).saleEndAt === 'string'
        ? ((collection as any).saleEndAt as string)
        : typeof (raw as any).saleEndAt === 'string'
          ? ((raw as any).saleEndAt as string)
          : null,
    threadsCount:
      typeof (raw as any).threadsCount === 'number'
        ? ((raw as any).threadsCount as number)
        : typeof (collection as any).threadsCount === 'number'
          ? ((collection as any).threadsCount as number)
          : null,
    likesCount:
      typeof (raw as any).likesCount === 'number'
        ? ((raw as any).likesCount as number)
        : typeof (collection as any).likesCount === 'number'
          ? ((collection as any).likesCount as number)
          : null,
    commentsCount:
      typeof (raw as any).commentsCount === 'number'
        ? ((raw as any).commentsCount as number)
        : typeof (collection as any).commentsCount === 'number'
          ? ((collection as any).commentsCount as number)
          : null,
    combinedCommentsCount:
      typeof (raw as any).combinedCommentsCount === 'number' ? ((raw as any).combinedCommentsCount as number) : null,
    patchesCount:
      typeof (collection as any).patchesCount === 'number'
        ? ((collection as any).patchesCount as number)
        : typeof (raw as any).patchesCount === 'number'
          ? ((raw as any).patchesCount as number)
          : null,
    tags,
    isLiked: typeof (raw as any).isLiked === 'boolean' ? ((raw as any).isLiked as boolean) : false,
    isThreaded: typeof (raw as any).isThreaded === 'boolean' ? ((raw as any).isThreaded as boolean) : false,
    media: {
      fileId: mediaFileId || '',
      url: mediaUrl,
      previewUrl:
        asString((media as any).previewUrl) ??
        asString((raw as any).previewUrl) ??
        mediaUrl,
      type: mediaType,
      aspectRatio:
        typeof (media as any).aspectRatio === 'number'
          ? ((media as any).aspectRatio as number)
          : typeof (raw as any).aspectRatio === 'number'
            ? ((raw as any).aspectRatio as number)
            : null,
      createdAt:
        typeof (media as any).createdAt === 'string'
          ? ((media as any).createdAt as string)
          : typeof (raw as any).createdAt === 'string'
            ? ((raw as any).createdAt as string)
            : null,
    },
  };
};

export async function getMarketFeed(params?: GetMarketFeedParams, config?: AxiosRequestConfig): Promise<MarketFeedResponse> {
  feedContractDevLog('fetch-started', {
    cursor: params?.cursor ?? null,
    tag: params?.tag ?? null,
    limit: params?.limit ?? 20,
  });
  const response = await apiClient.get('/collections/market', {
    ...config,
    params: {
      cursor: params?.cursor ?? undefined,
      limit: params?.limit ?? 20,
      tag: params?.tag ?? undefined,
      counts: params?.counts ?? 'combined',
      ...(config?.params ?? {}),
    },
  });

  const unwrapped = unwrapPayload<unknown>(response.data);
  const data = (unwrapped ?? response.data) as MarketFeedResponse & { items?: RawMarketItem[] };
  const rawItems = data && Array.isArray((data as any).items) ? ((data as any).items as RawMarketItem[]) : [];
  const previousDropReasons = currentDropReasons;
  currentDropReasons = {};
  const items = rawItems
    .map((item) => {
      const strictItem = parseStrictMarketFeedItem(item);
      const mapped = strictItem ?? (isStrictDtoShape(item) ? null : normalizeLegacyMarketFeedItem(item));
      if (!mapped) return null;
      if (typeof (item as any).combinedCommentsCount === 'number') {
        mapped.commentsCount = (item as any).combinedCommentsCount as number;
      }
      return mapped;
    })
    .filter((item): item is MarketItem => Boolean(item));
  const dropReasons = currentDropReasons;
  currentDropReasons = previousDropReasons;

  feedContractDevLog('fetch-completed', {
    pageCount: rawItems.length,
    validItemCount: items.length,
    droppedItemCount: rawItems.length - items.length,
    dropReasons,
    hasNextPage: Boolean((data as any).hasNextPage ?? items.length > 0),
  });

  return {
    items,
    hasNextPage: Boolean((data as any).hasNextPage ?? items.length > 0),
    nextCursor: ((data as any).nextCursor as string | null | undefined) ?? null,
  };
}

export async function getMarketFilterChips(): Promise<MarketFilterChip[]> {
  try {
    const response = await apiClient.get('/categories/filters');
    const data = unwrapData<RawCategoryFiltersPayload>(response.data);
    return mapSeededFiltersToChips(data);
  } catch {
    return DEFAULT_MARKET_FILTER_CHIPS;
  }
}

export async function toggleCollectionMediaThread(mediaId: string): Promise<{ threaded: boolean; threads: number }> {
  const response = await apiClient.post(`/collections/media/${mediaId}/reaction/thread`);
  const data = unwrapData<{ threaded?: boolean; threads?: number }>(response.data) ?? {};
  return {
    threaded: Boolean(data.threaded),
    threads: typeof data.threads === 'number' ? data.threads : 0,
  };
}
