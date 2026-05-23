# Final Routing, Data, and Media Hardening

Date: 2026-05-23

This document is the release-readiness reference for the mobile side of the Threadly routing, data, and media performance hardening work from Phase 0 through the Phase 10 native feed-runtime follow-up. It is documentation only. It does not claim native Android/iOS AppState proof.

## Original Problem

The original audit found repeated API calls during route changes, back navigation, catalog/profile re-entry, detail re-entry, and media resolution. Mobile catalog/profile screens were loading on mount and again on focus. Media resolution could repeatedly ask for signed URLs, including invalid `/uploads/signed-url/:id` requests. Some normal read calls used cache-busting or no-store behavior. These patterns caused wasted mobile data, repeated loader/skeleton flashes, and risked regressions to the feed.

The feed was the positive control: it already used stale-first cached pages and produced 0 extra traced API calls while scrolling through already-loaded items. That behavior remains protected and was not migrated to `useInfiniteQuery`.

## Final Mobile State

- Catalog/profile/detail hot paths use shared TanStack Query ownership and persisted cache where safe.
- Mobile root/bootstrap reads for auth profile, category filters, unread counts, bag count, and saved checks are query-owned or guarded.
- Route and back navigation within stale windows should render cached data without blocking refetches or full skeleton resets.
- Manual refresh and mutation-driven refresh remain explicit and targeted.
- Public media is resolved first from stable payload URLs, then public URL query resolution, then private signed fallback.
- Private signed URL values are not persisted.
- Invalid or missing media IDs use short miss caching and in-flight dedupe to prevent 400 spam.
- Feed stale-first cache now stores non-secret feed snapshots in AsyncStorage instead of SecureStore, while pagination behavior remains protected.

## Request-Budget Policy

Mobile release budget:

- Feed scroll through already-loaded items: 0 extra API requests.
- Warm route flow should stay around the clean budget proven in Phase 3B/5C, with 12 as the latest clean mobile Expo Web budget.
- `/uploads/signed-url/:id` 400 count must stay 0.
- Cache-busted/no-store calls must stay 0 for normal route reads.
- Media resolver endpoint calls should stay 0 where API payloads already contain stable display URLs.
- Manual refresh may force fresh requests only through explicitly named refresh paths.
- Mutation invalidation must target affected query keys only.
- Feed/media/scroll/network/bootstrap/auth/analytics debug logs are off by default. Enable only the needed `EXPO_PUBLIC_DEBUG_*` flag during targeted debugging.

The remaining native Android/iOS AppState/background-resume path is a manual release gate. Code review shows the AppState bridge marks TanStack focus state without broad invalidation, but that is not native runtime proof.

## Query And Cache Policy

Default query policy:

- `staleTime`: `3 * 60 * 1000`
- `gcTime`: `30 * 60 * 1000`
- `retry`: `1`
- `refetchOnMount`: `false`
- `refetchOnWindowFocus`: `false`
- `refetchOnReconnect`: `true`

Persistence policy:

- Mobile uses AsyncStorage through `PersistQueryClientProvider`.
- Persisted cache uses `THREADLY_QUERY_CACHE_V1` and a cache buster.
- Public, non-sensitive server state may persist.
- Auth/session data, private signed URLs, notification counts, messaging counts, and other sensitive or short-lived values must not be persisted unless explicitly reviewed.
- Query keys must remain deterministic. Do not use `Date.now()` or `Math.random()` in query keys.
- Do not call broad `queryClient.invalidateQueries()` from AppState/focus paths.

## Media Policy

Public media priority:

1. Stable public variant/display URL from the API payload.
2. Stable public original/display URL from the API payload.
3. Query-cached public URL endpoint lookup.
4. Private signed URL fallback only when public access is denied or unavailable.
5. Placeholder/fallback image.

Private media rules:

- Public media must not request signed URLs first.
- Signed URL fallback must remain available for private media.
- Signed URL secrets must never be logged.
- Signed URL query results must not be persisted beyond their valid lifetime.
- Invalid file IDs and denied lookups must not loop or retry into request spam.

## CI Quality Gate

Workflow: `.github/workflows/phase8-quality-gate.yml`

Local command:

```bash
npm run ci:phase8
```

The mobile gate runs:

- `npm exec tsc -- --noEmit`
- `npm run test:aspect-aware-media`
- `npm run test:brand-profile-contract`
- `npm run test:design-editor-contract`
- `npm run test:store-api-contract`
- `npm run check:perf-regressions`

The gate protects type safety, aspect-aware media behavior, current brand/profile/design/store route contracts, public-first/private-fallback media resolution, force-refresh-only cache bypass, deterministic query keys, no broad AppState invalidation, and feed cache protection.

CI intentionally excludes native runtime validation, Expo Go/device runs, emulator setup, private fixture seeds, destructive DB commands, and secrets.

## Manual Native Validation Checklist

Prerequisites:

- Android Studio or a real Android device with Expo Go/development build, or a real iOS device/Mac-based simulator.
- `adb` for Android device/emulator validation, or Expo Go access for real-device validation.
- Backend reachable from the device.
- Valid authenticated test account.
- `EXPO_PUBLIC_THREADLY_NETWORK_TRACE=1`.

Before the trace:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.clear()
```

Trace path:

```text
cold launch
-> feed first paint
-> scroll/swipe 10 feed items
-> open one design/detail
-> back
-> catalog/profile
-> open collection/design
-> back
-> background app for 10 seconds
-> resume
-> repeat once
```

After the trace:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.printSummary()
```

Capture:

- total requests
- feed scroll extra requests
- AppState resume-triggered requests
- auth/profile count
- notifications/messaging/bag count
- saved/check count
- public URL calls
- signed URL calls
- signed URL 400s
- cache-busted/no-store calls
- loader/skeleton resets
- broken image errors

Acceptance:

- feed scroll extra requests: 0
- signed URL 400s: 0
- cache-busted/no-store: 0
- no broad catalog/profile/detail refetch on resume
- resume refreshes are targeted and stale-aware
- no broken image loops
- no full skeleton reset if cached data exists

## Rollback Plan

- CI rollback: revert `.github/workflows/phase8-quality-gate.yml` and the `ci:phase8` script only if the gate itself is broken.
- Scanner rollback: disable `npm run check:perf-regressions` only for an urgent hotfix, then restore or replace equivalent coverage before release.
- Query rollback: revert the QueryProvider/query hook commits as a unit and rerun the Phase 8 gate plus a manual route trace.
- Media rollback: preserve private signed fallback and owner gating even if public-first client logic is reverted.
- Feed rollback: do not touch feed cache/pagination while rolling back catalog/media behavior unless the regression is proven in feed code.

Minimum rollback checks:

```bash
npm run ci:phase8
git diff --check
```

## Deferred Work

- Native Android/iOS AppState/background-resume runtime validation.
- Optional future feed migration only if a measured need appears.
- Optional realtime-only unread-count strategy.
- Optional full E2E CI after stable auth fixtures exist.
