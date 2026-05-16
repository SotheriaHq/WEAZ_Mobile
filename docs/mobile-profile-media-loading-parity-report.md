# Mobile Profile Media Loading Parity Report

Date: 2026-05-16
Repo: `PatrickOloye/threadly-mobile`
Branch: `main`

## Summary

This fix aligns native mobile profile avatar/banner upload feedback with the web behavior: selected media now appears immediately as the pending preview while the upload is in progress, with a soft dim/blur loading overlay instead of a blank loader-only state.

No backend, web creator taxonomy, feed scoring, feed rendering, recommendations, market/feed redesign, or interaction-event work was implemented.

## Files Changed

- `components/catalog/OwnerCatalogMediaHeader.tsx`
- `components/catalog/BrandProfileHeader.tsx`
- `docs/mobile-profile-media-loading-parity-report.md`

## Root Cause

The native owner catalog media flow waited until upload success before setting `pendingAvatar` or `pendingBanner`. During the upload window, `BrandProfileHeader` received only `avatarLoading` / `bannerLoading`, so it rendered loading UI without an optimistic selected-image preview.

## Fixes Applied

- Set `pendingAvatar` from the local selected asset URI immediately after image picker selection.
- Set `pendingBanner` from the local selected asset URI immediately after image picker selection.
- Clear the pending preview on upload failure so the previous image/fallback is restored.
- Added dimmed preview treatment while avatar/banner upload is pending.
- Added lightweight blur/loading overlays for avatar and banner upload states.
- Kept the existing upload API and final uploaded media replacement behavior unchanged.

## Theme Latency Audit

Mobile theme selection already applies the local theme preference synchronously before account sync. The selected option calls `setThemePreference` without awaiting it, and `ThemeProvider` updates local state before persisting to SecureStore. No additional code change was needed for the mobile theme path in this pass.

## Commands Run

- `npm exec tsc -- --noEmit` - passed.
- `npm run audit:design-system` - passed.
- `git diff --check` - passed with CRLF conversion warnings only.

## Manual QA Checklist

- Open the native owner profile/catalog screen.
- Select a new profile photo; the chosen image should appear immediately behind the loader.
- Select a new banner; the chosen banner should appear immediately behind the loader.
- Confirm successful upload replaces the preview with the uploaded asset.
- Simulate or observe upload failure; the UI should revert to the previous image/fallback and show an error toast.
- Confirm mobile theme selection still responds immediately and persists after restart.

## Known Limitations

- Physical-device upload QA was not run from this environment.
- The existing profile header still uses current icon text values outside this focused loading-state change.

## Commit SHA

Final pushed commit SHA is recorded in the delivery response after commit and push.
