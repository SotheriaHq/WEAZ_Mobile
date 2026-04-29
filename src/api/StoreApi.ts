import { apiClient } from '@/src/api/httpClient';

export interface StoreProductVariant {
  id?: string;
  size?: string | null;
  color?: string | null;
  stock: number;
}

export interface StoreProduct {
  id: string;
  brandId?: string | null;
  name: string;
  description?: string | null;
  price: number;
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

export interface ProductBagStatus {
  productId: string;
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

const toIdempotencyKey = () => `mob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeProduct = (raw: unknown): StoreProduct | null => {
  const item = asRecord(raw);
  const id = asString(item.id);
  if (!id) return null;

  const rawImage = asRecord(item.image);
  const rawCategory = asRecord(item.category);
  const rawCategoryType = asRecord(item.categoryType);

  const rawImages = Array.isArray(item.images)
    ? item.images
    : Array.isArray(item.media)
      ? item.media
      : [];

  const images = rawImages
    .map((entry) => {
      const media = asRecord(entry);
      const file = asRecord(media.file);
      const url =
        asString(media.url) ??
        asString(media.s3Url) ??
        asString(file.s3Url) ??
        asString(file.url) ??
        null;
      const fileId =
        asString(media.fileId) ??
        asString(media.id) ??
        asString(file.id) ??
        asString(file.fileId) ??
        null;
      if (!url && !fileId) return null;
      return { url, fileId };
    })
    .filter((entry): entry is { url: string | null; fileId: string | null } => Boolean(entry));

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
    brandId: asString(item.brandId),
    name: asString(item.name ?? item.title) ?? 'Untitled product',
    description: asString(item.description),
    price: asNumber(item.price),
    compareAtPrice:
      item.compareAtPrice !== null && item.compareAtPrice !== undefined
        ? asNumber(item.compareAtPrice)
        : null,
    currency: asString(item.currency) ?? 'NGN',
    coverImage:
      asString(item.coverImage) ??
      asString(item.thumbnail) ??
      asString(item.thumbnailUrl) ??
      asString(rawImage.url) ??
      asString(rawImage.s3Url) ??
      images[0]?.url ??
      null,
    coverImageId:
      asString(item.coverImageId) ??
      asString(item.thumbnailFileId) ??
      asString(rawImage.fileId) ??
      asString(rawImage.id) ??
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
    isWishlisted: Boolean(item.isWishlisted),
    createdAt: asString(item.createdAt),
  };
};

const normalizeBagStatus = (payload: unknown, fallbackProductId: string): ProductBagStatus => {
  const data = unwrapData<Record<string, unknown>>(payload);
  const modes = asRecord(data?.modes);
  const standard = asRecord(data?.standard);
  const customOrder = asRecord(data?.customOrder);

  return {
    productId: asString(data?.productId) ?? fallbackProductId,
    baggable: Boolean(data?.baggable),
    reason: asString(data?.reason),
    modes: {
      standard: Boolean(modes.standard),
      customOrder: Boolean(modes.customOrder),
    },
    standard: {
      enabled: Boolean(standard.enabled),
      inBag: Boolean(standard.inBag),
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
      enabled: Boolean(customOrder.enabled),
      inBag: Boolean(customOrder.inBag),
      sessionId: asString(customOrder.sessionId),
      checkoutIntentId: asString(customOrder.checkoutIntentId),
      configurationId: asString(customOrder.configurationId),
      requiredMeasurementKeys: asStringList(customOrder.requiredMeasurementKeys),
      requiredFreeformPointIds: asStringList(customOrder.requiredFreeformPointIds),
      fittingsComplete: customOrder.fittingsComplete !== false,
      missingMeasurementKeys: asStringList(customOrder.missingMeasurementKeys),
    },
  };
};

export const MobileStoreApi = {
  async getBrandProducts(brandId: string, limit = 60): Promise<StoreProduct[]> {
    const response = await apiClient.get('/products/market', {
      params: {
        brandId,
        limit,
      },
    });

    const payload = unwrapData<Record<string, unknown>>(response.data);
    const items = Array.isArray(payload?.items) ? payload.items : [];

    return items
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

      return {
        productId,
        baggable: inStock || Boolean(product.customOrderEnabled && customConfig?.isActive),
        reason: null,
        modes: {
          standard: inStock,
          customOrder: Boolean(product.customOrderEnabled && customConfig?.isActive),
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
          enabled: Boolean(product.customOrderEnabled && customConfig?.isActive),
          inBag: Boolean(customBagLine),
          sessionId: customBagLine?.sessionId ?? null,
          checkoutIntentId: null,
          configurationId: customConfig?.id ?? null,
          requiredMeasurementKeys: customConfig?.requiredMeasurementKeys ?? [],
          requiredFreeformPointIds: [],
          fittingsComplete: false,
          missingMeasurementKeys: customConfig?.requiredMeasurementKeys ?? [],
        },
      };
    }
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
  }): Promise<CustomPricePreview> {
    const response = await apiClient.post('/custom-orders/price-preview', {
      configurationId: payload.configurationId,
      measurementValues: payload.measurementValues,
      rushSelected: Boolean(payload.rushSelected),
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
