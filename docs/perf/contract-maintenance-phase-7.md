# Phase 7 Contract Maintenance

## Scope

Phase 7 cleaned up stale mobile contract checks that were still protecting old route and component assumptions after the routing, catalog, and media hardening work.

## Updated Contracts

- `test:brand-profile-contract` now validates the current shared badge model:
  - `ProfileBadge` delegates rendering to `AppBadge`.
  - `AppBadge` owns shared badge tones, verified/open/closed store badge state, tokenized radius, and icon-box styling.
  - `BrandProfileHeader` owns the current color-only wavy store status marker.
- `test:design-editor-contract` now validates the current product detail route:
  - `app/products/[productId].tsx` routes product details into `MarketCommerceViewer`.
  - Product media debug context is generated inside `MarketCommerceViewer` with `productId` and `mediaIndex`.
  - Product ids are not mislabeled as design ids.
- `test:store-api-contract` now validates the current Market entry point:
  - The legacy `app/(tabs)/store.tsx` route remains absent.
  - `app/(tabs)/discover.tsx` is the active Market route.
  - The native island Market action routes to `/(tabs)/discover`.

## Not Changed

- No product code changed.
- No Phase 6 performance regression guards were removed or weakened.
- Native Android/iOS runtime validation remains a deferred manual release gate.
