import { apiClient } from '@/src/api/httpClient';
import { normalizeThemePreference, type ThemePreference } from '@/src/types/theme';
import type { ProfilePhotoViewState } from '@/src/types/profilePhoto';
import { resolveProfileImageSource } from '@/src/utils/profileImage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  themePreference: ThemePreference;
  profileImage?: string | null;
  profileImageId?: string | null;
  profileImageFile?: {
    id?: string | null;
    s3Url?: string | null;
    url?: string | null;
  } | null;
  bannerImage?: string | null;
  address?: string | null;
  location?: string | null;
  profileVisibility: 'UNLOCKED' | 'LOCKED';
  profilePhotoUpdatedAt?: string | null;
  profilePhotoViewState?: ProfilePhotoViewState | null;
  isEmailVerified?: boolean;
  createdAt?: string | null;
}

export interface SizeFitProfile {
  id?: string;
  measurements?: Record<string, unknown>;
  canonicalMeasurements?: Record<string, number>;
  unmappedMeasurements?: Record<string, unknown>;
  notes?: string | null;
  preferredLengthUnit?: LengthUnit;
  preferredWeightUnit?: 'KG' | 'LBS';
  fitPreference?: FitPreference | null;
  preferredSizingRegion?: SizingRegion;
  autoSizeRecommendation?: AutoSizeRecommendationMode;
  visibility?: 'PUBLIC' | 'PRIVATE';
  sharePolicy?: string;
  notifyOnShare?: boolean;
  isUpdateDue?: boolean;
  missingBaselineKeys?: string[];
  baselineRequiredKeys?: string[];
  measurementGender?: string | null;
  requireUpdateEveryDays?: number;
}

export type LengthUnit = 'CM' | 'IN';
export type FitPreference = 'SLIM' | 'REGULAR' | 'LOOSE' | 'OVERSIZED';
export type SizingRegion = 'NG_WEST_AFRICA' | 'UK' | 'US' | 'EU' | 'INTERNATIONAL';
export type AutoSizeRecommendationMode = 'ON' | 'OFF' | 'ASK_EVERY_TIME';
export type RecommendationConfidenceLabel = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';
export type GarmentCategory =
  | 'TOP'
  | 'BOTTOM'
  | 'GOWN'
  | 'DRESS'
  | 'FORMAL_SHIRT'
  | 'JACKET'
  | 'SKIRT'
  | 'UNISEX_TOP'
  | 'UNISEX_BOTTOM'
  | 'OTHER';

export interface SizeRecommendationResponse {
  estimatedSize: string | null;
  recommendedSize: string | null;
  displayRange: string | null;
  alternativeSize: string | null;
  confidenceScore: number;
  confidenceLabel: RecommendationConfidenceLabel;
  reasons: string[];
  warnings: string[];
  chartSource: string | null;
  chartVersion: number | null;
  chartId?: string | null;
  chartVersionId?: string | null;
  selectedRegion: SizingRegion;
  garmentCategory: GarmentCategory;
  manualOverrideAllowed: boolean;
  missingMeasurements: string[];
  usedMeasurements: string[];
  fallbackUsed: boolean;
  staleMeasurementWarning?: boolean;
  sizeChartUnavailable?: boolean;
  userFitPreference?: FitPreference | string | null;
  productFitType?: string | null;
  fabricStretch?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' | null;
}

export interface ComputedSizeFitProfile {
  estimatedSize: string | null;
  displayRange: string | null;
  confidenceScore: number;
  confidenceLabel: RecommendationConfidenceLabel;
  preferredRegion: SizingRegion;
  preferredUnit: LengthUnit;
  fitPreference: FitPreference | null;
  categoryBreakdown: Record<string, SizeRecommendationResponse>;
  missingBaselineMeasurements: string[];
  staleMeasurementWarning?: boolean;
  measurementUpdatePrompt?: {
    requiredMeasurements: string[];
    missingMeasurements: string[];
  };
}

