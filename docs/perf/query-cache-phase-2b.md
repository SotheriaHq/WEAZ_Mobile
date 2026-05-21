# Phase 2B Mobile Bootstrap Query Cache Follow-Up

Phase 2B extends the Phase 2 TanStack Query foundation to mobile root/bootstrap reads that were repeated by the Expo Web direct-route validation harness.

## Converted Bootstrap Reads

- `auth.profile`: `src/auth/AuthContext.tsx` now validates the active token through `queryClient.fetchQuery(queryKeys.auth.profile())` with the default 3 minute stale time. It is not persisted.
- `categories.filters('market-chips')`: `src/features/feed/components/MarketFeedScreen.tsx` now reads market chips through `fetchMarketFilterChipsQuery()`.
- `categories.filters('design-dimensions')`: `src/features/design-editor/DesignEditorProvider.tsx` now reads design filter dimensions through `fetchDesignFilterDimensionsQuery()`.
- `notifications.unreadCount`: `src/realtime/notifications.ts` now uses `queryClient.fetchQuery(queryKeys.notifications.unreadCount())` with a 30 second stale time.
- `messaging.unreadCount`: `src/realtime/messaging.ts` now uses `queryClient.fetchQuery(queryKeys.messaging.unreadCount())` with a 30 second stale time.
- `store.bagCount`: `src/features/bagging/BagCountContext.tsx` now uses `queryClient.fetchQuery(queryKeys.store.bagCount())` with a 30 second stale time.
- `saved.batch(targetType, targetIds)`: `src/api/SavedItemsApi.ts` now dedupes normalized saved-status batch checks for 60 seconds.

## Stale-Time Policy

- Auth profile: 3 minutes, in-memory only.
- Category/filter metadata: 30 minutes and persisted through the existing AsyncStorage persister.
- Unread counts: 30 seconds, in-memory only.
- Bag count: 30 seconds, in-memory only.
- Saved batch status: 60 seconds, in-memory only.

Counts and saved state are intentionally not persisted because they are user-specific. Sign-out removes the auth profile, unread-count, bag-count, and saved query roots.

## Refresh and Invalidation Rules

- Sign-out clears `auth.profile`, `notifications.unreadCount`, `messaging.unreadCount`, `store.bagCount`, and all `saved` queries.
- Saving or unsaving an item invalidates the `saved` query root.
- Bag/cart mutations continue to call `refreshGlobalBagCount({ forceRefresh: true })`.
- Manual bag refresh continues to force a fresh `store.bagCount` request.
- Unread counts may be refetched after the 30 second stale window or by future targeted force-refresh callers.
- Category/filter metadata has no mutation path in mobile; it is stale-cached for 30 minutes.

## Auth Loading Guard

`BagCountProvider` preserves cached bag count while auth status is `loading`. It only clears count data when auth is confirmed unauthenticated. This prevents route/provider remounts from deleting fresh query data before auth settles.

## Request-Budget Result

Measured with the Phase 0 tracer on Expo Web responsive view:

- Phase 2 mobile baseline: 78 cold / 80 warm requests.
- Phase 2B final cold run on latest `main`: 19 requests.
- Phase 2B final warm run on latest `main`: 14 requests.
- Feed scroll extra requests: 0.
- Signed URL 400 calls: 0.
- Cache-busted/no-store calls: 0.

Remaining repeats are no longer root/bootstrap reads:

- `GET /uploads/public-url/:id`: 5x warm.
- `GET /store/brands/:id/products?limit=<redacted>`: 2x warm.
- `GET /reviews/brand/:id?limit=<redacted>`: 1x warm.

Those should be handled in a later catalog shop/reviews query pass if the product owner wants more mobile catalog reduction before feed migration.

## Known Limits

- Native AppState/background-resume still needs real-device or emulator validation.
- Private media signed URL success still needs a real private-media test.
- The Expo Web direct-route harness is useful for request budgets but is not a substitute for native navigation and background/resume QA.
