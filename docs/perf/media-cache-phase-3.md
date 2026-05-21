# Phase 3 Media Cache Policy

Phase 3 keeps the Phase 2 query cache foundation and narrows media resolution to the remaining hot path: repeated public media URL lookups.

## Resolution Order

1. Use a stable variant URL already present in the API payload.
2. Use a stable public original URL already present in the API payload.
3. Resolve `media.publicUrl(fileId)` through `/uploads/public-url/:id`.
4. Fall back to `media.signedUrl(fileId)` through `/uploads/signed-url/:id` only when public resolution is unavailable.
5. Render the existing fallback image if resolution fails.

The resolver does not call public or signed endpoints for already usable absolute URLs. Signed URLs are used directly only when their expiry is still outside the refresh skew.

## Query Keys

- `media.publicUrl(fileId)` is query-owned and persistable.
- `media.signedUrl(fileId)` is query-owned but not persistable.
- `store.brandProducts(brandId, { limit })` is query-owned and persistable for public store catalog reads.
- `reviews.brand(brandId, { limit, viewerId })` and `reviews.product(productId, { limit, viewerId })` are query-owned for in-session stale dedupe.

## TTL And Invalidation

- Public URL and signed URL query stale time follows the media URL TTL minus refresh skew.
- Invalid public/signed media IDs keep the existing short miss TTL to avoid repeated 400/404 spam.
- Manual refresh removes the exact public and signed media query keys before refetch.
- Brand product manual refresh removes the exact `store.brandProducts` key.
- Review edit/delete patches the exact review query cache entry.

## Known Limits

- Native AppState/background behavior still needs a real device or emulator run.
- Private signed media fallback was preserved by code path, but a real private media record was not available in the automated Expo Web run.
- Expo Web automation was able to validate route-level catalog media behavior, but the full click-through detail harness hung after the first detail navigation.
