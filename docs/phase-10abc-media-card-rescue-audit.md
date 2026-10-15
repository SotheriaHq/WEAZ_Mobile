# Phase 10A–10C — Mobile Media & Catalog Card Rescue (Audit + Implementation)

Branch: `native-runtime-ux-fixes` • HEAD at audit time: `835325b` (9B-2), parent `3447eb2` (9B-1)
Repo root: `threadly-mobile` • Working tree was clean before edits.

> Source of truth for this pass was the **actual code**, not Gemini's commit messages or
> Phase 9 docs. Where a Gemini change was correct it was kept; where it was wrong it was
> replaced. The Phase 9B-1 runway docs/commit narrative is **not** present as a doc file
> and was not trusted.

---

## 1. Why Phase 10 was needed

Phase 9 (Gemini) media/card work did not resolve the visual issues and regressed some:

- Runway blur felt worse; square and landscape media looked the same.
- Brand catalog cards grew unwanted top/bottom strips and looked off at the edges.
- The committed `aspectAwareMediaStrategy` **failed its own contract test** (`scripts/test-aspect-aware-media-strategy.js`) — proof the 9B-2 strategy change shipped out of sync with its spec.

## 2. What Gemini got right (kept)

- **Runway vertical paging** (`MarketFeedScreen` FlatList): measured `pageHeight`, consistent `getItemLayout`/`snapToInterval`, `disableIntervalMomentum`, `feedViewportReady` gate, one-page momentum clamp in `FeedMediaCarousel`. Solid; **unchanged**.
- **Horizontal carousel** using `ScrollView` (not FlatList) for Android nested-scroll safety. Kept.
- **`AspectAwareMedia` architecture** (single resolver + foreground/backdrop layers, post-load dimension capture, dominant-color container). Kept; only the *policy* and *values* were corrected.
- **9B-2 suggestion deferral** in `MarketCommerceViewer`: `MobileMarketSuggestionBlocks` only mounts when the details sheet is expanded **and** the "Similar pieces" toggle is on (PRODUCT only). Not globally removed, not in the initial immersive view. Correct; kept.
- **Bagging validation / Custom Quote** in `MarketCommerceViewer` + `useMobileBagging`. Untouched; contract test still passes.

## 3. What Gemini got wrong (replaced)

| Problem | Root cause | Fix |
| --- | --- | --- |
| Square ≈ landscape in runway | `STRATEGY_MATRIX` mapped both square and landscape to `letter-solid` in tall containers | Resolver rewritten; square→`letter-soft`, landscape→`letter-blur` (distinct values) |
| Blur "worse" / dark blanket | `contain-blur`/`letter-blur` used blur 40, backdrop opacity 0.92, **black wash 0.25** | Lighter, image-reflective ambient; no dark wash (see §6) |
| Blurred flash on load | unknown dimensions → `contain-blur` (heavy). Design media has no dims, so the viewer always flashed | unknown → `letter-solid` (clean matte, no blur, no jump) |
| Catalog card top/bottom strips | `CollectionCard` cover used `contain` + `aspectAware` inside a fixed `width×1.58` frame → letterbox bars (`letter-solid`) | Card cover switched to clean `cover` (full-bleed), clipped by `cardClip` |
| Content vs Shop card mismatch | Content cards used contain+aspectAware while Shop product cards use `cover` | Content cards now `cover` → aligned with Shop |
| Contract test red | 9B-2 matrix shipped out of sync with `test-aspect-aware-media-strategy.js` | Test rewritten to the new contract; passes |

## 4. Media strategy — before vs after (tall runway/viewer container)

| Image | Before (committed) | After |
| --- | --- | --- |
| Portrait / ultra-portrait | `edge` (cover) | `edge` (cover) — unchanged, immersive |
| **Square** | `letter-solid` (= landscape) | **`letter-soft`** — subtle same-image ambient, sharp contained foreground |
| **Landscape / ultra-wide** | `letter-solid` (= square) | **`letter-blur`** — stronger ambient, distinct from square |
| Unknown dims | `contain-blur` (heavy blur flash) | `letter-solid` (clean matte, no flash, no crop) |

The resolver no longer uses a 40-cell bucket matrix. It computes the actual `cover`
crop fraction; ≤ `0.28` → `edge`, otherwise `contain` + a backdrop chosen by image shape.

## 5. Square vs landscape differentiation (the user's explicit "B-lite" policy)

Foreground is **always** sharp and uncropped (`contentFit="contain"`). Only the empty
band behind it differs, and square is deliberately lighter than landscape:

