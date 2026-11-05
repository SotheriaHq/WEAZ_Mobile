import type { QueryClient } from '@tanstack/react-query';

/** Keep cached cards visible while revalidating only the routed catalogue. */
export async function refreshCatalogQueries(
  queryClient: QueryClient,
  ownerId: string | null | undefined,
  profileId: string | null | undefined,
) {
  if (!ownerId || !profileId) return;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['brand', 'collections', ownerId] }),
    queryClient.invalidateQueries({ queryKey: ['brand', 'profile', profileId] }),
  ]);
}
