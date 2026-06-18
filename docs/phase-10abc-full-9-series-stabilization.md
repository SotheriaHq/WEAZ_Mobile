# Phase 10A–10C — Full Phase 9 Series Stabilization (9A + 9B + 10 verify, 9C-1 implement)

Branch: `native-runtime-ux-fixes` • Repo root: `threadly-mobile`
Pre-edit HEAD: `f666894` (Phase 10 rescue) • Working tree clean before edits.

> Source of truth = actual code. Gemini reports/docs/commit messages were not trusted.
> Phase 9B-1 `3447eb2`, 9B-2 `835325b`, and Phase 10 rescue `f666894` are all present.

---

## 1. Why this pass was needed
One end-to-end stability pass over the whole Phase 9 series: verify 9A (catalog/profile/market
surface, tabs, refresh, notifications, Store-tab removal) and 9B (runway/viewer media, cards,
action rail, bagging) are actually stable after the `f666894` rescue, then implement 9C-1
(owner three-dot Settings/Store menu) now that 9A/9B/10 are confirmed stable.

## 2. Repo / branch / commit state
- `git rev-parse --show-toplevel` → `…/threadly-mobile`
- `git branch --show-current` → `native-runtime-ux-fixes`
- Pre-edit `git status --short` → clean
- `git log --oneline` head → `f666894`, `835325b`, `3447eb2` …

## 3. 9A audit results (verification — no regressions found)
- **Surface/background:** Catalog uses `theme.colors.surface`; no gray blanket. `_layout.tsx` scene background = surface. **Stable.**
- **Contact link hit targets:** `BrandProfileHeader.BrandContactItems` — each contact is a content-sized `Pressable` (`alignSelf:'flex-start'`, row of icon+text, `hitSlop=8`). Blank row space is **not** clickable. **Stable.**
- **Content cards / strips:** Fixed by `f666894` (cover full-bleed). `CollectionCard` uses `resizeMode="cover"`. **Stable.**
- **Content ↔ Shop alignment:** `UnifiedProductCard` (shop) uses `resizeMode="cover"`; Content card now matches. **Aligned.**
- **Card corners:** `cardClip` `overflow:hidden` + radius; cover fills. **Clean.**
- **Draft/Public/In Review/Needs Attention:** `CollectionCard` enforces explicit `height` + `cardClip` (no slivers); states only swap overlay copy/pills. **Full cards.**
- **Horizontal catalog swipe:** `Animated.ScrollView` pager (`handleTabPagerScroll/MomentumEnd`). **Preserved.**
- **Tab height stabilization:** `tabHeights` keyed per `Collections:<visibility>` (prevents stale blank space). **Present.**
- **Tab switch scroll lock:** pager + `settleTransition` + `startTransition`; no `scrollEnabled={false}` lock. **No lock.**
- **Refresh/status invalidation:** `handleRefresh` invalidates `brand.collections`, `store.brandProducts`, `brand.profile`, `reviews.brand`. **Scoped + present.**
- **Notification count:** `useUnreadNotificationCount` (shared source) in `_layout.tsx` + header. **Preserved.**
- **Store tab:** `_layout.tsx` exposes index/discover/inbox/me (+ hidden create/two/me-edit/catalog). **No standalone Store tab.**

## 4. 9B audit results (verification — no regressions found)
- Portrait → `edge`, **no blur**. Square → `letter-soft` (subtle ambient, blur 10 / opacity 0.32). Landscape → `letter-blur` (blur 16 / opacity 0.55). Square ≠ landscape (resolver + test-guard). **Correct.**
- Unknown dims → `letter-solid` (clean matte, no blur flash, no jump). **Correct.**
- No stretch; foreground always `contain`/`edge` (never `fill`). **Correct.**
- Vertical paging: measured `pageHeight`, `getItemLayout`/`snapToInterval` aligned, `feedViewportReady` gate, one-page momentum clamp, stable `keyExtractor=listKey`. **Stable.**
- Horizontal carousel: `FeedMediaCarousel` `ScrollView` paging. **Works.**
- Action rail: Avatar, Thread, Bag, Save Look, Comments — **no heart/zero action**. `IconButton size={44}` (≥44pt). **Clean.**
- New Drop: `dismissedSessionItems` per-item/session-local; pulse uses `useNativeDriver` + `isInteraction:false` (non-blocking). **Intact.**
- Design Detail/View (`MarketCommerceViewer`) + `CollectionDetailViewer` use corrected `AspectAwareMedia`. **Correct.**
- Suggestions: `MobileMarketSuggestionBlocks` only mounts when sheet expanded + toggle on (PRODUCT). **Not globally deleted; not in immersive view.**
- Metadata: compact swipe-up sheet. **Usable.**
- Bagging: `useMobileBagging` unchanged; `measurement-bagging-contract` passes. Custom Quote preserved. **Intact.**

