# Phase 0 Network Baseline - Mobile

This is a measurement-only workflow. It does not change API behavior, caching policy, or feed loading logic.

## Dev Tracer

The mobile Axios clients register a development-only in-memory tracer.

- Enabled by default in `__DEV__`.
- Disabled with `EXPO_PUBLIC_THREADLY_NETWORK_TRACE=0`.
- Disabled automatically when `NODE_ENV=test`.
- Production builds do not record trace entries.
- Request bodies, auth headers, cookies, tokens, passwords, and raw signed URLs are not recorded.

Use the Metro or remote JS console:

```ts
globalThis.__THREADLY_NETWORK_TRACE__?.clear();
globalThis.__THREADLY_NETWORK_TRACE__?.printSummary();
globalThis.__THREADLY_NETWORK_TRACE__?.entries();
```

Optional manual annotations are available when running a controlled test:

```ts
globalThis.__THREADLY_NETWORK_TRACE__?.markTrigger('navigation');
globalThis.__THREADLY_NETWORK_TRACE__?.setScreen('/catalog');
```

## Required Mobile Reproduction Path

1. Start the app in development mode.
2. Cold launch.
3. Wait for feed first paint.
4. Swipe or scroll through 10 feed items.
5. Open one design/detail.
6. Go back.
7. Open catalog/profile.
8. Open one collection/design.
9. Go back.
10. Background the app for 10 seconds.
11. Resume the app.
12. Trigger one safe toast-producing action, such as saving/unsaving a design if a dev account is available.
13. Repeat the same path once.
14. Run `globalThis.__THREADLY_NETWORK_TRACE__?.printSummary()`.

## Metrics To Capture

- Total requests.
- Duplicate buckets.
- Repeated profile, collection, design/detail, signed URL, cache-busted, and no-store calls.
- Calls by route label and AppState.
- Foreground/resume-triggered calls when detected.
- Top 10 repeated endpoints.
- Top 10 largest response classes when response size can be estimated.
- Skeleton flashes observed while following the path.

## Suggested Commands

```powershell
npm run start
```

To disable tracing for a control run:

```powershell
$env:EXPO_PUBLIC_THREADLY_NETWORK_TRACE='0'
npm run start
```
