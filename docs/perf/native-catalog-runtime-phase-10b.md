# Native Catalog Runtime Phase 10B

Date: 2026-05-23

Phase 10B addresses the Android QA evidence that catalog/profile routing still wasted data after the feed media hardening work.

## Android QA Evidence

The pasted Android log showed 43 API request lines during repeated feed/catalog routing:

- `GET /brands/:id`: 8
- `GET /designs/user/:id?...&_cb=...`: 8
- `GET /store-collections/user/:id?...&_cb=...`: 8
- `GET /store/brands/:id/products`: 6
- `GET /notifications/unread-count`: 5
- `GET /messaging/unread-count`: 3
- `GET /reviews/brand/:id`: 2
- `GET /uploads/signed-url/:id`: 1
- `POST /saved/check/batch`: 1

The same run also showed full catalog skeleton/loading on reroute and feed/media/scroll/nav/catalog/API diagnostics during normal QA.

## Fixes

Catalog cache rendering:

- Catalog now treats cached TanStack Query data as usable render data on route remount.
- The full `CatalogLoadingSkeleton` is shown only when there is no cached profile, collection, or draft data and the relevant query is still loading.
- Brand profile, collection, and draft query hooks seed from existing query-cache data.

Normal route cache busting:

- Existing `forceRefresh: true` behavior remains limited to explicit pull-to-refresh, delete/publish/edit recovery, and completed design background-task recovery.
- Completed design background tasks are consumed once before their recovery refresh, preventing stale completed tasks from forcing `_cb=` reads on every route remount.
- Normal catalog route open must not generate `_cb=`.

Shop and reviews:

- Brand shop products no longer load while the Shop tab is inactive.
- Brand reviews no longer load while the Reviews tab is inactive.
- Cached product data suppresses product skeletons on warm tab/reroute.

Saved checks:

- Catalog saved checks now use a stable `queryKeys.saved.batch('COLLECTION', ids)` query key with saved-status stale time.
- The same collection ID set does not refire `POST /saved/check/batch` on rerender or route remount while the cache is fresh.

Media:

- Public catalog cards, public visitor profile media, and public brand shop product media opt out of private signed fallback.
- Owner/private catalog media can still use private signed fallback where needed.
- Private design/detail signed fallback remains intact.

Logs:

- Diagnostics are now opt-in per scope.
- There is no global `EXPO_PUBLIC_DEBUG_THREADLY` switch because it can accidentally re-enable all gesture logs during QA.
- Use these scoped flags only when needed:
  - `EXPO_PUBLIC_DEBUG_FEED=true`
  - `EXPO_PUBLIC_DEBUG_MEDIA=true`
  - `EXPO_PUBLIC_DEBUG_SCROLL=true`
  - `EXPO_PUBLIC_DEBUG_NETWORK=true`
  - `EXPO_PUBLIC_DEBUG_CATALOG=true`
  - `EXPO_PUBLIC_DEBUG_NAV=true`
  - `EXPO_PUBLIC_DEBUG_BOOT=true`
  - `EXPO_PUBLIC_DEBUG_AUTH=true`
  - `EXPO_PUBLIC_DEBUG_ANALYTICS=true`

The network trace remains available:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.clear()
globalThis.__THREADLY_NETWORK_TRACE__?.printSummary()
```

## Android QA Acceptance

Run with all `EXPO_PUBLIC_DEBUG_*` flags unset:

```text
cold launch
-> wait for feed first render
-> scroll between the same two feed items about 5 times
-> swipe the same carousel about 8 times
-> open profile dropdown twice
-> route to catalog
-> route back to feed
-> route to catalog again
-> route back again
-> print network trace summary
```

Expected:

- repeated scroll/swipe over already loaded content: 0 new API calls
- first catalog route: bounded cold reads only
- second catalog route within stale time: 0 brand/design/store/product reads
- normal catalog route: 0 `_cb=` reads
- no full catalog skeleton when cached data exists
- no feed/media/scroll/nav/catalog/API debug spam by default
- public catalog/shop/profile media: 0 signed URL calls
- private media signed fallback still available where explicitly private/owner-gated
- `POST /saved/check/batch` does not repeat for the same collection ID set

## Remaining Manual Gate

This machine still cannot run Android natively because Android tooling is unavailable. The Android trace above must be rerun on the QA device/emulator.
