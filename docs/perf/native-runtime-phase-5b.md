# Phase 5B Native Runtime Validation Setup

Date: 2026-05-22

## Status

Native runtime validation is blocked on the current Windows workspace.

Checked tooling:

- `adb`: not installed or not on `PATH`.
- `emulator`: not installed or not on `PATH`.
- `sdkmanager`: not installed or not on `PATH`.
- `ANDROID_HOME`: unset.
- `ANDROID_SDK_ROOT`: unset.
- Android Studio / local Android SDK folders: not found in the standard Windows install locations checked during Phase 5B.
- iOS Simulator: not available on Windows.

The mobile source was not changed for Phase 5B.

## AppState Code Review Result

Code inspection shows the native AppState path is scoped and stale-aware, but this is not a substitute for device proof.

- `src/query/QueryProvider.tsx` bridges React Native `AppState` into TanStack Query `focusManager` by calling `handleFocus(status === 'active')`.
- `src/query/queryClient.ts` keeps `refetchOnMount` and `refetchOnWindowFocus` disabled by default.
- Notification, messaging, and bag foreground refreshes are targeted to their own count keys.
- Catalog/profile/detail/media queries are not broadly invalidated on foreground.
- No broad `queryClient.invalidateQueries()` call was found on AppState resume.

## Recommended Android Setup

1. Install Android Studio.
2. Install Android SDK Platform Tools and Android Emulator from Android Studio SDK Manager.
3. Set environment variables:
   - `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`
   - `ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk`
4. Add these to `PATH`:
   - `%ANDROID_HOME%\platform-tools`
   - `%ANDROID_HOME%\emulator`
5. Verify:
   - `adb version`
   - `emulator -version`
   - `adb devices`
6. Start the backend on a host reachable by the emulator/device.
7. Set the mobile dev API URL in the ignored local env file to the reachable backend URL.
8. For a JS-level Expo Go run:
   - `npm run start -- --tunnel`
   - Scan the QR code in Expo Go.
9. For native plugin/app-shell parity, use a development build or local Android run after Android tooling is installed.

## Native Trace Script

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

Expected validation targets:

- Feed scroll extra requests: 0.
- Signed URL 400s: 0.
- Cache-busted/no-store calls: 0.
- No broad catalog/profile/detail refetch on resume.
- Resume refreshes limited to targeted stale count or session paths.
- No broken image loop.
- No full skeleton reset when cached data exists.

## Remaining Gap

Runtime proof remains blocked until an Android emulator/device, iOS device, or Mac/iOS Simulator environment is available.
