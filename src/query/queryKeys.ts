export type CollectionVisibilityKey = 'PUBLIC' | 'PRIVATE' | 'DRAFT' | 'all' | null | undefined;
export type CollectionScopeKey = 'design' | 'store' | 'all' | null | undefined;

const normalizeId = (value?: string | null) => String(value ?? '').trim();

const normalizeRecord = (value?: Record<string, unknown> | null) => {
  if (!value) return {};
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const entry = value[key];
      if (entry !== undefined && entry !== null && entry !== '') {
        acc[key] = entry;
      }
      return acc;
    }, {});
};

const normalizeIdList = (values?: Array<string | null | undefined> | null) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeId(value))
        .filter(Boolean),
    ),
  ).sort();

type WishlistParams = Record<string, unknown> | null | undefined;

const resolveWishlistArgs = (
  userIdOrParams?: string | null | WishlistParams,
  params?: WishlistParams,
) => {
  if (
    userIdOrParams &&
    typeof userIdOrParams === 'object' &&
    !Array.isArray(userIdOrParams)
  ) {
    return { userId: '', params: userIdOrParams };
  }

  return {
    userId: normalizeId(userIdOrParams as string | null | undefined),
    params,
  };
};

const resolveSavedBatchArgs = (
  userIdOrTargetType?: string | null,
  targetTypeOrIds?: string | null | Array<string | null | undefined>,
  maybeTargetIds?: Array<string | null | undefined> | null,
) => {
  if (Array.isArray(targetTypeOrIds) || maybeTargetIds === undefined) {
    return {
      userId: '',
      targetType: normalizeId(userIdOrTargetType),
      targetIds: Array.isArray(targetTypeOrIds) ? targetTypeOrIds : maybeTargetIds,
    };
  }

  return {
    userId: normalizeId(userIdOrTargetType),
    targetType: normalizeId(targetTypeOrIds),
    targetIds: maybeTargetIds,
  };
};

export const queryKeys = {
  auth: {
    profile: () => ['auth', 'profile'] as const,
  },
  brand: {
    profile: (brandId?: string | null) => ['brand', 'profile', normalizeId(brandId)] as const,
    collections: (
      ownerId?: string | null,
      filters?: {
        scope?: CollectionScopeKey;
        visibility?: CollectionVisibilityKey;
        status?: string | null;
        limit?: number | null;
      },
    ) =>
      [
        'brand',
        'collections',
        normalizeId(ownerId),
        normalizeRecord({
          scope: filters?.scope ?? 'design',
          visibility: filters?.visibility ?? null,
          status: filters?.status ?? null,
          limit: filters?.limit ?? null,
        }),
      ] as const,
    collectionDetail: (collectionId?: string | null, scope?: CollectionScopeKey) =>
      ['brand', 'collectionDetail', normalizeId(collectionId), scope ?? 'design'] as const,
  },
  design: {
    detail: (designId?: string | null) => ['design', 'detail', normalizeId(designId)] as const,
  },
  designs: {
    user: (userId?: string | null, params?: Record<string, unknown> | null) =>
      ['designs', 'user', normalizeId(userId), normalizeRecord(params)] as const,
  },
  store: {
    status: () => ['store', 'status'] as const,
    cart: (userId?: string | null) => ['store', 'cart', normalizeId(userId)] as const,
    wishlistRoot: (userId?: string | null) => ['store', 'wishlist', normalizeId(userId)] as const,
    wishlist: (userIdOrParams?: string | null | WishlistParams, params?: WishlistParams) => {
      const resolved = resolveWishlistArgs(userIdOrParams, params);
      return ['store', 'wishlist', resolved.userId, normalizeRecord(resolved.params)] as const;
    },
    bagCount: (userId?: string | null) => ['store', 'bagCount', normalizeId(userId)] as const,
    brandProducts: (brandId?: string | null, params?: Record<string, unknown> | null) =>
      ['store', 'brandProducts', normalizeId(brandId), normalizeRecord(params)] as const,
    product: (productId?: string | null) => ['store', 'product', normalizeId(productId)] as const,
  },
  config: {
    uploadLimits: () => ['config', 'uploadLimits'] as const,
  },
  categories: {
    filters: (view?: string | null) => ['categories', 'filters', normalizeId(view)] as const,
    designCategories: () => ['categories', 'designCategories'] as const,
  },
  tags: {
    popular: (limit?: number | null) => ['tags', 'popular', limit ?? 50] as const,
  },
  measurementPoints: {
    byGender: (gender?: string | null) => ['measurementPoints', normalizeId(gender) || 'all'] as const,
  },
  media: {
    publicUrl: (fileId?: string | null) => ['media', 'publicUrl', normalizeId(fileId)] as const,
    signedUrl: (fileId?: string | null) => ['media', 'signedUrl', normalizeId(fileId)] as const,
  },
  notifications: {
    unreadCount: () => ['notifications', 'unreadCount'] as const,
  },
  messaging: {
    unreadCount: () => ['messaging', 'unreadCount'] as const,
  },
  saved: {
    root: (userId?: string | null) => ['saved', normalizeId(userId)] as const,
    batch: (
      userIdOrTargetType?: string | null,
      targetTypeOrIds?: string | null | Array<string | null | undefined>,
      maybeTargetIds?: Array<string | null | undefined> | null,
    ) => {
      const resolved = resolveSavedBatchArgs(userIdOrTargetType, targetTypeOrIds, maybeTargetIds);
      return ['saved', resolved.userId, 'batch', resolved.targetType, normalizeIdList(resolved.targetIds)] as const;
    },
  },
  reviews: {
    brand: (brandId?: string | null, params?: Record<string, unknown> | null) =>
      ['reviews', 'brand', normalizeId(brandId), normalizeRecord(params)] as const,
    product: (productId?: string | null, params?: Record<string, unknown> | null) =>
      ['reviews', 'product', normalizeId(productId), normalizeRecord(params)] as const,
  },
};

export const isPersistableThreadlyQueryKey = (queryKey: readonly unknown[]) => {
  const [root, scope] = queryKey;
  if (
    root === 'brand' ||
    root === 'design' ||
    root === 'designs' ||
    root === 'config' ||
    root === 'categories' ||
    root === 'measurementPoints'
  ) {
    return true;
  }
  if (root === 'store') {
    return scope === 'brandProducts' || scope === 'product';
  }
  if (root === 'media') {
    return scope === 'publicUrl';
  }
  return false;
};