export interface SizeRecommendationSnapshot {
  recommendedSize: string | null;
  selectedSize: string | null;
  alternativeSize: string | null;
  displayRange: string | null;
  confidenceScore: number;
  confidenceLabel: RecommendationConfidenceLabel;
  reasonSummary: string[];
  warningsSummary: string[];
  chartSource: string | null;
  chartId?: string | null;
  chartVersionId?: string | null;
  chartVersion: number | null;
  selectedRegion: SizingRegion;
  garmentCategory: GarmentCategory;
  userFitPreference?: FitPreference | string | null;
  productFitType?: string | null;
  fabricStretch?: string | null;
  wasManuallyChanged: boolean;
  generatedAt: string;
}

export interface Order {
  id: string;
  orderCode?: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  thumbnail?: string | null;
}

export interface SavedItem {
  id: string;
  targetType: 'DESIGN' | 'PRODUCT' | 'COLLECTION' | 'COLLECTION_MEDIA';
  targetId: string;
  designId?: string;
  productId?: string;
  collectionId?: string;
  legacyCollectionId?: string;
  title: string;
  thumbnail?: string;
  price?: number;
  brand: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    profileImage?: string;
  };
  createdAt: string;
}

export interface PatchedBrand {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  brandName: string;
  brandTitle?: string | null;
  profileImage?: string;
  brandLogo?: string;
  patchedAt?: string;
  location?: string | null;
}

// ─── Normalisers ──────────────────────────────────────────────────────────────

function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data;
  }
  return payload;
}

function normalizeProfile(raw: unknown): UserProfile | null {
  const payload = unwrap(raw);
  const source =
    (payload as any)?.user ??
    (payload as any)?.profile ??
    payload;
  if (!source || typeof source !== 'object' || !(source as any).id) return null;
  const s = source as any;
  const image = resolveProfileImageSource({
    profileImage: s.profileImage ?? null,
    profileImageId: s.profileImageId ?? null,
    profileImageFile: s.profileImageFile ?? null,
    logoImage: s.logoImage ?? null,
    logoImageId: s.logoImageId ?? null,
    logoImageMeta: s.logoImageMeta ?? null,
    avatarUrl: s.avatarUrl ?? null,
  });
  return {
    id: String(s.id),
    username: s.username ?? '',
    firstName: s.firstName ?? '',
    lastName: s.lastName ?? '',
    email: s.email ?? null,
    themePreference: normalizeThemePreference(s.themePreference),
    profileImage: image.src,
    profileImageId: image.fileId,
    profileImageFile: s.profileImageFile ?? null,
    bannerImage: s.bannerImage ?? null,
    address: s.address ?? null,
    location: s.location ?? s.address ?? null,
    profileVisibility: s.profileVisibility === 'LOCKED' ? 'LOCKED' : 'UNLOCKED',
    profilePhotoUpdatedAt: s.profilePhotoUpdatedAt ?? null,
    profilePhotoViewState: s.profilePhotoViewState ?? null,
    isEmailVerified: Boolean(s.isEmailVerified),
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : null,
  };
}

function normalizeOrders(raw: unknown): Order[] {
  const payload = unwrap(raw);
  const items: unknown[] = Array.isArray((payload as any)?.items)
    ? (payload as any).items
    : Array.isArray(payload)
    ? payload as unknown[]
    : [];

  return items.map((item: any) => ({
    id: String(item.id ?? ''),
    orderCode: item.orderCode ?? item.code ?? undefined,
    status: String(item.status ?? 'UNKNOWN'),
    totalAmount: Number(item.totalAmount ?? item.total ?? 0),
    currency: String(item.currency ?? 'NGN'),
    createdAt: String(item.createdAt ?? ''),
    items: Array.isArray(item.items)
      ? item.items.map((li: any) => ({
          id: String(li.id ?? ''),
          productName: String(li.productName ?? li.name ?? 'Item'),
          quantity: Number(li.quantity ?? 1),
          price: Number(li.price ?? 0),
          thumbnail: li.thumbnail ?? li.product?.thumbnail ?? null,
        }))
      : [],
  }));
}

