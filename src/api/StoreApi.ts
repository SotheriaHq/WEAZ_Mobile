import { apiClient } from '@/src/api/httpClient';
import type { CatalogEntityType } from '@/src/features/catalog/catalogDomain';
import { resolveCatalogEntityType } from '@/src/features/catalog/catalogEntity';

export interface StoreProductVariant {
  id?: string;
  size?: string | null;
  color?: string | null;
  stock: number;
}

export interface StoreProduct {
  id: string;
  entityType?: CatalogEntityType;
  brandId?: string | null;
  brandName?: string | null;
  brandLogo?: string | null;
  brandLogoFileId?: string | null;
  name: string;
  description?: string | null;
  price: number;
  salePrice?: number | null;
  effectivePrice?: number | null;
  compareAtPrice?: number | null;
  currency: string;
  coverImage?: string | null;
  coverImageId?: string | null;
  images: Array<{ url: string | null; fileId: string | null }>;
  stock: number;
  sizes: string[];
  colors: string[];
  variants: StoreProductVariant[];
  customOrderEnabled: boolean;
  categoryName?: string | null;
  categorySlug?: string | null;
  tags?: string[];
  isWishlisted?: boolean;
  createdAt?: string | null;
}

export interface CartState {
  items: Array<{
    id: string;
    productId: string;
  }>;
  itemCount: number;
  totalQuantity: number;
}

export interface WishlistState {
  items: Array<{
    id: string;
    productId: string;
  }>;
  total: number;
}

export interface ActiveCustomConfiguration {
  id: string;
  requiredMeasurementKeys: string[];
  isActive: boolean;
}

export interface CustomPricePreview {
  checkoutIntentId: string | null;
  configurationVersionId?: string;
  quoteStatus?: string;
}

export interface CustomBagState {
  items: Array<{
    sessionId: string;
    sourceType: string;
    sourceId: string;
  }>;
  total: number;
}

export type BagSourceType = 'PRODUCT' | 'DESIGN' | 'COLLECTION';

export interface BagCount {
  standardQuantity: number;
  customLineCount: number;
  combinedCount: number;
}

export interface MarketplaceProductParams {
  cursor?: string | null;
  limit?: number;
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  tags?: string[];
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
  search?: string | null;
}

export interface MarketplaceProductsResponse {
  items: StoreProduct[];
  hasNextPage: boolean;
  nextCursor: string | null;
  total?: number;
}

export interface ProductBagStatus {
  productId: string;
  sourceType?: BagSourceType;
  sourceId?: string;
  canBag: boolean;
  bagMode: 'STANDARD' | 'CUSTOM' | 'STANDARD_OR_CUSTOM' | 'UNAVAILABLE';
  baggable: boolean;
  reason: string | null;
  modes: {
    standard: boolean;
    customOrder: boolean;
  };
  standard: {
    enabled: boolean;
    inBag: boolean;
    cartItemId: string | null;
    selectedSize: string | null;
    selectedColor: string | null;
    quantity: number;
    requiresSize: boolean;
    requiresColor: boolean;
    sizes: string[];
    colors: string[];
    stock: number;
  };
  customOrder: {
    enabled: boolean;
    inBag: boolean;
    sessionId: string | null;
    checkoutIntentId: string | null;
    configurationId: string | null;
    requiredMeasurementKeys: string[];
    requiredFreeformPointIds: string[];
    fittingsComplete: boolean;
    missingMeasurementKeys: string[];
  };
  custom: {
    available: boolean;
    alreadyBagged: boolean;
    checkoutSessionId: string | null;
    checkoutIntentId: string | null;
    configurationId: string | null;
    requiredMeasurementKeys: string[];
    requiredFreeformPointIds: string[];
    fittingState: 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'NOT_REQUIRED';
    freshnessState: 'FRESH' | 'STALE' | 'MISSING' | 'PARTIAL' | 'NOT_REQUIRED';
    missingMeasurementKeys: string[];
    measurementUpdatedAt: string | null;
    staleAfterDays: number;
    staleAt: string | null;
    requiresStaleConfirmation: boolean;
  };
  duplicateState: {
    inBag: boolean;
    submittedUnpaid: boolean;
    paidActive: boolean;
    completedPolicy: 'ALLOW_REPEAT' | 'BLOCK_REPEAT' | 'UNKNOWN';
    reason: string | null;
  };
  stockState: 'IN_STOCK' | 'OUT_OF_STOCK' | 'CUSTOM_ONLY' | 'UNAVAILABLE';
  userState: {
    authenticated: boolean;
    isOwner: boolean;
    hasPreviouslyBaggedOrOrdered: boolean;
  };
  ui: {
    heartbeatState: 'not_bagged' | 'previously_bagged' | 'currently_bagged' | 'bagging' | 'disabled';
    defaultAction: 'ADD_STANDARD' | 'OPEN_SELECTOR' | 'OPEN_CUSTOM_FLOW' | 'OPEN_FITTINGS' | 'CONFIRM_STALE_FITTINGS' | 'DISABLED';
    disabledReason: string | null;
  };
}

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const isFileLikeRecord = (value: Record<string, unknown>) =>
  Boolean(
    asString(value.key) ||
      asString(value.fileName) ||
      asString(value.originalName) ||
      asString(value.mimeType) ||
      asString(value.fileType),
  );

const isLoopbackHttpUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  } catch {
    return false;
  }
};

const toIdempotencyKey = () => `mob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const appendArray = (target: unknown[], value: unknown) => {
  if (Array.isArray(value)) {
    target.push(...value);
  }
};

const unwrapProductListPayload = (payload: unknown): {
  items: unknown[];
  hasNextPage: boolean;
  nextCursor: string | null;
  total: number;
} => {
  let current = payload;

  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object' || !('data' in (current as Record<string, unknown>))) {
      break;
    }
    current = (current as Record<string, unknown>).data;
  }

  if (Array.isArray(current)) {
    return {
      items: current,
      hasNextPage: false,
      nextCursor: null,
      total: current.length,
    };
  }

  const record = asRecord(current);
  const nestedProducts = asRecord(record.products);
  const candidateItems = [
    record.items,
    record.results,
    record.products,
    record.data,
    nestedProducts.items,
  ].find((candidate) => Array.isArray(candidate));
  const items = Array.isArray(candidateItems) ? candidateItems : [];

  return {
    items,
    hasNextPage: Boolean(record.hasNextPage ?? record.hasMore ?? nestedProducts.hasNextPage),
    nextCursor: asString(record.nextCursor ?? record.cursor ?? nestedProducts.nextCursor),
    total: asNumber(record.total ?? record.count ?? nestedProducts.total, items.length),
  };
};

const normalizeProduct = (raw: unknown): StoreProduct | null => {
  const item = asRecord(raw);
  const id = asString(item.id);
  if (!id) return null;

  const rawImage = asRecord(item.image);
  const rawCategory = asRecord(item.category);
  const rawCategoryType = asRecord(item.categoryType);
  const rawBrand = asRecord(item.brand);
  const rawBrandLogoFile = asRecord(item.brandLogoFile ?? rawBrand.logoFile ?? rawBrand.logoImageFile);

  const rawImages: unknown[] = [];
  appendArray(rawImages, item.images);
  appendArray(rawImages, item.media);
  appendArray(rawImages, item.mediaItems);
  appendArray(rawImages, item.productMedia);

  const images = rawImages
    .map((entry) => {
      if (typeof entry === 'string') {
        const url = asString(entry);
        if (!url) return null;
        return { url, fileId: null };
      }

      const media = asRecord(entry);
      const file = asRecord(media.file);
      const url =
        asString(media.url) ??
        asString(media.secureUrl) ??
        asString(media.s3Url) ??
        asString(media.previewUrl) ??
        asString(media.thumbnailUrl) ??
        asString(file.secureUrl) ??
        asString(file.s3Url) ??
        asString(file.url) ??
        null;
      const fileId =
        asString(media.fileId) ??
        asString(media.fileUploadId) ??
        asString(media.uploadFileId) ??
        asString(media.coverImageId) ??
        asString(media.thumbnailFileId) ??
        asString(file.fileId) ??
        asString(file.fileUploadId) ??
        asString(file.id) ??
        (isFileLikeRecord(media) ? asString(media.id) : null) ??
        null;
      if (!url && !fileId) return null;
      return { url, fileId };
    })
    .filter((entry): entry is { url: string | null; fileId: string | null } => Boolean(entry));

  const imageUrls = images.map((entry) => entry.url).filter((url): url is string => Boolean(url));
  const preferredCoverUrl =
    [
      asString(item.coverImage),
      asString(item.thumbnail),
      asString(item.thumbnailUrl),
      asString(item.imageUrl),
      asString(rawImage.url),
      asString(rawImage.s3Url),
      asString(rawImage.secureUrl),
      imageUrls.find((url) => !isLoopbackHttpUrl(url)),
      imageUrls[0],
    ].find((candidate): candidate is string => typeof candidate === 'string' && !isLoopbackHttpUrl(candidate)) ??
    [
      asString(item.coverImage),
      asString(item.thumbnail),
      asString(item.thumbnailUrl),
      asString(item.imageUrl),
      asString(rawImage.url),
      asString(rawImage.s3Url),
      asString(rawImage.secureUrl),
      imageUrls[0],
    ].find((candidate): candidate is string => Boolean(candidate)) ??
    null;

  const variants = Array.isArray(item.variants)
    ? item.variants
        .map((entry) => {
          const variant = asRecord(entry);
          return {
            id: asString(variant.id) ?? undefined,
            size: asString(variant.size),
            color: asString(variant.color),
            stock: asNumber(variant.stock),
          };
        })
        .filter((entry) => entry.stock > 0 || entry.size || entry.color)
    : [];

  const stock = asNumber(item.stock ?? item.stockCount ?? item.totalStock);

  return {
    id,
    entityType: resolveCatalogEntityType(raw, 'PRODUCT') ?? 'PRODUCT',
    brandId: asString(item.brandId),
    brandName: asString(item.brandName) ?? asString(rawBrand.name),
    brandLogo:
      asString(item.brandLogo) ??
      asString(item.logoUrl) ??
      asString(rawBrand.logo) ??
      asString(rawBrand.logoUrl) ??
      asString(rawBrand.profileImage) ??
      asString(rawBrandLogoFile.url) ??
      asString(rawBrandLogoFile.s3Url) ??
      null,
    brandLogoFileId:
      asString(item.brandLogoFileId) ??
      asString(item.brandLogoId) ??
      asString(rawBrand.logoFileId) ??
      asString(rawBrand.logoImageId) ??
      asString(rawBrandLogoFile.id) ??
      asString(rawBrandLogoFile.fileId) ??
      null,
    name: asString(item.name ?? item.title) ?? 'Untitled product',
    description: asString(item.description),
    price: asNumber(item.price),
    salePrice: item.salePrice !== null && item.salePrice !== undefined ? asNumber(item.salePrice) : null,
    effectivePrice: item.effectivePrice !== null && item.effectivePrice !== undefined ? asNumber(item.effectivePrice) : null,
    compareAtPrice:
      item.compareAtPrice !== null && item.compareAtPrice !== undefined
        ? asNumber(item.compareAtPrice)
        : null,
    currency: asString(item.currency) ?? 'NGN',
    coverImage: preferredCoverUrl,
    coverImageId:
      asString(item.coverImageId) ??
      asString(item.coverImageFileId) ??
      asString(item.thumbnailId) ??
      asString(item.thumbnailFileId) ??
      asString(rawImage.fileId) ??
      asString(rawImage.fileUploadId) ??
      asString(rawImage.uploadFileId) ??
      (isFileLikeRecord(rawImage) ? asString(rawImage.id) : null) ??
      images.find((entry) => entry.fileId && entry.url === preferredCoverUrl)?.fileId ??
      images.find((entry) => entry.fileId && !isLoopbackHttpUrl(entry.url ?? ''))?.fileId ??
      images[0]?.fileId ??
      null,
    images,
    stock,
    sizes: asStringList(item.sizes),
    colors: asStringList(item.colors),
    variants,
    customOrderEnabled: Boolean(item.customOrderEnabled),
    categoryName:
      asString(item.categoryName) ??
      asString(rawCategory.name) ??
      asString(rawCategoryType.name) ??
      null,
    categorySlug:
      asString(item.categorySlug) ??
      asString(rawCategory.slug) ??
      asString(rawCategoryType.slug) ??
      null,
    tags: asStringList(item.tags),
    isWishlisted: Boolean(item.isWishlisted),
    createdAt: asString(item.createdAt),
  };
};

const normalizeBagStatus = (
  payload: unknown,
  fallbackProductId: string,
  fallbackSourceType: BagSourceType = 'PRODUCT',
  fallbackSourceId = fallbackProductId,
): ProductBagStatus => {
  const data = unwrapData<Record<string, unknown>>(payload);
  const modes = asRecord(data?.modes);
  const standard = asRecord(data?.standard);
  const custom = asRecord(data?.custom);
  const customOrder = asRecord(data?.customOrder);
  const duplicateState = asRecord(data?.duplicateState);
  const standardAvailable = Boolean(standard.available ?? standard.enabled);
  const standardBagged = Boolean(standard.alreadyBagged ?? standard.inBag);
  const customAvailable = Boolean(custom.available ?? customOrder.enabled);
  const customBagged = Boolean(custom.alreadyBagged ?? customOrder.inBag);
  const customSessionId = asString(custom.checkoutSessionId) ?? asString(customOrder.sessionId);
  const customIntentId = asString(custom.checkoutIntentId) ?? asString(customOrder.checkoutIntentId);
  const customConfigurationId = asString(custom.configurationId) ?? asString(customOrder.configurationId);
  const customRequiredKeys = asStringList(
    Array.isArray(custom.requiredMeasurementKeys)
      ? custom.requiredMeasurementKeys
      : customOrder.requiredMeasurementKeys,
  );
  const customFreeformIds = asStringList(
    Array.isArray(custom.requiredFreeformPointIds)
      ? custom.requiredFreeformPointIds
      : customOrder.requiredFreeformPointIds,
  );
  const customMissingKeys = asStringList(
    Array.isArray(custom.missingMeasurementKeys)
      ? custom.missingMeasurementKeys
      : customOrder.missingMeasurementKeys,
  );
  const fittingState =
    asString(custom.fittingState) ??
    (customRequiredKeys.length === 0
      ? 'NOT_REQUIRED'
      : customMissingKeys.length === 0 || customOrder.fittingsComplete !== false
        ? 'COMPLETE'
        : customMissingKeys.length === customRequiredKeys.length
          ? 'MISSING'
          : 'PARTIAL');
  const freshnessState =
    asString(custom.freshnessState) ??
    (fittingState === 'NOT_REQUIRED'
      ? 'NOT_REQUIRED'
      : fittingState === 'COMPLETE'
        ? 'FRESH'
        : fittingState);
  const canBag = Boolean(data?.canBag ?? data?.baggable);
  const disabledReason = asString(asRecord(data?.ui).disabledReason) ?? asString(data?.reason);

  return {
    productId: asString(data?.productId) ?? fallbackProductId,
    sourceType: (asString(data?.sourceType) as BagSourceType | null) ?? fallbackSourceType,
    sourceId: asString(data?.sourceId) ?? fallbackSourceId,
    canBag,
    bagMode: (asString(data?.bagMode) as ProductBagStatus['bagMode']) ?? (
      standardAvailable && customAvailable
        ? 'STANDARD_OR_CUSTOM'
        : standardAvailable
          ? 'STANDARD'
          : customAvailable
            ? 'CUSTOM'
            : 'UNAVAILABLE'
    ),
    baggable: canBag,
    reason: disabledReason,
    modes: {
      standard: Boolean(modes.standard ?? standardAvailable),
      customOrder: Boolean(modes.customOrder ?? customAvailable),
    },
    standard: {
      enabled: standardAvailable,
      inBag: standardBagged,
      cartItemId: asString(standard.cartItemId),
      selectedSize: asString(standard.selectedSize),
      selectedColor: asString(standard.selectedColor),
      quantity: asNumber(standard.quantity),
      requiresSize: Boolean(standard.requiresSize),
      requiresColor: Boolean(standard.requiresColor),
      sizes: asStringList(standard.sizes),
      colors: asStringList(standard.colors),
      stock: asNumber(standard.stock),
    },
    customOrder: {
      enabled: customAvailable,
      inBag: customBagged,
      sessionId: customSessionId,
      checkoutIntentId: customIntentId,
      configurationId: customConfigurationId,
      requiredMeasurementKeys: customRequiredKeys,
      requiredFreeformPointIds: customFreeformIds,
      fittingsComplete: fittingState === 'COMPLETE' || fittingState === 'NOT_REQUIRED',
      missingMeasurementKeys: customMissingKeys,
    },
    custom: {
      available: customAvailable,
      alreadyBagged: customBagged,
      checkoutSessionId: customSessionId,
      checkoutIntentId: customIntentId,
      configurationId: customConfigurationId,
      requiredMeasurementKeys: customRequiredKeys,
      requiredFreeformPointIds: customFreeformIds,
      fittingState: fittingState as ProductBagStatus['custom']['fittingState'],
      freshnessState: freshnessState as ProductBagStatus['custom']['freshnessState'],
      missingMeasurementKeys: customMissingKeys,
      measurementUpdatedAt: asString(custom.measurementUpdatedAt),
      staleAfterDays: asNumber(custom.staleAfterDays, 14),
      staleAt: asString(custom.staleAt),
      requiresStaleConfirmation: Boolean(custom.requiresStaleConfirmation),
    },
    duplicateState: {
      inBag: Boolean(duplicateState.inBag ?? customBagged),
      submittedUnpaid: Boolean(duplicateState.submittedUnpaid),
      paidActive: Boolean(duplicateState.paidActive),
      completedPolicy: (asString(duplicateState.completedPolicy) as ProductBagStatus['duplicateState']['completedPolicy']) ?? 'UNKNOWN',
      reason: asString(duplicateState.reason),
    },
    stockState: (asString(data?.stockState) as ProductBagStatus['stockState']) ?? (
      standardAvailable
        ? 'IN_STOCK'
        : customAvailable
          ? 'CUSTOM_ONLY'
          : 'UNAVAILABLE'
    ),
    userState: {
      authenticated: Boolean(asRecord(data?.userState).authenticated),
      isOwner: Boolean(asRecord(data?.userState).isOwner),
      hasPreviouslyBaggedOrOrdered: Boolean(asRecord(data?.userState).hasPreviouslyBaggedOrOrdered),
    },
    ui: {
      heartbeatState: (asString(asRecord(data?.ui).heartbeatState) as ProductBagStatus['ui']['heartbeatState']) ?? (
        !canBag
          ? 'disabled'
          : standardBagged || customBagged
            ? 'currently_bagged'
            : 'not_bagged'
      ),
      defaultAction: (asString(asRecord(data?.ui).defaultAction) as ProductBagStatus['ui']['defaultAction']) ?? (
        !canBag
          ? 'DISABLED'
          : standardAvailable && (Boolean(standard.requiresSize) || Boolean(standard.requiresColor))
            ? 'OPEN_SELECTOR'
            : standardAvailable
              ? 'ADD_STANDARD'
              : freshnessState === 'STALE'
                ? 'CONFIRM_STALE_FITTINGS'
                : fittingState === 'MISSING' || fittingState === 'PARTIAL'
                ? 'OPEN_FITTINGS'
                : 'OPEN_CUSTOM_FLOW'
      ),
      disabledReason,
    },
  };
};

export const MobileStoreApi = {
  async getMarketplaceProducts(params: MarketplaceProductParams = {}): Promise<MarketplaceProductsResponse> {
    const response = await apiClient.get('/products/market', {
      params: {
        limit: params.limit ?? 36,
        cursor: params.cursor ?? undefined,
        category: params.category ?? undefined,
        minPrice: params.minPrice ?? undefined,
        maxPrice: params.maxPrice ?? undefined,
        tags: params.tags && params.tags.length > 0 ? params.tags : undefined,
        sortBy: params.sortBy ?? 'newest',
        search: params.search ?? undefined,
      },
    });

    const payload = unwrapProductListPayload(response.data);

    return {
      items: payload.items
        .map((entry) => normalizeProduct(entry))
        .filter((entry): entry is StoreProduct => Boolean(entry)),
      hasNextPage: payload.hasNextPage,
      nextCursor: payload.nextCursor,
      total: payload.total,
    };
  },

  async getBrandProducts(brandId: string, limit = 60): Promise<StoreProduct[]> {
    const normalizedBrandId = asString(brandId);
    if (!normalizedBrandId) {
      return [];
    }

    const response = await apiClient.get(`/store/brands/${encodeURIComponent(normalizedBrandId)}/products`, {
      params: {
        limit,
      },
    });

    const payload = unwrapProductListPayload(response.data);

    return payload.items
      .map((entry) => normalizeProduct(entry))
      .filter((entry): entry is StoreProduct => Boolean(entry));
  },

  async getProductById(productId: string): Promise<StoreProduct> {
    const response = await apiClient.get(`/store/products/${productId}`);
    const payload = unwrapData<unknown>(response.data);
    const product = normalizeProduct(payload);
    if (!product) {
      throw new Error('Product unavailable');
    }
    return product;
  },

  async getProductBagStatus(productId: string): Promise<ProductBagStatus> {
    try {
      const response = await apiClient.get(`/store/products/${productId}/bag-status`);
      return normalizeBagStatus(response.data, productId);
    } catch (error: any) {
      if (Number(error?.response?.status) !== 404) {
        throw error;
      }

      const [productRes, cartRes, customConfigRes, customBagRes] = await Promise.allSettled([
        MobileStoreApi.getProductById(productId),
        MobileStoreApi.getCart(),
        MobileStoreApi.getActiveCustomConfiguration(productId),
        MobileStoreApi.listCustomBag(),
      ]);
      if (productRes.status !== 'fulfilled') {
        throw error;
      }

      const product = productRes.value;
      const cartItem =
        cartRes.status === 'fulfilled'
          ? cartRes.value.items.find((item) => item.productId === productId) ?? null
          : null;
      const customConfig = customConfigRes.status === 'fulfilled' ? customConfigRes.value : null;
      const customBagLine =
        customBagRes.status === 'fulfilled'
          ? customBagRes.value.items.find((item) => item.sourceType === 'PRODUCT' && item.sourceId === productId) ?? null
          : null;
      const inStock = product.stock > 0 || product.variants.some((variant) => variant.stock > 0);
      const requiresSize = product.variants.some((variant) => Boolean(variant.size)) || product.sizes.length > 0;
      const requiresColor = product.variants.some((variant) => Boolean(variant.color)) || product.colors.length > 0;
      const customAvailable = Boolean(product.customOrderEnabled && customConfig?.isActive);
      const canBag = inStock || customAvailable;
      const missingKeys = customConfig?.requiredMeasurementKeys ?? [];
      const fittingState = missingKeys.length > 0 ? 'MISSING' : 'NOT_REQUIRED';

      return {
        productId,
        sourceType: 'PRODUCT',
        sourceId: productId,
        canBag,
        bagMode: inStock && customAvailable ? 'STANDARD_OR_CUSTOM' : inStock ? 'STANDARD' : customAvailable ? 'CUSTOM' : 'UNAVAILABLE',
        baggable: canBag,
        reason: null,
        modes: {
          standard: inStock,
          customOrder: customAvailable,
        },
        standard: {
          enabled: inStock,
          inBag: Boolean(cartItem),
          cartItemId: cartItem?.id ?? null,
          selectedSize: null,
          selectedColor: null,
          quantity: cartItem ? 1 : 0,
          requiresSize,
          requiresColor,
          sizes: product.sizes,
          colors: product.colors,
          stock: product.stock,
        },
        customOrder: {
          enabled: customAvailable,
          inBag: Boolean(customBagLine),
          sessionId: customBagLine?.sessionId ?? null,
          checkoutIntentId: null,
          configurationId: customConfig?.id ?? null,
          requiredMeasurementKeys: missingKeys,
          requiredFreeformPointIds: [],
          fittingsComplete: false,
          missingMeasurementKeys: missingKeys,
        },
        custom: {
          available: customAvailable,
          alreadyBagged: Boolean(customBagLine),
          checkoutSessionId: customBagLine?.sessionId ?? null,
          checkoutIntentId: null,
          configurationId: customConfig?.id ?? null,
          requiredMeasurementKeys: missingKeys,
          requiredFreeformPointIds: [],
          fittingState,
          freshnessState: fittingState === 'MISSING' ? 'MISSING' : 'NOT_REQUIRED',
          missingMeasurementKeys: missingKeys,
          measurementUpdatedAt: null,
          staleAfterDays: 14,
          staleAt: null,
          requiresStaleConfirmation: false,
        },
        duplicateState: {
          inBag: Boolean(customBagLine),
          submittedUnpaid: false,
          paidActive: false,
          completedPolicy: 'UNKNOWN',
          reason: null,
        },
        stockState: inStock ? 'IN_STOCK' : customAvailable ? 'CUSTOM_ONLY' : 'OUT_OF_STOCK',
        userState: {
          authenticated: true,
          isOwner: false,
          hasPreviouslyBaggedOrOrdered: Boolean(cartItem || customBagLine),
        },
        ui: {
          heartbeatState: !canBag
            ? 'disabled'
            : cartItem || customBagLine
              ? 'currently_bagged'
              : 'not_bagged',
          defaultAction: !canBag
            ? 'DISABLED'
            : inStock && (requiresSize || requiresColor)
              ? 'OPEN_SELECTOR'
              : inStock
                ? 'ADD_STANDARD'
                : fittingState === 'MISSING'
                  ? 'OPEN_FITTINGS'
                  : 'OPEN_CUSTOM_FLOW',
          disabledReason: null,
        },
      };
    }
  },

  async getSourceBagStatus(sourceType: BagSourceType, sourceId: string): Promise<ProductBagStatus> {
    const normalizedSourceType = sourceType.toUpperCase() as BagSourceType;
    const response = await apiClient.get(`/bag/sources/${normalizedSourceType}/${sourceId}/status`);
    return normalizeBagStatus(response.data, sourceId, normalizedSourceType, sourceId);
  },

  async getBagCount(): Promise<BagCount> {
    const response = await apiClient.get('/bag/count');
    const payload = unwrapData<Record<string, unknown>>(response.data);
    const standardQuantity = asNumber(payload?.standardQuantity);
    const customLineCount = asNumber(payload?.customLineCount);
    return {
      standardQuantity,
      customLineCount,
      combinedCount: asNumber(payload?.combinedCount, standardQuantity + customLineCount),
    };
  },

  async getCart(): Promise<CartState> {
    const response = await apiClient.get('/store/cart');
    const payload = unwrapData<Record<string, unknown>>(response.data);
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const mapped = items
      .map((entry) => {
        const item = asRecord(entry);
        const product = asRecord(item.product);
        const id = asString(item.id);
        const productId = asString(item.productId) ?? asString(product.id);
        if (!id || !productId) return null;
        return { id, productId };
      })
      .filter((entry): entry is { id: string; productId: string } => Boolean(entry));

    return {
      items: mapped,
      itemCount: asNumber(payload?.itemCount, mapped.length),
      totalQuantity: asNumber(payload?.totalQuantity, mapped.length),
    };
  },

  async addToCart(payload: {
    productId: string;
    quantity?: number;
    selectedSize?: string;
    selectedColor?: string;
  }): Promise<CartState> {
    const response = await apiClient.post('/store/cart', {
      productId: payload.productId,
      quantity: payload.quantity ?? 1,
      selectedSize: payload.selectedSize,
      selectedColor: payload.selectedColor,
    });
    return unwrapData<CartState>(response.data);
  },

  async removeCartItem(cartItemId: string): Promise<void> {
    await apiClient.delete(`/store/cart/${cartItemId}`);
  },

  async getWishlist(limit = 200): Promise<WishlistState> {
    const response = await apiClient.get('/store/wishlist', {
      params: {
        page: 1,
        limit,
      },
    });

    const payload = unwrapData<Record<string, unknown>>(response.data);
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const mapped = items
      .map((entry) => {
        const item = asRecord(entry);
        const product = asRecord(item.product);
        const id = asString(item.id);
        const productId = asString(item.productId) ?? asString(product.id);
        if (!id || !productId) return null;
        return { id, productId };
      })
      .filter((entry): entry is { id: string; productId: string } => Boolean(entry));

    return {
      items: mapped,
      total: asNumber(payload?.total, mapped.length),
    };
  },

  async addToWishlist(productId: string): Promise<void> {
    await apiClient.post('/store/wishlist', { productId });
  },

  async removeFromWishlist(productId: string): Promise<void> {
    await apiClient.delete(`/store/wishlist/${productId}`);
  },

  async getActiveCustomConfiguration(productId: string): Promise<ActiveCustomConfiguration | null> {
    try {
      const response = await apiClient.get(`/products/${productId}/custom-order-configuration`);
      const payload = unwrapData<Record<string, unknown>>(response.data);
      const id = asString(payload?.id);
      if (!id) return null;
      return {
        id,
        requiredMeasurementKeys: asStringList(payload?.requiredMeasurementKeys),
        isActive: payload?.isActive !== false,
      };
    } catch (error: any) {
      if (Number(error?.response?.status) === 404) {
        return null;
      }
      throw error;
    }
  },

  async previewCustomPrice(payload: {
    configurationId: string;
    measurementValues: Record<string, number>;
    rushSelected?: boolean;
    shippingAddress?: Record<string, unknown>;
  }): Promise<CustomPricePreview> {
    const response = await apiClient.post('/custom-orders/price-preview', {
      configurationId: payload.configurationId,
      measurementValues: payload.measurementValues,
      rushSelected: Boolean(payload.rushSelected),
      shippingAddress: payload.shippingAddress,
      idempotencyKey: toIdempotencyKey(),
    });

    const data = unwrapData<Record<string, unknown>>(response.data);
    return {
      checkoutIntentId: asString(data?.checkoutIntentId),
      configurationVersionId: asString(data?.configurationVersionId) ?? undefined,
      quoteStatus: asString(data?.quoteStatus) ?? undefined,
    };
  },

  async addCustomOrderToBag(payload: {
    checkoutIntentId: string;
    configurationId: string;
    configurationVersionId?: string;
    measurementValues: Record<string, number>;
    shippingAddress: Record<string, unknown>;
    contactInfo: Record<string, unknown>;
    customerName: string;
    noDirectMatchAcknowledged?: boolean;
  }): Promise<void> {
    const idempotencyKey = toIdempotencyKey();

    await apiClient.post(
      '/custom-orders',
      {
        checkoutIntentId: payload.checkoutIntentId,
        configurationId: payload.configurationId,
        configurationVersionId: payload.configurationVersionId,
        measurementValues: payload.measurementValues,
        rushSelected: false,
        shippingAddress: payload.shippingAddress,
        contactInfo: payload.contactInfo,
        customerName: payload.customerName,
        idempotencyKey,
        noDirectMatchAcknowledged: payload.noDirectMatchAcknowledged,
      },
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },

  async listCustomBag(): Promise<CustomBagState> {
    const response = await apiClient.get('/custom-orders/checkout-bag');
    const payload = unwrapData<Record<string, unknown>>(response.data);
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const mapped = items
      .map((entry) => {
        const item = asRecord(entry);
        const sessionId = asString(item.sessionId);
        const sourceType = asString(item.sourceType);
        const sourceId = asString(item.sourceId);
        if (!sessionId || !sourceType || !sourceId) return null;
        return { sessionId, sourceType, sourceId };
      })
      .filter((entry): entry is { sessionId: string; sourceType: string; sourceId: string } => Boolean(entry));

    return {
      items: mapped,
      total: asNumber(payload?.total, mapped.length),
    };
  },

  async removeCustomBagLine(sessionId: string): Promise<void> {
    await apiClient.delete(`/custom-orders/checkout-sessions/${sessionId}`);
  },
};

export default MobileStoreApi;