| | blurRadius | backdrop image opacity | wash | dark wash? |
| --- | --- | --- | --- | --- |
| Square (`letter-soft`) | 10 | 0.32 | 0.12 (faint) | no |
| Landscape (`letter-blur`) | 16 | 0.55 | 0.10 | no |

A runtime guard in the contract test asserts square and landscape never resolve to the
same strategy value.

> A square photo **cannot** truly fill a tall phone screen without ~50% crop or
> upscaling/stretching. We do neither: square is shown whole and pixel-sharp on a clean
> dominant-color matte with a subtle same-image ambient — no quality loss.

## 6. Blur / backdrop values — before vs after

| | Before | After |
| --- | --- | --- |
| Strong blur radius | 40 | 16 |
| Soft blur radius | 24 | 10 |
| Backdrop image opacity (strong) | 0.92 | 0.55 |
| Backdrop image opacity (soft) | 0.85 | 0.32 |
| Wash (strong) | `rgba(0,0,0,0.25)` | `rgba(0,0,0,0.10)` |
| Wash (soft) | `rgba(0,0,0,0.15)` | `rgba(0,0,0,0.12)` |

## 7. Catalog card border root cause + fix

Root cause: `components/catalog/CollectionCard.tsx` rendered the cover with
`resizeMode="contain"` + `aspectAware` inside a fixed `width × width*1.58` frame. Any
cover not exactly 1:1.58 was letterboxed → `letter-solid` matte bars = the top/bottom
strips. The hairline `cardClip` border + `overflow:hidden` clipping were **not** the
cause and were kept (clean intentional edge; matches the card shell).

Fix: cover now uses `resizeMode="cover"` (full-bleed), clipped by `cardClip`. No strips,
clean rounded corners, no background leak, aligned with Shop product cards. Draft / In
Review / Rejected / Public states are unaffected (they only change overlay copy/pills).

## 8. Design Detail / View (9B-2) status

No regression introduced by 10B beyond the shared resolver improvement. The viewer uses
the same full-screen tall container + resolver (no override), so it now benefits from the
clean unknown→matte path (design media has no backend dimensions, so it previously always
flashed `contain-blur`). Suggestions deferral, compact metadata sheet, bagging validation,
and Custom Quote are intact.

## 9. Phase 10C — menu / share status

**Untouched (not implemented by Gemini).** `BrandProfileHeader` wires the three-dot `⋯`
directly to `onShare`; there is no Settings/Store dropdown in the repo. Per the brief, 9C-1
was left as-is. No route invention. Store/Settings routing audit therefore not actioned
this pass (nothing to finish or revert).

## 10. Files changed

- `src/components/media/aspectAwareMediaStrategy.ts` — resolver rewritten (computed crop-based decision; square≠landscape; unknown→matte). Removed dead 40-cell matrix.
- `src/components/media/AspectAwareMedia.tsx` — lighter image-reflective ambients, distinct square/landscape values, no dark blanket, dev diagnostics + `diagnosticsLabel` prop.
- `src/components/media/README.md` — strategy table rewritten to match.
- `src/features/feed/components/FeedImage.tsx` — pass `diagnosticsLabel`.
- `src/features/market/components/MarketCommerceViewer.tsx` — pass `diagnosticsLabel`.
- `components/catalog/CollectionCard.tsx` — cover image `contain`+aspectAware → clean `cover`.
- `scripts/test-aspect-aware-media-strategy.js` — contract updated to the new policy (was already failing against committed code).

## 11. Tests run

- `node scripts/test-aspect-aware-media-strategy.js` → **pass** (was failing pre-change).
- `npx tsc --noEmit` → **pass** (exit 0).
- `npm run audit:design-system` → **pass** (80/188).
- `git diff --check` → clean (only a benign LF→CRLF notice).
- `npm run test:measurement-bagging-contract` → **pass** (bagging preserved).

## 12. Remaining manual QA

- Runway: portrait fills immersively; square shows sharp + subtle ambient; landscape shows sharp + stronger ambient; all three visibly distinct.
- Runway vertical scroll still moves one item at a time; horizontal carousel still swipes.
- Design/Product viewer: no blurred flash on first paint; media not cropped.
- Brand catalog: no top/bottom strips; clean corners; Content and Shop cards aligned; Draft/In Review/Public states correct.
- Devices: Tecno Pop 7 (low-end Android, `removeClippedSubviews` path) and iPad 5th gen (tablet grid).