function normalizeSaved(raw: unknown): SavedItem[] {
  const payload = unwrap(raw);
  const source = Array.isArray((payload as any)?.items)
    ? (payload as any).items
    : Array.isArray((payload as any)?.savedItems)
    ? (payload as any).savedItems
    : Array.isArray(payload)
    ? payload
    : [];

  return (source as any[])
    .map((entry: any) => {
      if (!entry?.id || !entry?.targetId) return null;
      const brand = entry.brand ?? {};
      const rawTargetType = String(entry.targetType ?? '').toUpperCase();
      const targetType: SavedItem['targetType'] =
        rawTargetType === 'DESIGN' ||
        rawTargetType === 'PRODUCT' ||
        rawTargetType === 'COLLECTION_MEDIA'
          ? rawTargetType
          : 'COLLECTION';
      return {
        id: String(entry.id),
        targetType,
        targetId: String(entry.targetId),
        designId: entry.designId ? String(entry.designId) : undefined,
        productId: entry.productId ? String(entry.productId) : undefined,
        collectionId: entry.collectionId ? String(entry.collectionId) : undefined,
        legacyCollectionId: entry.legacyCollectionId ? String(entry.legacyCollectionId) : undefined,
        title: String(entry.title ?? 'Untitled'),
        thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : undefined,
        price: typeof entry.price === 'number' ? entry.price : undefined,
        brand: {
          id: String(brand.id ?? ''),
          username: String(brand.username ?? ''),
          firstName: String(brand.firstName ?? ''),
          lastName: String(brand.lastName ?? ''),
          profileImage: resolveProfileImageSource({
            profileImage: typeof brand.profileImage === 'string' ? brand.profileImage : null,
            profileImageId: typeof brand.profileImageId === 'string' ? brand.profileImageId : null,
            profileImageFile: brand.profileImageFile ?? null,
            logoImage: typeof brand.logoImage === 'string' ? brand.logoImage : null,
            logoImageId: typeof brand.logoImageId === 'string' ? brand.logoImageId : null,
            logoImageMeta: brand.logoImageMeta ?? null,
            avatarUrl: typeof brand.avatarUrl === 'string' ? brand.avatarUrl : null,
          }).src ?? undefined,
        },
        createdAt: String(entry.createdAt ?? ''),
      } as SavedItem;
    })
    .filter(Boolean) as SavedItem[];
}

