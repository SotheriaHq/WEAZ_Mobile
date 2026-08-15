import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  brandApi,
  type BrandProfileDto,
  type CollectionDetailDto,
  type CollectionDto,
  type CollectionPublicationStatus,
  type CollectionScope,
} from '@/src/api/BrandApi';
import { getDesignDetail, type DesignDetail } from '@/src/api/DesignApi';
import {
  WIEZ_MEDIA_URL_GC_TIME_MS,
  WIEZ_QUERY_STALE_TIME_MS,
} from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

type EnabledOption = { enabled?: boolean };

type BrandCollectionsArgs = {
  ownerId?: string | null;
  scope?: CollectionScope;
  visibility?: 'PUBLIC' | 'PRIVATE';
  status?: CollectionPublicationStatus | CollectionPublicationStatus[];
  limit?: number;
};

const isEnabled = (value: unknown, enabled = true) => Boolean(value) && enabled;

export function useBrandProfileQuery(brandId?: string | null, options?: EnabledOption) {
  const queryKey = queryKeys.brand.profile(brandId);
  return useQuery({
    queryKey,
    queryFn: () => brandApi.getProfileById(String(brandId)),
    enabled: isEnabled(brandId, options?.enabled ?? true),
    /**
     * Opts out of the global `refetchOnMount: false` perf default.
     *
     * The query cache is PERSISTED to storage, so without this a mount is
     * served data from a previous app launch and nothing ever refetches it —
     * the only escape was an explicit pull-to-refresh. For these queries that
     * is a correctness bug, not an acceptable stale read: it is what made a
     * brand's own email arrive blank on their profile, and what let catalog
     * tab counts sit on last session's numbers. `true` (not 'always') still
     * respects staleTime, so a remount inside the stale window is free and the
     * tab-navigator thrash the default guards against does not return.
     */
    refetchOnMount: true,
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
  const queryKey = queryKeys.brand.collections(ownerId, { scope, visibility, status, limit });
  return useQuery({
    queryKey,
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

export function useBrandDraftsQuery(
  options?: EnabledOption & { ownerId?: string | null },
) {
  const queryKey = queryKeys.brand.collections(options?.ownerId ?? 'me', {
    scope: 'all',
    status: 'DRAFT',
  });
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Drafts use the dedicated /designs/my/drafts endpoint (merged with store
      // drafts) via brandApi.getDrafts. `getMyDrafts` never existed and crashed
      // with "undefined is not a function" on catalogue entry.
      return brandApi.getDrafts({ ownerId: options?.ownerId });
    },
    enabled: isEnabled(options?.ownerId, options?.enabled ?? true),
    // Matches the other two owner buckets. This query now runs on catalogue
    // entry (the tab bar needs its count before the tab is opened), so re-entry
    // inside the stale window must not refetch.
    staleTime: WIEZ_QUERY_STALE_TIME_MS,
    /**
     * Opts out of the global `refetchOnMount: false` perf default.
     *
     * The query cache is PERSISTED to storage, so without this a mount is
     * served data from a previous app launch and nothing ever refetches it —
     * the only escape was an explicit pull-to-refresh. For these queries that
     * is a correctness bug, not an acceptable stale read: it is what made a
     * brand's own email arrive blank on their profile, and what let catalog
     * tab counts sit on last session's numbers. `true` (not 'always') still
     * respects staleTime, so a remount inside the stale window is free and the
     * tab-navigator thrash the default guards against does not return.
     */
    refetchOnMount: true,
  });
}

  export function useBrandNeedsAttentionQuery(
    options?: EnabledOption & { ownerId?: string | null; isFocused?: boolean },
  ) {
    /**
     * Needs Attention = everything the owner must act on before it can go live.
     *
     * CHANGES_REQUESTED used to sit in its own tab on the grounds that it is a
     * different state from FAILED. It is — but not to the person holding the
     * phone: both mean "this is handed back to you, open it and change
     * something", and splitting them made the owner check two tabs to answer
     * one question, with the work spread across both.
     */
    const statusFilter: any = ['FAILED', 'PROCESSING', 'CHANGES_REQUESTED'];
    const queryKey = queryKeys.brand.collections(options?.ownerId ?? 'me', {
      scope: 'all',
      status: statusFilter,
    });
    return useQuery({
      queryKey,
      queryFn: async () => {
        const result = await brandApi.getCollections({
          brandId: options?.ownerId ?? undefined,
          scope: 'all',
          status: statusFilter,
          limit: 50,
        });
        return result.items;
      },
      enabled: isEnabled(options?.ownerId, options?.enabled ?? true),
      staleTime: WIEZ_QUERY_STALE_TIME_MS,
      /**
       * Opts out of the global `refetchOnMount: false` perf default.
       *
       * The query cache is PERSISTED to storage, so without this a mount is
       * served data from a previous app launch and nothing ever refetches it —
       * the only escape was an explicit pull-to-refresh. For these queries that
       * is a correctness bug, not an acceptable stale read: it is what made a
       * brand's own email arrive blank on their profile, and what let catalog
       * tab counts sit on last session's numbers. `true` (not 'always') still
       * respects staleTime, so a remount inside the stale window is free and the
       * tab-navigator thrash the default guards against does not return.
       */
      refetchOnMount: true,
    });
  }

  export function useBrandInReviewQuery(
    options?: EnabledOption & { ownerId?: string | null; isFocused?: boolean },
  ) {
      // Dedicated always-on query so the In Review count/content preloads on
    // catalogue entry instead of waiting until the In Review tab is tapped.
    const statusFilter: any = 'IN_REVIEW';
    const queryKey = queryKeys.brand.collections(options?.ownerId ?? 'me', {
      scope: 'all',
      status: statusFilter,
    });
    return useQuery({
      queryKey,
      queryFn: async () => {
        const result = await brandApi.getCollections({
          brandId: options?.ownerId ?? undefined,
          scope: 'all',
          status: statusFilter,
          limit: 50,
        });
        return result.items;
      },
      enabled: isEnabled(options?.ownerId, options?.enabled ?? true),
      staleTime: WIEZ_QUERY_STALE_TIME_MS,
      /**
       * Opts out of the global `refetchOnMount: false` perf default.
       *
       * The query cache is PERSISTED to storage, so without this a mount is
       * served data from a previous app launch and nothing ever refetches it —
       * the only escape was an explicit pull-to-refresh. For these queries that
       * is a correctness bug, not an acceptable stale read: it is what made a
       * brand's own email arrive blank on their profile, and what let catalog
       * tab counts sit on last session's numbers. `true` (not 'always') still
       * respects staleTime, so a remount inside the stale window is free and the
       * tab-navigator thrash the default guards against does not return.
       */
      refetchOnMount: true,
    });
  }

export async function refreshBrandDraftsQuery(
  queryClient: QueryClient,
  ownerId?: string | null,
) {
  const drafts = await brandApi.getDrafts({ ownerId, forceRefresh: true });
  queryClient.setQueryData(
    queryKeys.brand.collections(ownerId ?? 'me', {
      scope: 'all',
      status: 'DRAFT',
    }),
    drafts,
  );
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
    staleTime: WIEZ_QUERY_STALE_TIME_MS,
  });
}

export function useMediaSignedUrlQuery(fileId?: string | null, options?: EnabledOption) {
  return useQuery({
    queryKey: queryKeys.media.signedUrl(fileId),
    queryFn: () => brandApi.getPrivateSignedFileUrl(String(fileId)),
    enabled: isEnabled(fileId, options?.enabled ?? true),
    staleTime: WIEZ_QUERY_STALE_TIME_MS,
    // Not the stale time: evicting a signed URL the moment the screen unmounts
    // forces a re-mint per image on return, which re-downloads the grid.
    gcTime: WIEZ_MEDIA_URL_GC_TIME_MS,
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
