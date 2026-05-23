# Phase 5C Native Runtime Validation

Date: 2026-05-23

## Status

Native runtime validation remains blocked on this Windows workspace.

Checked tooling:

- `adb`: not installed or not on `PATH`.
- `emulator`: not installed or not on `PATH`.
- `sdkmanager`: not installed or not on `PATH`.
- `ANDROID_HOME`: unset.
- `ANDROID_SDK_ROOT`: unset.
- Android SDK standard Windows paths were not present under `%LOCALAPPDATA%\Android\Sdk`.
- iOS Simulator is not available on Windows.

No mobile source files changed in Phase 5C.

## Code Review Result

The Phase 5C code review result is unchanged from Phase 5B:

- `src/query/QueryProvider.tsx` bridges React Native `AppState` into TanStack Query `focusManager`.
- `src/query/queryClient.ts` keeps broad focus refetching disabled by default.
- Notification, messaging, and bag count foreground refresh paths remain targeted.
- Catalog/profile/detail/media queries are not broadly invalidated on resume.
- No broad `queryClient.invalidateQueries()` call was found on AppState resume.

This is code-review confidence only. It is not native runtime proof.

## Required Setup

Android runtime validation requires one of:

1. Android Studio with Android SDK Platform Tools and Android Emulator installed.
2. A real Android device with USB debugging enabled and visible through `adb devices`.
3. Expo Go on a real Android device, with the backend reachable from that phone.

iOS runtime validation requires either:

1. A real iOS device running Expo Go.
2. A Mac with Xcode/iOS Simulator.

## Trace Command

Before the flow:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.clear()
```

Run:

```text
cold launch
-> feed first paint
-> swipe/scroll 10 feed items
-> open one design/detail
-> back
-> catalog/profile
-> open collection/design
-> back
-> background app for 10 seconds
-> resume app
-> repeat once
```

After the flow:

```js
globalThis.__THREADLY_NETWORK_TRACE__?.printSummary()
```

Expected:

- Feed scroll extra requests: 0.
- Signed URL 400s: 0.
- Cache-busted/no-store calls: 0.
- No broad catalog/profile/detail refetch on resume.
- Resume refreshes are targeted and stale-aware.
- No broken image loop.
- No full skeleton reset when cached data exists.

