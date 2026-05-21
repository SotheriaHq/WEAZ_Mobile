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
    cart: () => ['store', 'cart'] as const,
    wishlist: (params?: Record<string, unknown> | null) => ['store', 'wishlist', normalizeRecord(params)] as const,
    bagCount: () => ['store', 'bagCount'] as const,
  },
  config: {
    uploadLimits: () => ['config', 'uploadLimits'] as const,
  },
  categories: {
    filters: (view?: string | null) => ['categories', 'filters', normalizeId(view)] as const,
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
    root: () => ['saved'] as const,
    batch: (targetType?: string | null, targetIds?: Array<string | null | undefined> | null) =>
      ['saved', 'batch', normalizeId(targetType), normalizeIdList(targetIds)] as const,
  },
};

export const isPersistableThreadlyQueryKey = (queryKey: readonly unknown[]) => {
  const [root, scope] = queryKey;
  if (root === 'brand' || root === 'design' || root === 'designs' || root === 'config' || root === 'categories') {
    return true;
  }
  if (root === 'media') {
    return scope === 'publicUrl';
  }
  return false;
};