function normalizePatches(raw: unknown): PatchedBrand[] {
  const payload = unwrap(raw);
  const items: unknown[] = Array.isArray((payload as any)?.items)
    ? (payload as any).items
    : Array.isArray(payload)
    ? payload as unknown[]
    : [];

  return items.map((item: any) => ({
    id: String(item.id ?? ''),
    username: String(item.username ?? ''),
    firstName: String(item.firstName ?? ''),
    lastName: String(item.lastName ?? ''),
    brandName: String(item.brandName ?? item.brandFullName ?? ''),
    brandTitle: item.brandTitle ?? null,
    profileImage: resolveProfileImageSource({
      profileImage: item.profileImage ?? null,
      profileImageId: item.profileImageId ?? null,
      profileImageFile: item.profileImageFile ?? null,
      logoImage: item.logoImage ?? null,
      logoImageId: item.logoImageId ?? null,
      logoImageMeta: item.logoImageMeta ?? null,
      brandLogo: item.brandLogo ?? null,
      brandLogoId: item.brandLogoId ?? null,
      brandLogoFile: item.brandLogoFile ?? null,
      avatarUrl: item.avatarUrl ?? null,
    }).src ?? undefined,
    brandLogo: resolveProfileImageSource({
      profileImage: item.profileImage ?? null,
      profileImageId: item.profileImageId ?? null,
      profileImageFile: item.profileImageFile ?? null,
      logoImage: item.logoImage ?? null,
      logoImageId: item.logoImageId ?? null,
      logoImageMeta: item.logoImageMeta ?? null,
      brandLogo: item.brandLogo ?? null,
      brandLogoId: item.brandLogoId ?? null,
      brandLogoFile: item.brandLogoFile ?? null,
      avatarUrl: item.avatarUrl ?? null,
    }).src ?? undefined,
    patchedAt: item.patchedAt ?? undefined,
    location: item.location ?? null,
  }));
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const ProfileApi = {
  async getMe(): Promise<UserProfile | null> {
    const res = await apiClient.get('/users/me/profile');
    return normalizeProfile(res.data);
  },

  async getPublicProfileById(profileId: string): Promise<UserProfile | null> {
    const res = await apiClient.get(`/users/${encodeURIComponent(profileId)}/profile/public`);
    return normalizeProfile(res.data);
  },

  async updateProfile(payload: {
    firstName: string;
    lastName: string;
    username: string;
    address?: string;
  }): Promise<UserProfile | null> {
    const res = await apiClient.patch('/users/me/profile', payload);
    return normalizeProfile(res.data);
  },

  async uploadProfileImage(formData: FormData): Promise<{ url: string; id: string } | null> {
    const res = await apiClient.post('/uploads/profile-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const d = (res.data?.data ?? res.data) as any;
    if (!d?.url) return null;
    return { url: String(d.url), id: String(d.id ?? '') };
  },

  async removeProfileImage(): Promise<void> {
    await apiClient.delete('/uploads/profile-image');
  },

  async getOrders(params?: { limit?: number; page?: number }): Promise<Order[]> {
    const res = await apiClient.get('/store/orders', {
      params: { limit: params?.limit ?? 20, page: params?.page ?? 1 },
    });
    return normalizeOrders(res.data);
  },

  async getSizeFit(): Promise<SizeFitProfile | null> {
    const res = await apiClient.get('/users/me/size-fit');
    const d = (res.data?.data ?? res.data) as any;
    return d ?? null;
  },

  async getComputedSizeFit(params?: { region?: SizingRegion }): Promise<ComputedSizeFitProfile | null> {
    const res = await apiClient.get('/users/me/size-fit/computed', {
      params: params?.region ? { region: params.region } : undefined,
    });
    const d = (res.data?.data ?? res.data) as any;
    return d ?? null;
  },

  async updateSizeFit(payload: {
    measurements: Record<string, unknown>;
    preferredLengthUnit?: LengthUnit;
    preferredWeightUnit?: 'KG' | 'LBS';
    fitPreference?: FitPreference;
    preferredSizingRegion?: SizingRegion;
    autoSizeRecommendation?: AutoSizeRecommendationMode;
    requireUpdateEveryDays?: number;
    notes?: string;
  }): Promise<SizeFitProfile | null> {
    const res = await apiClient.put('/users/me/size-fit', payload);
    const d = (res.data?.data ?? res.data) as any;
    return d ?? null;
  },

  async updateSizeFitSettings(payload: {
    visibility?: 'PUBLIC' | 'PRIVATE';
    sharePolicy?: string;
    notifyOnShare?: boolean;
    requireUpdateEveryDays?: number;
    preferredLengthUnit?: LengthUnit;
    preferredWeightUnit?: 'KG' | 'LBS';
    fitPreference?: FitPreference;
    preferredSizingRegion?: SizingRegion;
    autoSizeRecommendation?: AutoSizeRecommendationMode;
  }): Promise<Partial<SizeFitProfile> | null> {
    const res = await apiClient.patch('/users/me/size-fit/settings', payload);
    const d = (res.data?.data ?? res.data) as any;
    return d ?? null;
  },

  async getSaved(): Promise<SavedItem[]> {
    const res = await apiClient.get('/saved/me');
    return normalizeSaved(res.data);
  },

  async getPatches(userId: string): Promise<PatchedBrand[]> {
    const res = await apiClient.get(`/users/${userId}/patches`);
    return normalizePatches(res.data);
  },
};
