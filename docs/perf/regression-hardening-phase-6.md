# Phase 6 Regression Hardening

Phase 6 adds a lightweight static guard for the mobile request-budget rules proven in Phases 1-5C. It does not change mobile runtime data-fetching behavior.

## Guard Command

```bash
npm run check:perf-regressions
```

The guard checks:

- query defaults keep `refetchOnMount: false`, `refetchOnWindowFocus: false`, shared `staleTime`, and shared `gcTime`
- query keys remain deterministic and do not use `Date.now()` or `Math.random()`
- persisted query cache includes public media URLs but excludes private signed URLs
- AppState/focus bridging only marks focus state and does not broadly invalidate queries
- image resolution remains public-first before private signed fallback
- invalid media IDs keep miss caching and in-flight dedupe
- normal brand/design reads only use `_cb`, `no-store`, or `no-cache` when explicitly forced by `forceRefresh`
- feed stale-first storage still uses `SecureStore`, `readCachedMarketFeed`, and `FEED_CACHE_TTL_MS`

## Request-Budget Policy

- Feed scroll through already-loaded items should produce 0 extra API requests.
- Warm mobile route flow should stay around the Phase 3B/5C budget, with signed URL 400s at 0 and cache-busted/no-store calls at 0.
- Manual refresh may force a fresh request, but default route navigation should not add cache-busting headers or timestamp query parameters.

## Native Gate

Native Android/iOS AppState runtime validation is still deferred. Code review shows the query provider uses the TanStack focus bridge without broad invalidation, but that is not a substitute for a real device/emulator trace.

## Rollback

The scanner is isolated to `scripts/check-perf-regressions.cjs` and the package script. Removing the package script disables the guard without changing app runtime behavior.