## 5. Phase 10 rescue verification
- `f666894` present. `test-aspect-aware-media-strategy.js` encodes the B-lite contract and **passes**.
- `AspectAwareMedia` square vs landscape values distinct (§4). Cards use clean cover (no ambient backdrop leak into catalog/product/collection/grid cards). Docs (`README.md`, `phase-10abc-media-card-rescue-audit.md`) match implementation. **Verified.**

## 6. 9C status — IMPLEMENTED (9C-1)
- Owner three-dot `⋯` now opens a compact custom dropdown (`AppFloatingMenu`, width 240, clamped) with exactly **Settings** and **Store** (plain text, no icons/emoji, no Share/Copy/QR/Notifications/Sign-out).
- **Settings route:** `router.push('/settings')` (`app/settings.tsx`). Verified real.
- **Store route:** `router.push('/studio')` — canonical Studio entry (`STUDIO_ROUTES.overview.path === '/studio'`, already used by `app/settings.tsx`, `app/studio/resolve-alias.tsx`). The Studio webview resolves **setup vs dashboard internally** (`PROFILE_SETUP_REQUIRED` message + brand-eligibility gating), so no native store-status branching was invented. Unknown/ineligible state fails safe inside the webview.
- **Share ownership:** unchanged. Owner Share button (`BrandProfileActions`) + `AppActionSheet` still own Share/Copy/QR; visitor keeps `↗`/`⋯`→share. No duplication added.
- Dropdown behavior (from existing `AppFloatingMenu`): outside-tap dismiss, Android-back dismiss (`onRequestClose` + `BackHandler`), closes on select, ≥44pt rows, surface background (no white artifact), anchored to the ⋯ via `measureInWindow`.
- Scope: owner view only (visitor `⋯` untouched — Settings/Store are owner concepts).

## 7. Regressions found
None new in 9A/9B/10. One **pre-existing, unrelated** broken test (§11).

## 8. Fixes / changes applied
- 9C-1 owner Settings/Store dropdown (new). No 9A/9B fixes required (verified stable).

## 9. Files changed
- `app/(tabs)/catalog/index.tsx` — owner profile-menu ref/anchor/options + wiring + `CreateMenuWrapper width`.
- `components/catalog/BrandProfileHeader.tsx` — `onOpenMenu`/`menuAnchorRef` props; owner `⋯` opens menu.
- `components/catalog/OwnerCatalogMediaHeader.tsx` — pass-through of the two new props.
- `components/ui/AppFloatingMenu.tsx` — optional `width` prop (default 188).

## 10. Cross-reference checklist
See the Final Report cross-reference section (every 9A/9B/9C acceptance item marked PASS/FAIL/N/A with evidence).

## 11. Test results
- `node scripts/test-aspect-aware-media-strategy.js` → **PASS**
- `npx tsc --noEmit` → **PASS (0)**
- `npm run audit:design-system` → **PASS (80/188)**
- `npm run test:measurement-bagging-contract` → **PASS**
- `git diff --check` → clean (benign LF→CRLF notices)
- `npm run test:brand-profile-contract` → **PRE-EXISTING FAIL**, unrelated: the script hard-codes `app/catalog/index.tsx`, which does not exist on HEAD (actual path `app/(tabs)/catalog/index.tsx`). Fails identically before this pass; no files were moved here. Not addressed (out of scope; would be a separate test-path fix).

## 12. Manual QA checklist
- Tecno Pop 7 + iPad 5th gen: Runway portrait (immersive, no blur) / square (sharp + subtle ambient) / landscape (sharp + stronger ambient).
- Runway vertical scroll (one item at a time) + horizontal carousel.
- Brand catalog Content/Public cards (no strips); Draft / In Review / Needs Attention (full cards).
- Content ↔ Shop tab switching (no scroll lock).
- Pull-to-refresh after admin review (status pills update).
- Design Detail/View portrait/square/landscape; Bag It missing-measurement flow; Custom Quote.
- **Owner three-dot → Settings/Store dropdown:** opens anchored, outside-tap + Android-back dismiss, closes on select, Settings → /settings, Store → /studio (setup or dashboard).

## 13. Remaining risks
- `/studio` setup-vs-dashboard correctness depends on the Studio web app (PROFILE_SETUP_REQUIRED). Native side is safe; verify the web handoff on-device.
- 9C-2 (Share/Copy/QR ownership consolidation onto a single Share affordance) is **deferred** — currently owner Share button + action sheet already own it; no duplication, but a dedicated 9C-2 pass could unify visitor/owner share UX.
- Pre-existing `test-brand-profile-contract` path bug should be fixed separately.
