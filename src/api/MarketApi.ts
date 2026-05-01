import type { AxiosRequestConfig } from 'axios';

import { apiClient } from '@/src/api/httpClient';
import type { MarketFeedResponse } from '@/src/types/market';
import type { MarketItem, MarketMediaType } from '@/src/types/market';

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

type RawMarketItem = Record<string, unknown>;

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

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

const FALLBACK_FILTER_TAGS = ['streetwear', 'haute couture', 'sustainable'];

const toFilterLabel = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const toMarketItem = (raw: RawMarketItem): MarketItem => {
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

  const mediaType =
    (raw.mediaType as MarketMediaType) ??
    (((media as any).mediaType || (media as any).type) as MarketMediaType) ??
    'POST_IMAGE';

  const num = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
    return null;
  };

  return {
    id: String(raw.id ?? mediaFileId ?? ''),
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
    minPrice: num((collection as any).minPrice) ?? num((raw as any).minPrice),
    maxPrice: num((collection as any).maxPrice) ?? num((raw as any).maxPrice),
    saleMinPrice: num((collection as any).saleMinPrice ?? (raw as any).saleMinPrice),
    saleMaxPrice: num((collection as any).saleMaxPrice ?? (raw as any).saleMaxPrice),
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
  const items = rawItems.map((item) => {
    const mapped = toMarketItem(item);
    if (typeof (item as any).combinedCommentsCount === 'number') {
      mapped.commentsCount = (item as any).combinedCommentsCount as number;
    }
    return mapped;
  });

  return {
    items,
    hasNextPage: Boolean((data as any).hasNextPage ?? items.length > 0),
    nextCursor: ((data as any).nextCursor as string | null | undefined) ?? null,
  };
}

export async function getMarketFilterChips(): Promise<MarketFilterChip[]> {
  try {
    const response = await apiClient.get('/tags/trending', {
      params: {
        window: '7d',
        limit: 3,
      },
    });
    const data = unwrapData<{ items?: Array<{ name?: string | null }> }>(response.data);
    const tags = Array.isArray(data?.items)
      ? data.items
          .map((item) => (typeof item?.name === 'string' ? item.name.trim() : ''))
          .filter(Boolean)
      : [];
    const uniqueTags = Array.from(new Set(tags)).slice(0, 3);

    const sourceTags = uniqueTags.length ? uniqueTags : FALLBACK_FILTER_TAGS;
    return [
      { id: 'all', label: 'All', tag: null },
      ...sourceTags.map((tag) => ({
        id: tag.toLowerCase(),
        label: toFilterLabel(tag),
        tag,
      })),
    ];
  } catch {
    return [
      { id: 'all', label: 'All', tag: null },
      ...FALLBACK_FILTER_TAGS.map((tag) => ({
        id: tag.replace(/\s+/g, '-'),
        label: toFilterLabel(tag),
        tag,
      })),
    ];
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
