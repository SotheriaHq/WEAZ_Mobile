# Phase 2 Query Cache Baseline

Phase 2 introduces TanStack Query only for the measured mobile hot paths from Phase 0/1:

- catalog brand profile
- catalog collection lists and draft lists
- collection/design detail viewer
- media public URL and private signed URL resolution

The existing feed SecureStore stale-first cache remains owned by the feed implementation. Feed pagination is not migrated in this phase.

## Provider

`src/query/QueryProvider.tsx` is wired in `app/_layout.tsx` around the existing app providers. It uses `PersistQueryClientProvider` and an AsyncStorage persister.

The React Native `AppState` is bridged into TanStack Query's `focusManager`, but native background/resume behavior is still not claimed as proven until a real-device or emulator run validates it.

## Defaults

- `staleTime`: 3 minutes
- `gcTime`: 30 minutes
- `retry`: 1
- `refetchOnMount`: false
- `refetchOnWindowFocus`: false
- `refetchOnReconnect`: true

Manual refresh and mutation paths use explicit refetch helpers.

## Persistence

AsyncStorage key: `THREADLY_QUERY_CACHE_V1`

Buster: `threadly-mobile-phase2-v1`

Max age: 30 minutes

Persisted keys are limited to non-secret server state:

- brand profile
- brand collection lists/details
- design detail/list data
- upload/config data
- media public URLs

Auth/session data, notification counts, messaging counts, cart/wishlist/bag state, and private signed URLs are not persisted.

## Query Keys

The typed registry lives in `src/query/queryKeys.ts`.

Required hot-path keys:

- `auth.profile`
- `brand.profile(brandId)`
- `brand.collections(ownerId, filters)`
- `brand.collectionDetail(collectionId, scope)`
- `design.detail(designId)`
- `designs.user(userId, params)`
- `store.status`
- `store.cart`
- `store.wishlist`
- `store.bagCount`
- `config.uploadLimits`
- `media.publicUrl(fileId)`
- `media.signedUrl(fileId)`
- `notifications.unreadCount`
- `messaging.unreadCount`

Keys normalize ids and filter objects. They do not include signed URL secrets or non-deterministic values.

## Invalidation Policy

- Manual catalog refresh forces `brand.profile`, visible `brand.collections`, and draft keys.
- Collection create/update/delete refreshes only the affected owner list and affected collection detail.
- Collection detail retry/access approval force-refreshes only `brand.collectionDetail(collectionId, scope)`.
- Signed URL retry removes only `media.signedUrl(fileId)` and respects the existing short miss cache.

## Request Budget

Expected behavior:

- cold empty cache: necessary first requests allowed
- warm navigation inside stale time: cached catalog/profile/detail renders without blocking refetch
- back from detail to catalog: no duplicate profile/collection refetch inside stale time
- feed scroll through already-loaded items: 0 extra traced requests
- signed URL 400 spam: 0
- cache-busted/no-store normal navigation reads: 0

## Known Limits

- Native AppState/background-resume still needs real-device validation.
- Private media signed URL fallback still needs a real private-media test.
- Feed `useInfiniteQuery` migration is intentionally deferred.
