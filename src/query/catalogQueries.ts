import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  brandApi,
  type BrandProfileDto,
  type CollectionDetailDto,
  type CollectionDto,
  type CollectionScope,
} from '@/src/api/BrandApi';
import { getDesignDetail, type DesignDetail } from '@/src/api/DesignApi';
import { THREADLY_QUERY_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

type EnabledOption = { enabled?: boolean };

type BrandCollectionsArgs = {
  ownerId?: string | null;
  scope?: CollectionScope;
  visibility?: 'PUBLIC' | 'PRIVATE';
  status?: 'DRAFT' | 'PUBLISHED';
  limit?: number;
};

const isEnabled = (value: unknown, enabled = true) => Boolean(value) && enabled;

export function useBrandProfileQuery(brandId?: string | null, options?: EnabledOption) {
  return useQuery({
    queryKey: queryKeys.brand.profile(brandId),
    queryFn: () => brandApi.getProfileById(String(brandId)),
    enabled: isEnabled(brandId, options?.enabled ?? true),
  });
}

export async function refreshBrandProfileQuery(queryClient: QueryClient, brandId?: string | null) {
  if (!brandId) return null;
  const data = await brandApi.getProfileById(brandId, { forceRefresh: true });
  queryClient.setQueryData(queryKeys.brand.profile(brandId), data);
  return data;
}

export function useBrandCollectionsQuery(args: BrandCollectionsArgs, options?: EnabledOption) {
  const { ownerId, scope = 'design', visibility, status, limit } = args;
  return useQuery({
    queryKey: queryKeys.brand.collections(ownerId, { scope, visibility, status, limit }),
    queryFn: async () => {
      const result = await brandApi.getCollections({
        brandId: String(ownerId),
        scope,
        visibility,
        status,
        limit,
      });
      return result.items;
    },
    enabled: isEnabled(ownerId, options?.enabled ?? true),
  });
}

export async function refreshBrandCollectionsQuery(
  queryClient: QueryClient,
  args: BrandCollectionsArgs,
) {
  if (!args.ownerId) return [];
  const scope = args.scope ?? 'design';
  const result = await brandApi.getCollections({
    brandId: args.ownerId,
    scope,
    visibility: args.visibility,
    status: args.status,
    limit: args.limit,
    forceRefresh: true,
  });
  queryClient.setQueryData(
    queryKeys.brand.collections(args.ownerId, {
      scope,
      visibility: args.visibility,
      status: args.status,
      limit: args.limit,
    }),
    result.items,
  );
  return result.items;
}

export function useBrandDraftsQuery(options?: EnabledOption) {
  return useQuery({
    queryKey: queryKeys.designs.user('me', { status: 'DRAFT' }),
    queryFn: () => brandApi.getDrafts(),
    enabled: options?.enabled ?? true,
  });
}

export async function refreshBrandDraftsQuery(queryClient: QueryClient) {
  const drafts = await brandApi.getDrafts({ forceRefresh: true });
  queryClient.setQueryData(queryKeys.designs.user('me', { status: 'DRAFT' }), drafts);
  return drafts;
}

export function useUserDesignsQuery(args: BrandCollectionsArgs, options?: EnabledOption) {
  return useBrandCollectionsQuery({ ...args, scope: 'design' }, options);
}

export function useCollectionDetailQuery(
  collectionId?: string | null,
  scope?: CollectionScope,
  options?: EnabledOption,
): UseQueryResult<CollectionDetailDto | null, Error> {
  const queryClient = useQueryClient();
  const initialData =
    scope === 'design'
      ? queryClient.getQueryData<CollectionDetailDto>(queryKeys.design.detail(collectionId))
      : undefined;

  return useQuery<CollectionDetailDto | null>({
    queryKey: queryKeys.brand.collectionDetail(collectionId, scope),
    queryFn: async () => {
      const data = await brandApi.getCollectionDetail(String(collectionId), { scope });
      if (scope === 'design') {
        queryClient.setQueryData(queryKeys.design.detail(collectionId), data);
      }
      return data;
    },
    enabled: isEnabled(collectionId, options?.enabled ?? true),
    initialData,
  });
}

export async function refreshCollectionDetailQuery(
  queryClient: QueryClient,
  collectionId?: string | null,
  scope?: CollectionScope,
) {
  if (!collectionId) return null;
  const data = await brandApi.getCollectionDetail(collectionId, { scope, forceRefresh: true });
  queryClient.setQueryData(queryKeys.brand.collectionDetail(collectionId, scope), data);
  if (scope === 'design') {
    queryClient.setQueryData(queryKeys.design.detail(collectionId), data);
  }
  return data;
}

export function useDesignDetailQuery(designId?: string | null, options?: EnabledOption) {
  const queryClient = useQueryClient();
  const initialData = queryClient.getQueryData<DesignDetail>(
    queryKeys.brand.collectionDetail(designId, 'design'),
  );

  return useQuery<DesignDetail>({
    queryKey: queryKeys.design.detail(designId),
    queryFn: async () => {
      const data = await getDesignDetail(String(designId));
      queryClient.setQueryData(queryKeys.brand.collectionDetail(designId, 'design'), data);
      return data;
    },
    enabled: isEnabled(designId, options?.enabled ?? true),
    initialData,
  });
}

export function useMediaPublicUrlQuery(fileId?: string | null, options?: EnabledOption) {
  return useQuery({
    queryKey: queryKeys.media.publicUrl(fileId),
    queryFn: () => brandApi.getPublicFileUrl(String(fileId)),
    enabled: isEnabled(fileId, options?.enabled ?? true),
    staleTime: THREADLY_QUERY_STALE_TIME_MS,
  });
}

export function useMediaSignedUrlQuery(fileId?: string | null, options?: EnabledOption) {
  return useQuery({
    queryKey: queryKeys.media.signedUrl(fileId),
    queryFn: () => brandApi.getPrivateSignedFileUrl(String(fileId)),
    enabled: isEnabled(fileId, options?.enabled ?? true),
    staleTime: THREADLY_QUERY_STALE_TIME_MS,
    gcTime: THREADLY_QUERY_STALE_TIME_MS,
  });
}

export const setCollectionDetailQueryData = (
  queryClient: QueryClient,
  collectionId: string,
  scope: CollectionScope | undefined,
  detail: unknown,
) => {
  queryClient.setQueryData(queryKeys.brand.collectionDetail(collectionId, scope), detail);
};

export const setBrandCollectionsQueryData = (
  queryClient: QueryClient,
  args: BrandCollectionsArgs,
  updater: (items: CollectionDto[]) => CollectionDto[],
) => {
  const scope = args.scope ?? 'design';
  queryClient.setQueryData<CollectionDto[]>(
    queryKeys.brand.collections(args.ownerId, {
      scope,
      visibility: args.visibility,
      status: args.status,
      limit: args.limit,
    }),
    (current) => updater(current ?? []),
  );
};

export const setBrandProfileQueryData = (
  queryClient: QueryClient,
  brandId: string,
  profile: BrandProfileDto | null,
) => {
  queryClient.setQueryData(queryKeys.brand.profile(brandId), profile);
};
