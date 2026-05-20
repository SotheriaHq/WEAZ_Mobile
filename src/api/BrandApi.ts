/**
 * Brand API - Mobile
 * Handles all brand-related API calls for catalog, collections, profile management
 */

import { apiClient } from './httpClient';
import type { CatalogEntityType } from '@/src/features/catalog/catalogDomain';
import { resolveCatalogEntityType } from '@/src/features/catalog/catalogEntity';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface BrandProfileDto {
  id: string;
  brandFullName: string | null;
  brandDescription: string | null;
  description?: string | null;
  isStoreOpen?: boolean | null;
  storeStatus?: 'OPEN' | 'CLOSED' | 'PENDING_VERIFICATION' | 'UNAVAILABLE' | null;
  emailVerified?: boolean | null;
  verified?: boolean | null;
  verificationStatus?: string | null;
  verificationBadgeVisible?: boolean | null;
  verifiedExplanationUrl?: string | null;
  averageRating?: number | null;
  totalReviews?: number | null;
  collectionsCount?: number | null;
  designsCount?: number | null;
  productsCount?: number | null;
  patchesCount?: number | null;
  followersCount?: number | null;
  totalThreads?: number | null;
  totalLikes?: number | null;
  totalShares?: number | null;
  publicProfileUrl?: string | null;
  qrTargetUrl?: string | null;
  shareUrl?: string | null;
  brandCountry: string | null;
  brandState: string | null;
  brandCity: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  location?: string | null;
  brandTags: string[];
  socialInstagram: string | null;
  socialFacebook: string | null;
  socialTwitter: string | null;
  socialWebsite: string | null;
  phoneNumber: string | null;
  businessType: string | null;
  logoImage: string | null;
  logoImageId: string | null;
  logoImageMeta?: {
    fileId?: string | null;
    id?: string | null;
    url?: string | null;
    s3Url?: string | null;
  } | null;
  bannerImage: string | null;
  bannerImageId: string | null;
  bannerImageMeta?: {
    fileId?: string | null;
    id?: string | null;
    url?: string | null;
    s3Url?: string | null;
  } | null;
  profileImage?: string | null;
  profileImageId?: string | null;
  profileImageFile?: {
    id?: string | null;
    s3Url?: string | null;
    url?: string | null;
  } | null;
  username: string | null;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CollectionDto {
  id: string;
  entityType?: CatalogEntityType;
  title: string;
  description: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'DRAFT' | 'PUBLISHED';
  coverImage: string | null;
  coverFileId: string | null;
  likesCount: number;
  commentsCount: number;
  itemCount: number;
  postsCount: number;
  minPrice: number;
  maxPrice: number;
  saleMinPrice: number | null;
  saleMaxPrice: number | null;
  saleStartAt: string | null;
  saleEndAt: string | null;
  brandName: string | null;
  username: string | null;
  brandLogo: string | null;
  brandLogoFileId: string | null;
  isAvailableInStore: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  // Client-side status for publishing state
  clientStatus?: 'publishing' | 'publish-failed';
  clientStatusMessage?: string;
}

export type CollectionScope = 'design' | 'store' | 'all';

const getCollectionBasePath = (scope?: CollectionScope) =>
  scope === 'store' ? '/store-collections' : scope === 'all' ? '/collections' : '/designs';

export interface CollectionDetailFileDto {
  id: string;
  fileId?: string | null;
  s3Url?: string | null;
  secureUrl?: string | null;
  url?: string | null;
  fileName?: string | null;
  originalName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CollectionDetailMediaDto {
  id: string;
  fileId?: string | null;
  fileUploadId?: string | null;
  uploadFileId?: string | null;
  url?: string | null;
  s3Url?: string | null;
  secureUrl?: string | null;
  previewUrl?: string | null;
  mediaType?: string | null;
  caption?: string | null;
  orderIndex?: number;
  threadsCount?: number;
  file?: CollectionDetailFileDto | null;
}

export interface CollectionDetailOwnerDto {
  id: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  brandFullName?: string | null;
  profileImage?: string | null;
  profileImageId?: string | null;
  profileImageFile?: CollectionDetailFileDto | null;
}

export interface CollectionDetailDto {
  id: string;
  title: string;
  description?: string | null;
  visibility?: string;
  status?: string;
  isAvailableInStore?: boolean;
  coverImageUrl?: string | null;
  coverMediaId?: string | null;
  medias?: CollectionDetailMediaDto[];
  owner?: CollectionDetailOwnerDto | null;
  products?: Array<Record<string, unknown>>;
  tags?: string[];
  filterValueIds?: string[];
  itemCount?: number;
  threadsCount?: number;
  collectionCollabCount?: number;
}

export interface ReviewDto {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImage: string | null;
  };
  isVerifiedPurchase: boolean;
}
export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface UpdateBrandProfilePayload {
  brandFullName?: string;
  brandDescription?: string;
  brandCountry?: string;
  brandState?: string;
  brandCity?: string;
  brandTags?: string[];
  socialInstagram?: string;
  socialFacebook?: string;
  socialTwitter?: string;
  socialWebsite?: string;
  phoneNumber?: string;
  businessType?: string;
}

export interface UploadAssetDto {
  id: string;
  url: string;
  key: string;
  fileName: string;
  originalName: string;
  size: number;
  mimeType: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Caching
// ─────────────────────────────────────────────────────────────

const SIGNED_URL_TTL_MS = 4 * 60 * 1000;
const SIGNED_URL_REFRESH_SKEW_MS = 30 * 1000;
const MISSING_SIGNED_URL_TTL_MS = 2 * 60 * 1000;
const BRAND_PROFILE_TTL_MS = 30 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlPending = new Map<string, Promise<string | null>>();
const signedUrlMissingCache = new Map<string, number>();
const brandProfileCache = new Map<string, { profile: BrandProfileDto | null; expiresAt: number }>();
const brandProfilePending = new Map<string, Promise<BrandProfileDto | null>>();

export type SignedFileUrlDebugContext = {
  designId?: string | null;
  productId?: string | null;
  collectionId?: string | null;
  mediaIndex?: number | null;
  fileId?: string | null;
  sourceField?: string | null;
};

const categoriesCache: {
  items: CategoryDto[];
  lastFetched: number;
} = { items: [], lastFetched: 0 };
const CATEGORIES_TTL_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

function asRecord(value: unknown): Record<string, any> {
  if (value && typeof value === 'object') {
    return value as Record<string, any>;
  }
  return {};
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCompactAmzDate(value: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getSignedUrlCacheExpiresAt(url: string): number {
  try {
    const parsed = new URL(url);
    const explicitExpiresAt = parsed.searchParams.get('expiresAt') ?? parsed.searchParams.get('ExpiresAt');
    if (explicitExpiresAt) {
      const timestamp = Date.parse(explicitExpiresAt);
      if (Number.isFinite(timestamp)) return Math.max(Date.now(), timestamp - SIGNED_URL_REFRESH_SKEW_MS);
    }

    const unixExpires = parsed.searchParams.get('Expires') ?? parsed.searchParams.get('expires');
    if (unixExpires) {
      const timestamp = Number(unixExpires) * 1000;
      if (Number.isFinite(timestamp)) return Math.max(Date.now(), timestamp - SIGNED_URL_REFRESH_SKEW_MS);
    }

    const amzDate = parsed.searchParams.get('X-Amz-Date');
    const amzExpires = Number(parsed.searchParams.get('X-Amz-Expires'));
    const amzStartedAt = amzDate ? parseCompactAmzDate(amzDate) : null;
    if (amzStartedAt && Number.isFinite(amzExpires)) {
      return Math.max(Date.now(), amzStartedAt + amzExpires * 1000 - SIGNED_URL_REFRESH_SKEW_MS);
    }
  } catch {
    return Date.now() + SIGNED_URL_TTL_MS;
  }

  return Date.now() + SIGNED_URL_TTL_MS;
}

function isFileLikeRecord(value: Record<string, any>): boolean {
  return Boolean(
    asString(value.key) ||
      asString(value.fileName) ||
      asString(value.originalName) ||
      asString(value.mimeType) ||
      asString(value.fileType),
  );
}

function logSignedFileUrlFailure(
  fileId: string,
  status: number | string,
  context?: SignedFileUrlDebugContext,
) {
  if (process.env.NODE_ENV === 'production') return;
  console.warn('[media-resolution] signed URL failed', {
    designId: context?.designId ?? null,
    productId: context?.productId ?? null,
    collectionId: context?.collectionId ?? null,
    mediaIndex: context?.mediaIndex ?? null,
    fileId: context?.fileId ?? fileId,
    sourceField: context?.sourceField ?? null,
    status,
  });
}

function logSignedFileUrlNetworkError(
  label: string,
  error: any,
  context?: SignedFileUrlDebugContext,
) {
  if (process.env.NODE_ENV === 'production') return;
  console.warn('[media-resolution]', {
    event: label,
    designId: context?.designId ?? null,
    productId: context?.productId ?? null,
    collectionId: context?.collectionId ?? null,
    mediaIndex: context?.mediaIndex ?? null,
    fileId: context?.fileId ?? null,
    status: error?.response?.status ?? null,
    message: typeof error?.message === 'string' ? error.message : 'request failed',
  });
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVisibility(value: unknown): 'PUBLIC' | 'PRIVATE' {
  return String(value ?? '').toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
}

function normalizeStatus(value: unknown): 'DRAFT' | 'PUBLISHED' {
  return String(value ?? '').toUpperCase() === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
}

function normalizeBrandProfile(payload: unknown): BrandProfileDto | null {
  const source = asRecord(unwrapData<unknown>(payload));
  const id = asString(source.id);
  if (!id) return null;

  const socialLinks = asRecord(source.socialLinks);
  const contactInfo = asRecord(source.contactInfo);
  const logoMeta = asRecord(source.logoImageMeta ?? source.profileImageFile);
  const bannerMeta = asRecord(source.bannerImageMeta ?? source.bannerImageFile);

  const brandCountry =
    asString(source.brandCountry) ??
    asString(source.country);
  const brandState =
    asString(source.brandState) ??
    asString(source.state);
  const brandCity =
    asString(source.brandCity) ??
    asString(source.city);

  const logoImage =
    asString(source.logoImage) ??
    asString(source.profileImage) ??
    asString(logoMeta.url) ??
    asString(logoMeta.s3Url);
  const logoImageId =
    asString(source.logoImageId) ??
    asString(source.profileImageId) ??
    asString(logoMeta.fileId) ??
    asString(logoMeta.id);

  const bannerImage =
    asString(source.bannerImage) ??
    asString(bannerMeta.url) ??
    asString(bannerMeta.s3Url);
  const bannerImageId =
    asString(source.bannerImageId) ??
    asString(bannerMeta.fileId) ??
    asString(bannerMeta.id);
  const storeStatusRaw = asString(source.storeStatus);
  const storeStatus: BrandProfileDto['storeStatus'] =
    storeStatusRaw === 'OPEN' || storeStatusRaw === 'CLOSED' || storeStatusRaw === 'PENDING_VERIFICATION'
      ? storeStatusRaw
      : typeof source.isStoreOpen === 'boolean'
        ? source.isStoreOpen
          ? 'OPEN'
          : 'CLOSED'
        : null;

  const tagSource = Array.isArray(source.brandTags)
    ? source.brandTags
    : Array.isArray(source.tags)
      ? source.tags
      : Array.isArray(source.hashtags)
        ? source.hashtags
        : [];

  const derivedName = [asString(source.firstName), asString(source.lastName)]
    .filter(Boolean)
    .join(' ');
  const derivedLocation = [brandCity, brandState, brandCountry]
    .filter(Boolean)
    .join(', ');
  const collectionsCount = asNullableNumber(source.collectionsCount);
  const designsCount = asNullableNumber(source.designsCount) ?? collectionsCount;
  const totalLikes = asNullableNumber(source.totalLikes);
  const totalThreads = asNullableNumber(source.totalThreads) ?? totalLikes;

  return {
    id,
    brandFullName:
      asString(source.brandFullName) ??
      (derivedName || null) ??
      asString(source.username),
    brandDescription:
      asString(source.brandDescription) ??
      asString(source.description),
    description:
      asString(source.description) ??
      asString(source.brandDescription),
    isStoreOpen:
      typeof source.isStoreOpen === 'boolean'
        ? source.isStoreOpen
        : storeStatus === 'OPEN'
          ? true
          : storeStatus === 'CLOSED'
            ? false
            : null,
    storeStatus,
    emailVerified:
      typeof source.emailVerified === 'boolean'
        ? source.emailVerified
        : typeof source.isEmailVerified === 'boolean'
          ? source.isEmailVerified
          : null,
    verified:
      typeof source.verified === 'boolean'
        ? source.verified
        : typeof source.isVerifiedBrand === 'boolean'
          ? source.isVerifiedBrand
          : null,
    verificationStatus: asString(source.verificationStatus),
    verificationBadgeVisible:
      typeof source.verificationBadgeVisible === 'boolean'
        ? source.verificationBadgeVisible
        : null,
    verifiedExplanationUrl: asString(source.verifiedExplanationUrl),
    averageRating: asNullableNumber(source.averageRating ?? source.avgRating),
    totalReviews: asNullableNumber(source.totalReviews),
    collectionsCount,
    designsCount,
    productsCount: asNullableNumber(source.productsCount),
    patchesCount: asNullableNumber(source.patchesCount),
    followersCount: asNullableNumber(source.followersCount ?? source.patchesCount),
    totalThreads,
    totalLikes,
    totalShares:
      source.totalShares === null || source.totalShares === undefined
        ? null
        : asNullableNumber(source.totalShares),
    publicProfileUrl: asString(source.publicProfileUrl),
    qrTargetUrl: asString(source.qrTargetUrl),
    shareUrl: asString(source.shareUrl),
    brandCountry,
    brandState,
    brandCity,
    country: brandCountry,
    state: brandState,
    city: brandCity,
    location:
      asString(source.location) ??
      (derivedLocation || null) ??
      null,
    brandTags: tagSource
      .map((tag) => asString(tag))
      .filter((tag): tag is string => Boolean(tag)),
    socialInstagram:
      asString(source.socialInstagram) ??
      asString(socialLinks.instagram),
    socialFacebook:
      asString(source.socialFacebook) ??
      asString(socialLinks.facebook),
    socialTwitter:
      asString(source.socialTwitter) ??
      asString(socialLinks.twitter),
    socialWebsite:
      asString(source.socialWebsite) ??
      asString(socialLinks.website),
    phoneNumber:
      asString(source.phoneNumber) ??
      asString(contactInfo.phone),
    businessType:
      asString(source.businessType) ??
      asString(source.brandBusinessType) ??
      asString(contactInfo.businessType),
    logoImage,
    logoImageId,
    logoImageMeta: {
      fileId: asString(logoMeta.fileId),
      id: asString(logoMeta.id),
      url: asString(logoMeta.url),
      s3Url: asString(logoMeta.s3Url),
    },
    bannerImage,
    bannerImageId,
    bannerImageMeta: {
      fileId: asString(bannerMeta.fileId),
      id: asString(bannerMeta.id),
      url: asString(bannerMeta.url),
      s3Url: asString(bannerMeta.s3Url),
    },
    profileImage: logoImage,
    profileImageId: logoImageId,
    profileImageFile: {
      id: asString(logoMeta.fileId) ?? asString(logoMeta.id),
      s3Url: asString(logoMeta.s3Url) ?? asString(logoMeta.url),
      url: asString(logoMeta.url) ?? asString(logoMeta.s3Url),
    },
    username: asString(source.username),
    email:
      asString(source.email) ??
      asString(contactInfo.email),
    firstName: asString(source.firstName),
    lastName: asString(source.lastName),
  };
}

function resolveCollectionCover(item: Record<string, any>): {
  coverImage: string | null;
  coverFileId: string | null;
} {
  const medias = Array.isArray(item.medias) ? item.medias : [];
  const preferredMedia = item.coverMediaId
    ? medias.find((media) => String(media?.id) === String(item.coverMediaId))
    : medias[0];
  const mediaFile = asRecord(preferredMedia?.file);

  const previewImages = Array.isArray(item.previewImages)
    ? item.previewImages
    : [];
  const previewCandidate = previewImages.find((entry) => {
    const candidate = asRecord(entry);
    return Boolean(asString(candidate.url) || asString(candidate.fileId));
  });
  const previewFile = asRecord(previewCandidate);

  const coverImage =
    asString(item.coverImage) ??
    asString(item.coverImageUrl) ??
    asString(mediaFile.secureUrl) ??
    asString(mediaFile.s3Url) ??
    asString(mediaFile.url) ??
    asString(previewFile.secureUrl) ??
    asString(previewFile.s3Url) ??
    asString(previewFile.url);

  const coverFileId =
    asString(item.coverFileId) ??
    asString(item.coverImageId) ??
    asString(mediaFile.fileId) ??
    asString(mediaFile.id) ??
    asString(previewFile.fileId) ??
    asString(previewFile.fileUploadId) ??
    (isFileLikeRecord(previewFile) ? asString(previewFile.id) : null);

  return { coverImage, coverFileId };
}

function normalizeCollectionItem(payload: unknown): CollectionDto | null {
  const item = asRecord(payload);
  const id = asString(item.id);
  if (!id) return null;

  const owner = asRecord(item.owner);
  const ownerImage = asRecord(owner.profileImageFile);
  const { coverImage, coverFileId } = resolveCollectionCover(item);

  const ownerId =
    asString(item.ownerId) ??
    asString(owner.id) ??
    '';

  return {
    id,
    entityType:
      resolveCatalogEntityType(
        item,
        Boolean(item.isAvailableInStore) || String(item.domain ?? '').toUpperCase() === 'STORE'
          ? 'COLLECTION'
          : 'DESIGN',
      ) ??
      (Boolean(item.isAvailableInStore) || String(item.domain ?? '').toUpperCase() === 'STORE'
        ? 'COLLECTION'
        : 'DESIGN'),
    title: asString(item.title) ?? 'Untitled',
    description: asString(item.description),
    visibility: normalizeVisibility(item.visibility),
    status: normalizeStatus(item.status),
    coverImage,
    coverFileId,
    likesCount: asNumber(item.threadsCount, asNumber(item.likesCount, 0)),
    commentsCount: asNumber(item.commentsCount, asNumber(asRecord(item._count).comments, 0)),
    itemCount: asNumber(item.itemCount, asNumber(asRecord(item._count).medias, asNumber(Array.isArray(item.products) ? item.products.length : 0, 0))),
    postsCount: asNumber(item.itemCount, asNumber(asRecord(item._count).medias, 0)),
    minPrice: asNumber(item.minPrice, 0),
    maxPrice: asNumber(item.maxPrice, 0),
    saleMinPrice: item.saleMinPrice == null ? null : asNumber(item.saleMinPrice, 0),
    saleMaxPrice: item.saleMaxPrice == null ? null : asNumber(item.saleMaxPrice, 0),
    saleStartAt: asString(item.saleStartAt),
    saleEndAt: asString(item.saleEndAt),
    brandName: asString(item.brandName) ?? asString(owner.brandFullName),
    username: asString(item.username) ?? asString(owner.username),
    brandLogo:
      asString(item.brandLogo) ??
      asString(owner.profileImage) ??
      asString(ownerImage.s3Url) ??
      asString(ownerImage.url),
    brandLogoFileId:
      asString(item.brandLogoFileId) ??
      asString(owner.profileImageId) ??
      asString(ownerImage.id),
    isAvailableInStore:
      Boolean(item.isAvailableInStore) ||
      String(item.domain ?? '').toUpperCase() === 'STORE',
    ownerId,
    createdAt: asString(item.createdAt) ?? new Date().toISOString(),
    updatedAt: asString(item.updatedAt) ?? asString(item.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeCollectionListPayload(payload: unknown): {
  items: CollectionDto[];
  total: number;
  hasMore: boolean;
} {
  const source = asRecord(unwrapData<unknown>(payload));
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.data)
      ? source.data
      : Array.isArray(source)
        ? (source as unknown[])
        : [];

  const items = rawItems
    .map((entry) => normalizeCollectionItem(entry))
    .filter((entry): entry is CollectionDto => Boolean(entry));

  return {
    items,
    total: asNumber(source.total, items.length),
    hasMore: Boolean(source.hasMore ?? source.hasNextPage),
  };
}

function extractUploadAsset(payload: unknown): UploadAssetDto | null {
  const source = asRecord(unwrapData<unknown>(payload));
  const id = asString(source.id);
  const url = asString(source.url) ?? asString(source.s3Url);
  if (!id || !url) {
    return null;
  }

  return {
    id,
    url,
    key: asString(source.key) ?? '',
    fileName: asString(source.fileName) ?? '',
    originalName: asString(source.originalName) ?? asString(source.fileName) ?? '',
    size: asNumber(source.size, 0),
    mimeType: asString(source.mimeType) ?? '',
    fileType: asString(source.fileType) ?? '',
    createdAt: asString(source.createdAt) ?? new Date().toISOString(),
    updatedAt: asString(source.updatedAt) ?? asString(source.createdAt) ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Brand API
// ─────────────────────────────────────────────────────────────

export const brandApi = {
  /**
   * Get current brand's profile
   */
  async getProfile(): Promise<BrandProfileDto | null> {
    try {
      const meResponse = await apiClient.get('/users/me/profile');
      const me = asRecord(unwrapData<unknown>(meResponse.data));
      const brandId = asString(me.id);
      if (!brandId) {
        return null;
      }
      return this.getProfileById(brandId);
    } catch (error) {
      console.error('Error fetching brand profile:', error);
      return null;
    }
  },

  /**
   * Get brand profile by ID (for viewing other brands)
   */
  async getProfileById(
    brandId: string,
    opts?: { forceRefresh?: boolean },
  ): Promise<BrandProfileDto | null> {
    try {
      const cacheKey = asString(brandId);
      const forceRefresh = opts?.forceRefresh === true;
      if (!cacheKey) return null;

      if (forceRefresh) {
        brandProfileCache.delete(cacheKey);
        brandProfilePending.delete(cacheKey);
      }

      const cached = brandProfileCache.get(cacheKey);
      if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
        return cached.profile;
      }

      const pending = brandProfilePending.get(cacheKey);
      if (!forceRefresh && pending) {
        return pending;
      }

      const request = (async () => {
        const response = await apiClient.get(`/brands/${cacheKey}`);
        const profile = normalizeBrandProfile(response.data);
        brandProfileCache.set(cacheKey, {
          profile,
          expiresAt: Date.now() + BRAND_PROFILE_TTL_MS,
        });
        return profile;
      })();

      brandProfilePending.set(cacheKey, request);
      return await request.finally(() => {
        brandProfilePending.delete(cacheKey);
      });
    } catch (error) {
      console.error('Error fetching brand profile by ID:', error);
      return null;
    }
  },

  /**
   * Update brand profile
   */
  async updateProfile(brandId: string, payload: UpdateBrandProfilePayload): Promise<BrandProfileDto | null> {
    try {
      await apiClient.patch(`/brands/${brandId}`, payload);
      brandProfileCache.delete(brandId);
      brandProfilePending.delete(brandId);
      return this.getProfileById(brandId, { forceRefresh: true });
    } catch (error) {
      console.error('Error updating brand profile:', error);
      throw error;
    }
  },

  /**
   * Patch a brand profile.
   */
  async patchBrand(brandId: string): Promise<boolean> {
    try {
      const response = await apiClient.post(`/brands/${brandId}/patches`);
      const data = unwrapData<any>(response.data);
      return Boolean(data?.isPatched ?? true);
    } catch (error) {
      console.error('Error patching brand:', error);
      throw error;
    }
  },

  /**
   * Unpatch a brand profile.
   */
  async unpatchBrand(brandId: string): Promise<boolean> {
    try {
      const response = await apiClient.delete(`/brands/${brandId}/patches`);
      const data = unwrapData<any>(response.data);
      return Boolean(data?.isPatched ?? false);
    } catch (error) {
      console.error('Error unpatching brand:', error);
      throw error;
    }
  },

  /**
   * Check whether the current user has patched a brand.
   */
  async checkPatchStatus(brandId: string): Promise<boolean> {
    try {
      const response = await apiClient.get(`/brands/${brandId}/patches/check`);
      const data = unwrapData<any>(response.data);
      return Boolean(data?.isPatched);
    } catch (error) {
      console.error('Error checking patch status:', error);
      return false;
    }
  },

  /**
   * Get brand's collections
   */
  async getCollections(args?: {
    brandId?: string;
    visibility?: 'PUBLIC' | 'PRIVATE';
    status?: 'DRAFT' | 'PUBLISHED';
    search?: string;
    page?: number;
    limit?: number;
    scope?: CollectionScope;
    forceRefresh?: boolean;
  }): Promise<{ items: CollectionDto[]; total: number; hasMore: boolean }> {
    try {
      const visibilityQuery = args?.visibility
        ? args.visibility.toLowerCase()
        : undefined;

      if (args?.brandId && args?.scope === 'all') {
        const [designResult, storeResult] = await Promise.all([
          this.getCollections({ ...args, scope: 'design' }),
          this.getCollections({ ...args, scope: 'store' }),
        ]);
        let merged = [...storeResult.items, ...designResult.items];
        if (args?.status) {
          merged = merged.filter((item) => item.status === args.status);
        }
        if (args?.search) {
          const normalizedSearch = args.search.trim().toLowerCase();
          merged = merged.filter((item) => item.title.toLowerCase().includes(normalizedSearch));
        }
        return {
          items: merged,
          total: merged.length,
          hasMore: designResult.hasMore || storeResult.hasMore,
        };
      }

      const params = new URLSearchParams();
      if (visibilityQuery) params.set('visibility', visibilityQuery);
      if (args?.limit) params.set('limit', String(args.limit));
      if (args?.forceRefresh) params.set('_cb', String(Date.now()));

      const basePath = getCollectionBasePath(args?.scope);
      const url = args?.brandId
        ? `${basePath}/user/${args.brandId}${params.toString() ? `?${params.toString()}` : ''}`
        : `${basePath}${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await apiClient.get(
        url,
        args?.forceRefresh
          ? {
              headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
              },
            }
          : undefined,
      );
      const normalized = normalizeCollectionListPayload(response.data);

      let filtered = normalized.items;
      if (args?.status) {
        filtered = filtered.filter((item) => item.status === args.status);
      }
      if (args?.search) {
        const normalizedSearch = args.search.trim().toLowerCase();
        filtered = filtered.filter((item) => item.title.toLowerCase().includes(normalizedSearch));
      }

      return {
        items: filtered,
        total: filtered.length,
        hasMore: normalized.hasMore,
      };
    } catch (error) {
      console.error('Error fetching collections:', error);
      return { items: [], total: 0, hasMore: false };
    }
  },

  /**
   * Get draft collections (owner only)
   */
  async getDrafts(opts?: { forceRefresh?: boolean }): Promise<CollectionDto[]> {
    try {
      const response = await apiClient.get(
        '/designs/my/drafts',
        opts?.forceRefresh
          ? {
              params: { _cb: Date.now() },
              headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
              },
            }
          : undefined,
      );
      return normalizeCollectionListPayload(response.data).items.map((item) => ({
        ...item,
        status: 'DRAFT',
      }));
    } catch (error) {
      console.error('Error fetching drafts:', error);
      return [];
    }
  },

  /**
   * Get categories
   */
  async getCategories(force = false): Promise<CategoryDto[]> {
    if (!force && categoriesCache.items.length && Date.now() - categoriesCache.lastFetched < CATEGORIES_TTL_MS) {
      return categoriesCache.items;
    }

    try {
      const response = await apiClient.get('/collections/categories');
      const payload = response?.data;
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

      const mapped: CategoryDto[] = items.map((c: any) => ({
        id: String(c?.id ?? ''),
        slug: String(c?.slug ?? ''),
        name: String(c?.name ?? ''),
        description: c?.description ?? null,
      }));

      categoriesCache.items = mapped;
      categoriesCache.lastFetched = Date.now();
      return mapped;
    } catch (error) {
      console.error('Error fetching categories:', error);
      if (categoriesCache.items.length) {
        return categoriesCache.items;
      }
      return [];
    }
  },

  /**
   * Get reviews for brand
   */
  async getReviews(brandId?: string): Promise<{ items: ReviewDto[]; averageRating: number; totalCount: number }> {
    try {
      const url = brandId ? `/brands/${brandId}/reviews` : '/brands/reviews';
      const response = await apiClient.get(url);
      const data = unwrapData<any>(response.data);

      return {
        items: data?.items ?? data?.reviews ?? [],
        averageRating: data?.averageRating ?? 0,
        totalCount: data?.totalCount ?? data?.items?.length ?? 0,
      };
    } catch (error: any) {
      if (
        error?.response?.status === 403 &&
        error?.response?.data?.message === 'REVIEW_FEATURE_DISABLED'
      ) {
        return { items: [], averageRating: 0, totalCount: 0 };
      }
      console.error('Error fetching reviews:', error);
      return { items: [], averageRating: 0, totalCount: 0 };
    }
  },

  /**
   * Get signed URL for a file
   */
  async getSignedFileUrl(fileId: string, context?: SignedFileUrlDebugContext): Promise<string | null> {
    const normalizedFileId = asString(fileId);
    if (!normalizedFileId) {
      return null;
    }

    if (/[/?#\\]/.test(normalizedFileId) || /^https?:\/\//i.test(normalizedFileId)) {
      signedUrlMissingCache.set(normalizedFileId, Date.now() + MISSING_SIGNED_URL_TTL_MS);
      logSignedFileUrlFailure(normalizedFileId, 'invalid-file-id', context);
      return null;
    }

    fileId = normalizedFileId;
    const missingCachedUntil = signedUrlMissingCache.get(fileId);
    if (missingCachedUntil && missingCachedUntil > Date.now()) {
      return null;
    }
    if (missingCachedUntil) {
      signedUrlMissingCache.delete(fileId);
    }

    // Check cache first
    const cached = signedUrlCache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // Check if request is already pending
    const pending = signedUrlPending.get(fileId);
    if (pending) {
      return pending;
    }

    // Public catalog/profile media usually belongs to another user. The signed-url
    // endpoint is owner-only, so using it first produces repeated 400s for public media.
    const promise = (async () => {
      try {
        const response = await apiClient.get(`/uploads/public-url/${fileId}`);
        const url = unwrapData<any>(response.data)?.url ?? null;
        if (url) {
          signedUrlMissingCache.delete(fileId);
          signedUrlCache.set(fileId, { url, expiresAt: getSignedUrlCacheExpiresAt(url) });
        }
        return url;
      } catch (error: any) {
        const publicStatus = error?.response?.status;
        if (publicStatus === 400 || publicStatus === 401 || publicStatus === 403 || publicStatus === 404) {
          try {
            const response = await apiClient.get(`/uploads/signed-url/${fileId}`);
            const url = unwrapData<any>(response.data)?.url ?? null;
            if (url) {
              signedUrlMissingCache.delete(fileId);
              signedUrlCache.set(fileId, { url, expiresAt: getSignedUrlCacheExpiresAt(url) });
            }
            return url;
          } catch (publicError: any) {
            if (
              publicError?.response?.status === 400 ||
              publicError?.response?.status === 404
            ) {
              signedUrlMissingCache.set(fileId, Date.now() + MISSING_SIGNED_URL_TTL_MS);
              logSignedFileUrlFailure(fileId, publicError.response.status, context);
              return null;
            }
            logSignedFileUrlNetworkError('signed-url-fallback-error', publicError, context);
            throw publicError;
          }
        }
        if (publicStatus === 400 || publicStatus === 404) {
          signedUrlMissingCache.set(fileId, Date.now() + MISSING_SIGNED_URL_TTL_MS);
          logSignedFileUrlFailure(fileId, publicStatus, context);
          return null;
        }
        logSignedFileUrlNetworkError('public-url-error', error, context);
        throw error;
      } finally {
        signedUrlPending.delete(fileId);
      }
    })();

    signedUrlPending.set(fileId, promise);
    return promise;
  },

  /**
   * Get one collection with medias
   */
  async getCollectionDetail(
    collectionId: string,
    opts?: { scope?: CollectionScope; forceRefresh?: boolean },
  ): Promise<CollectionDetailDto | null> {
    try {
      const basePath = getCollectionBasePath(opts?.scope);
      const response = await apiClient.get(
        `${basePath}/${collectionId}`,
        opts?.forceRefresh
          ? {
              params: { _cb: Date.now() },
              headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
              },
            }
          : undefined,
      );
      return unwrapData<CollectionDetailDto>(response.data);
    } catch (error: any) {
      console.error('Error fetching collection detail:', error);
      // Propagate the error so components can handle permission/not-found cases
      // Don't return null - throw the error to allow proper error handling
      if (error?.response?.status === 404 || error?.response?.status === 403) {
        throw error;
      }
      // For other errors, return null for backward compatibility
      return null;
    }
  },

  async requestPrivateAccess(collectionId: string): Promise<{
    state: 'PENDING' | 'APPROVED';
    cooldownActive?: boolean;
    nextAllowedAt?: string;
  } | null> {
    try {
      const response = await apiClient.post(`/collections/${collectionId}/access-requests`);
      return unwrapData<{
        state: 'PENDING' | 'APPROVED';
        cooldownActive?: boolean;
        nextAllowedAt?: string;
      }>(response.data);
    } catch (error) {
      console.error('Error requesting private access:', error);
      throw error;
    }
  },

  /**
   * Upload avatar image
   */
  async uploadAvatar(uri: string, mimeType: string): Promise<UploadAssetDto | null> {
    try {
      const formData = new FormData();
      const fileName = uri.split('/').pop() ?? 'avatar.jpg';
      
      formData.append('file', {
        uri,
        type: mimeType,
        name: fileName,
      } as any);

      const response = await apiClient.post('/uploads/profile-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return extractUploadAsset(response.data);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      throw error;
    }
  },

  /**
   * Upload banner image
   */
  async uploadBanner(uri: string, mimeType: string): Promise<UploadAssetDto | null> {
    try {
      const formData = new FormData();
      const fileName = uri.split('/').pop() ?? 'banner.jpg';
      
      formData.append('file', {
        uri,
        type: mimeType,
        name: fileName,
      } as any);

      const response = await apiClient.post('/uploads/banner-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return extractUploadAsset(response.data);
    } catch (error) {
      console.error('Error uploading banner:', error);
      throw error;
    }
  },

  /**
   * Create a new collection
   */
  async createCollection(payload: {
    title: string;
    description?: string;
    visibility?: 'PUBLIC' | 'PRIVATE';
    categoryId?: string;
  }): Promise<CollectionDto | null> {
    try {
      const visibility = payload.visibility ?? 'PUBLIC';
      const initializeResponse = await apiClient.post('/store-collections/initialize', {
        mode: 'existing',
        title: payload.title,
        description: payload.description,
        visibility,
        categoryId: payload.categoryId,
        isAvailableInStore: true,
      });
      const initialized = unwrapData<Record<string, any>>(initializeResponse.data);
      const collectionId =
        asString(initialized.sessionId) ??
        asString(initialized.collectionId) ??
        asString(initialized.id);
      if (!collectionId) {
        throw new Error('Collection draft could not be initialized.');
      }

      const finalized = await apiClient.post(`/store-collections/${collectionId}/finalize`, {
        action: 'draft',
        collectionMetadata: {
          title: payload.title,
          description: payload.description,
          visibility,
          categoryId: payload.categoryId,
          isAvailableInStore: true,
        },
      });
      return unwrapData<CollectionDto>(finalized.data);
    } catch (error) {
      console.error('Error creating collection:', error);
      throw error;
    }
  },

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string): Promise<boolean> {
    try {
      await apiClient.delete(`/collections/${collectionId}`);
      return true;
    } catch (error) {
      console.error('Error deleting collection:', error);
      throw error;
    }
  },

  /**
   * Get store status
   */
  async getStoreStatus(): Promise<{ hasStore: boolean; storeId: string | null; isSetupComplete: boolean }> {
    try {
      const response = await apiClient.get('/store/status');
      const data = unwrapData<any>(response.data);
      return {
        hasStore: data?.hasStore ?? false,
        storeId: data?.storeId ?? null,
        isSetupComplete: data?.isSetupComplete ?? false,
      };
    } catch (error) {
      console.error('Error getting store status:', error);
      return { hasStore: false, storeId: null, isSetupComplete: false };
    }
  },
};
