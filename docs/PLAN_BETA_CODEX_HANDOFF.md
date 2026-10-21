# Plan Beta — Native UI Refinement Handoff

Branch: `feat/plan-beta-native-ui-refinement` (based on `main`). Do not merge, deploy, or touch backend, billing, subscription, or unrelated Codex branches.

## Code review and architecture
- Existing design system: `src/styles/tokens.ts` (semantic theme colors, spacing, radius, elevation, typography), `src/theme/ThemeProvider.tsx`, `components/ui/AppText.tsx`, `src/styles/FontMode.ts`, `components/ui/{Button,Card,Input,Header,AppBadge}.tsx`.
- Root `app/_layout.tsx` already imports individual Roboto 400/500/600/700/800 weights and loads them with `useFonts`. It controls fallback mode. Preserve startup and font safety.
- Existing documentation: `docs/phase-8b-typography-background-implementation.md` and `docs/phase-8c-background-typography-correction.md`. Earlier attempts caused gray page backgrounds, overly large profile typography, and Android card clipping. Do not regress these fixes.
- Market section detail: `src/features/market/components/MarketSectionDetailScreen.tsx` previously inferred `isDesignerSection` from the currently loaded `items` array. This changed `columnCount`, remounting `FlatList` via `key={columnCount}` as data loaded or pagination changed.

## Changes committed
1. Market detail now derives designer layout from `section.sourceType === 'BRAND'` or `section.layout === 'BRAND_RAIL'`, both defined in `src/api/MarketApi.ts`, rather than from transient items. Column changes on true section changes or screen width remain intentional. Verify that all designer sections use those metadata values; if API payloads violate this contract, add an explicit, stable metadata fallback rather than reverting to page-item inference.

## Next implementation tasks
1. **Market stability:** inspect initial loading state and FlatList key/scroll behavior, nested embedded rails, pagination, refresh, device rotation, 2/3-column widths, and filter transitions. Add regression tests proving that an empty page, loaded page, and next page of the same BRAND section all stay one column; a PRODUCT_GRID stays 2 columns on phones and 3 on wide screens. Do not introduce another layout remount on data changes.
2. **Font boot:** verify `useFonts` success/failure handling and `setFontFallbackMode` notifications. Add targeted contract tests for fallback, cold start, warm start, and Android font scaling. Keep `AppText` as semantic typography gatekeeper; avoid overriding its fontFamily/fontWeight/color in screen-level styles.
3. **Visual primitives:** audit `Button`, `Card`, `Input`, `Header`, `AppBadge`, `ScreenState` and screen usages. Prefer narrow fixes through existing semantic tokens over new primitive families. Preserve `Card` shadow and clipping split.
4. **Screen QA:** Runway, Market, Catalog, Profile, auth/forms, bottom island navigation. Check light/dark/system theme, accessibility contrast, placeholders, disabled buttons, skeletons, safe areas, screen sizes, scrolling and navigation.
5. **Tests:** `npm ci`, `npx tsc --noEmit`, `npm run audit:design-system`, `npm run audit:theme`, `npm run test:clipping-market-chrome-contract`, `npm run test:brand-profile-contract`, `npm run test:runway-responsiveness-contract`, `npm run check:perf-regressions`, and `git diff --check`. Fix failures on this branch. Test on an Android device/dev client; code review is not visual/device validation.

## Verification status
This agent reviewed source and committed the stable section metadata change, but **did not execute the TypeScript compiler, contract suite, emulator/device testing, or visual screenshots**. Do not claim passing tests or production readiness without recorded output. No EC2 work is included. Keep this branch independent of Plan Alpha backend work.

## Acceptance criteria
Market detail no longer changes column layout merely because items load or paginate; theme and typography stay consistent; existing navigation, media, auth, and commerce behavior remain unchanged; verified checks and screenshots are documented; user explicitly approves merge/deploy.
