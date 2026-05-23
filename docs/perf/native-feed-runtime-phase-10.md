# Native Feed Runtime Phase 10

Date: 2026-05-23

Phase 10 addresses the manual Android QA evidence that feed startup and media hydration were wasting data even after the earlier web and Expo Web request budgets were clean.

## Manual QA Evidence

The Android run showed:

- `/collections/market` loaded the feed.
- Feed cache write attempted and then logged `persisted-cache-write-failed`.
- Feed media resolution reached `/uploads/signed-url/:id` before or around feed media interaction.
- Later horizontal swipe logs included `resolve-cache-hit`, but the signed URL requests had already happened.
- `POST /saved/check/batch` fired.
- Logs were noisy: feed/media/scroll/nav/layout/bootstrap/API/analytics diagnostics printed by default.
- Runtime warnings included `No route named "reviews" exists`, a bagging require cycle, and AppText style override warnings.

## Root Causes Fixed

Feed persisted cache:

- Feed snapshots are non-secret, potentially larger than SecureStore is appropriate for.
- The persisted feed cache now uses AsyncStorage.
- The in-memory cache remains in place, and persisted reads still sanitize feed items before use.

Public feed media:

- Generic media resolution still supports private signed fallback by default.
- Public feed images, feed brand avatars, feed media resolver helpers, and feed prefetch paths now opt out of signed fallback.
- If a public feed item has a stable display URL, the app uses it directly.
- If public feed prefetch does not have a usable stable URL, prefetch skips instead of forcing file-ID resolver work.
- Private design/detail media can still request signed URLs because the default resolver behavior remains signed-fallback enabled outside the feed path.

Saved checks:

- The feed now keeps a stable saved-check key based on authenticated user and sorted collection IDs.
- The same loaded item set does not re-fire `/saved/check/batch` on horizontal carousel swipes or parent re-renders.
- Save/unsave mutation correctness remains local-optimistic and still invalidates saved query keys through `SavedItemsApi`.

Logs:

- Feed/media/network/nav/bootstrap/auth/analytics diagnostics are opt-in.
- Supported flags:
  - `EXPO_PUBLIC_DEBUG_FEED=true`
  - `EXPO_PUBLIC_DEBUG_MEDIA=true`
  - `EXPO_PUBLIC_DEBUG_SCROLL=true`
  - `EXPO_PUBLIC_DEBUG_NETWORK=true`
  - `EXPO_PUBLIC_DEBUG_CATALOG=true`
  - `EXPO_PUBLIC_DEBUG_NAV=true`
  - `EXPO_PUBLIC_DEBUG_BOOT=true`
  - `EXPO_PUBLIC_DEBUG_AUTH=true`
  - `EXPO_PUBLIC_DEBUG_ANALYTICS=true`
- There is no global "enable every Threadly diagnostic" flag; Android QA must opt in per diagnostic area so gesture logs cannot accidentally hide real API calls.
- Scroll diagnostics such as `vertical-momentum`, `active-index`, and `horizontal-carousel-index` are controlled by `EXPO_PUBLIC_DEBUG_SCROLL`, not enabled by default.
- The network trace remains available through `globalThis.__THREADLY_NETWORK_TRACE__?.printSummary()`.

## Warning Status

- `reviews` route warning: fixed by naming the stack screen `reviews/index`, matching the current `app/reviews/index.tsx` route.
- Bagging require cycle: deferred. It is real architecture debt but not the feed data-waste root cause.
- AppText forbidden style warnings: deferred. They should be fixed at call sites, not suppressed globally.

## Regression Guard Updates

`npm run check:perf-regressions` now guards:

- feed snapshots must use AsyncStorage, not SecureStore
- feed media must expose signed-fallback control
- feed public images and carousel prefetch must opt out of signed fallback
- feed prefetch must require a stable direct public URL
- feed saved checks must keep a stable ID-set guard
- feed/media/network diagnostics must be opt-in

## Native Validation

This machine still cannot run the Android trace because `adb`, `emulator`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` are unavailable.

Manual Android validation must run:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.clear()
```

Path:

```text
cold launch
-> feed first paint
-> wait for initial feed render
-> vertical scroll from item 0 to item 1
-> horizontal swipe through media carousel
-> vertical scroll back/up if possible
-> repeat once without clearing app storage
```

Then:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.printSummary()
```

Acceptance:

- feed cache write does not log `persisted-cache-write-failed`
- `/collections/market` is expected for feed first load
- public feed media does not call `/uploads/signed-url/:id`
- horizontal swipe over already loaded public media does not call resolver endpoints
- vertical scroll over already loaded items does not trigger unnecessary API calls
- `POST /saved/check/batch` runs once for the current loaded ID set
- signed URL 400s remain 0
- cache-busted/no-store calls remain 0
- default logs are quiet enough for actual API calls and real warnings to stand out

## Rollback Notes

Rollback the Phase 10 mobile commit if Android feed media fails to display. Do not weaken private media authorization while rolling back. If feed cache persistence regresses, keep memory cache behavior intact and only revert the AsyncStorage feed-cache storage change after confirming AsyncStorage is the cause.
