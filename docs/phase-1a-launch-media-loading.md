# Phase 1A Launch and Runway Media Loading

## 1. Launch root cause

The first useful shell was gated by fonts, theme restoration, and the network-backed `/auth/profile` request. The font timeout also set `fontsReady` without satisfying the separate `fontsLoaded` check used by `RootBootstrap`, so a timeout could leave the app-owned fallback visible indefinitely. The splash artwork occupied only a small alpha region inside a 1024 x 1024 transparent canvas, making the configured 116 px splash image appear approximately 32 x 60 px.

## 2. App-owned and runtime-owned startup

WIEZ owns the native splash configured by `expo-splash-screen`, the React fallback, local font/theme/session restoration, and the handoff after the first shell layout. Metro startup, JavaScript bundle download/compile time, Expo Go branding, and any dev-client native splash compiled before the latest asset change are runtime/build concerns. Verify the final launch experience in a rebuilt dev client and a release/minified build; Metro development timing is not representative of release startup.

## 3. Splash and fallback asset

The existing logo pixels were preserved while its transparent canvas was cropped from 1024 x 1024 to 600 x 600. Native splash and React fallback both use that asset, `#FFFFFF`, a 116 px square, and `contain`. There is one native splash hide path: the first useful root shell `onLayout` callback.

## 4. Auth validation boot policy

Boot waits for local secure storage, not `/auth/profile`. A cached user snapshot is stored in SecureStore and bound to the exact access token that created it. A matching snapshot can render the authenticated shell immediately while profile validation runs in the background. A token without a matching snapshot renders a neutral shell with private tab actions disabled until validation completes.

- A `401` or `403` clears tokens, the cached user, and private persisted state.
- A transient/network failure preserves a matching cached authenticated session for offline use.
- A refresh-token-only launch renders the neutral shell while refresh completes.
- No token renders the logged-out shell after local cleanup.
- Token binding prevents a cached identity from being used with another access token.

## 5. Runway media strategy

Image classes use the shared thresholds: ultra-portrait `< 0.55`, portrait `< 0.85`, square `< 1.15`, landscape `< 1.85`, and ultra-wide otherwise. Runway permits `cover` only when the computed cropped fraction is at most `0.12`.

| Media condition | Runway treatment |
| --- | --- |
| Known shape, cover crop `<= 0.12` | Edge-to-edge `cover` |
| Portrait/ultra-portrait above tolerance | Sharp `contain` with restrained ambience |
| Square/near-square above tolerance | Sharp `contain` with restrained ambience |
| Landscape/ultra-wide above tolerance | Sharp `contain` with lightweight image-reflective ambience |
| Unknown dimensions | Stable matte/placeholder until dimensions are learned |

The foreground is never stretched. Unsafe crop is replaced by ambience, and unknown dimensions are not treated as square. Dev diagnostics report item id, reported and inferred geometry, strategy, crop fraction, placeholder source, current tier, and final tier.

## 6. Dimension and metadata contract

Feed media preserves `width`, `height`, and a nullable `aspectRatio`. The backend computes aspect ratio only when both positive dimensions are known. It returns existing THUMB, CARD/preview, and DETAIL/full URLs. `blurHash` and `dominantColor` remain nullable because the current `FileUpload` and `FileVariant` persistence models do not store them; Phase 1A does not introduce a processing pipeline or invented fields.

## 7. Placeholder and progressive loading

The initial image tier is CARD/preview, then THUMB, then DETAIL when no smaller source exists. THUMB can be an `expo-image` placeholder for CARD. Blurhash takes priority when supplied; otherwise a real thumbnail, backend color, or visibly contrasting theme shimmer is shown. Only the active vertical item and active horizontal angle upgrade from preview to DETAIL. The previous successful preview remains visible during the upgrade, and the fixed feed viewport prevents layout movement.

## 8. Cache and prefetch

`expo-image` retains `memory-disk` caching. Cache keys use `fileId + tier` when available, otherwise the URL origin/path with query parameters removed, so refreshed signed query strings do not create a new local cache identity. Stable public backend URLs remain preferred. Signed URLs can still expire at the transport layer and require refresh; a stable cache key reduces duplicate disk entries but does not extend server authorization.

Explicit prefetch is limited to the next vertical item's preview tier and the adjacent horizontal angle's preview tier. Other mounted angles stay on preview until selected. Feed network results are applied to React state before AsyncStorage persistence, and cache writes run best-effort in the background.

## 9. Automated checks

Passed:

- `npx tsc --noEmit`
- `npm run audit:design-system`
- `node scripts/test-aspect-aware-media-strategy.js`
- `npm run test:api-contract`
- `npm run test:session-cleanup-contract`
- `npm run test:request-budget-contract`
- `npm run test:design-editor-contract`
- `git diff --check`
- Backend collection service Jest test and Nest build

`npm run check:perf-regressions` was also run. It still fails the two existing
inactive Shop/Reviews loading assertions in `app/(tabs)/catalog/index.tsx`. That
file is untouched here, and tab preload scheduling is deferred to Prompt B.

## 10. Manual QA checklist

- [ ] Android dev-client cold start after a native rebuild
- [ ] Android release/minified cold start
- [ ] Offline authenticated start with a previously validated session
- [ ] Expired and forbidden token start
- [ ] Font-load timeout/error simulation
- [ ] Runway portrait media at safe and unsafe crop ratios
- [ ] Runway near-square media
- [ ] Runway landscape media
- [ ] Unknown-dimension media followed by inferred dimensions
- [ ] First feed load placeholder, CARD, then DETAIL transition
- [ ] Reopen app and confirm cached preview/detail behavior
- [ ] iPad quick visual check
