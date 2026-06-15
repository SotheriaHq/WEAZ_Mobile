# Native Runtime QA

## Status
- [x] Fix Plus sheet render latency (optimize conditional mounting)
- [x] Fix user-facing error policy (generic errors, no technical jargon)
- [x] Fix required-field / Preview blocker
- [x] Fix immediate routing response
- [x] Fix navPerf measurement model

## Fixes Implemented
- **Routing Latency:** Wrapped `router.push`/`router.replace` in `requestAnimationFrame` to ensure visual tap feedback renders before UI thread blocks on navigation.
- **NavPerf Model:** Separated user tap measurement from actual navigation call measurement.
- **Composer Conditional Rendering:** Converted `AppBottomSheet` children to a render prop (`typeof children === 'function' ? children() : children`) and updated `composer.tsx` to pass heavy rendering functions (like `renderDiscoverySections`) as render props. This prevents React from evaluating the entire DOM tree when the sheet is unmounted, directly reducing main thread UI latency.
- **Floating Menu Fix:** Updated `AppFloatingMenu` to synchronously calculate position based on provided `anchorMetrics` rather than waiting for an asynchronous layout measurement, eliminating a double-render flash.
- **Error Policy:** Replaced technical exception messages (e.g. `nextError.message`) with safe, generic fallback errors that the user can understand ("Could not update profile. Please try again.") inside `app/(tabs)/me.tsx`, `app/orders/index.tsx`, `app/orders/[orderId].tsx`, and `app/reviews/index.tsx`.

## Verification Instructions
1. Test opening the Style details, Occasion, and Cultural vibe sheets in the composer; they should open smoothly without heavy lag.
2. Trigger an intentional failure (e.g., turn off network) and attempt to save profile/fittings, or skip a review prompt. Verify the error shown is non-technical.
3. Tap routing links (e.g., Profile icon) and confirm the immediate visual feedback occurs before the screen transition.

## Phase 1B Targeted Fixes

### Owner catalogue tab preload
- `useBrandDraftsQuery` called a non-existent `brandApi.getMyDrafts()` → crashed with
  `undefined is not a function`. Fixed to call `brandApi.getDrafts({ ownerId })`.
- Drafts, Needs Attention, and **In Review** now each have an always-on query
  (`useBrandDraftsQuery`, `useBrandNeedsAttentionQuery`, `useBrandInReviewQuery`) so
  their counts/content preload on catalogue entry instead of only after the tab is tapped.
- Bucketing rules enforced: Drafts = `DRAFT` only; Needs Attention = `FAILED` /
  `PROCESSING` only (CHANGES_REQUESTED removed); In Review = `IN_REVIEW`; Changes
  Requested stays in its own tab; Public shows only `PUBLISHED` + `PUBLIC`.
- `VisibilityFilter` now shows an In Review count badge.

### Seeded tags pipeline (backend / web / native)
- Root cause: the active DB's `tag` table is **empty** — `GET /tags` returned
  `{ data: [] }`. Backend code (`TagsService.getPopularTags`) and seed logic
  (`ensureDefaultTags`, status APPROVED) are correct; the seed simply had not
  populated the active DB.
- `GET /tags` response shape: `{ statusCode, message, data: [{ name, usageCount }] }`.
- Web (`fthreadly/src/api/TagsApi.ts`) and native (`threadly-mobile/src/api/TagsApi.ts`)
  parsers already handle `name`/`tag` + `count`/`usageCount` and `data` wrapping —
  no parser change needed; they were empty only because the source was empty.
- Fix/seed path: added a standalone, idempotent, non-destructive tag seed —
  `bthreadly/prisma/seed_tags.ts`, run via `npm run prisma:seed:tags` (does NOT
  create demo brands/users/collections, unlike the full `prisma db seed`).
- **Manual action required:** run `npm run prisma:seed:tags` in `bthreadly` against
  the active DB, then re-check `curl http://localhost:3040/tags`.

### Unauthenticated logout rule
- `/auth/profile` 401 during bootstrap means the stored token is already invalid —
  there is no live session to revoke. `validateToken` was calling `signOut()` with the
  default `notifyServer: true`, which fired a spurious `POST /auth/logout` that itself
  401s. Both failure paths now call `signOut({ notifyServer: false })`, matching the
  refresh-failure path and the global 401 handler. Explicit user logout still notifies
  the server.

### Library picker sequencing
- Tapping a media source no longer launches the system picker in the same frame as the
  app option sheet close. The composer records a `pendingPickerSource`, closes the
  `AppFloatingMenu`, and an effect launches the picker via
  `InteractionManager.runAfterInteractions` only after the sheet has dismissed — so only
  one sheet/picker is active at a time (fixes the layered/double-collapse).

### Keyboard manual smoke checklist (PARTIAL — device verification required)
- Main composer form `ScrollView` is now keyboard-aware: dynamic bottom padding =
  `keyboardHeight`, `keyboardDismissMode="interactive"`, and
  `automaticallyAdjustKeyboardInsets` on iOS so the focused field scrolls clear.
- Sticky footer lift is resolved by `footerKeyboardLift`, which is platform- and
  Android-resize-aware: iOS lifts by the measured `keyboardHeight`; Android detects
  whether the OS actually resized the window (edge-to-edge `adjustResize`) by comparing
  the live `useWindowDimensions().height` to the no-keyboard baseline. If the window
  resized, the footer is already lifted natively (offset = 0); if it did **not** resize,
  the footer is lifted manually by `keyboardHeight - safeAreaBottom`. This avoids both the
  "footer covered" (no-resize) and the "footer floats too high" (double-count) failure
  modes without an arbitrary timeout or a global `softwareKeyboardLayoutMode` change.
- Custom order sheet and tags sheet already inherit keyboard handling from
  `AppBottomSheet`'s `KeyboardAvoidingView`.
- Device checks: (1) focus the main form's lower inputs (title/description) — input
  stays visible above keyboard; (2) Save Draft / Preview footer buttons remain tappable
  with keyboard up on iOS **and** Android; (3) custom order sheet inputs and the hashtag
  search input stay visible; (4) verify Android edge-to-edge: footer not covered and not
  over-lifted.

## Catalogue UX + Failed-content Cleanup

### Bottom clearance smoke test (PARTIAL — device verification required)
- The catalogue uses one scroll owner: the outer vertical ScrollView in
  `app/catalog/index.tsx`. Its `paddingBottom` = `standardScreenBottomPadding`
  (island clearance 88 + safe-area bottom) + `xl`, so the last card row clears the
  bottom island/nav.
- The Shop tab's embedded branch (`BrandShopTab`, `scrollEnabled=false`) previously
  wrapped content in a nested `<ScrollView scrollEnabled={false}>` that collapsed /
  measured unreliably inside the height-measured pager, clipping the lower product
  rows. It is now a plain `View`, so the pager's `onLayout` measures the true content
  height and every row scrolls fully above the island.
- Device check: scroll Content, Shop, Drafts, In Review, Needs Attention to the last
  row — no card is hidden behind the island and there is no gray dead-zone.

### Tab scroll smoke test (PARTIAL — device verification required)
- All three tab pages (Content / Shop / Reviews) are now plain Views that report a
  real content height to the pager `onLayout`; no nested non-scroll ScrollView
  collapses the height. Empty states measure their natural height (no fake lock).
- Device check: switch tabs repeatedly and confirm scrolling stays consistent and the
  Shop grid scrolls to the final product.

### Tab state preservation
- Reviews is no longer conditionally unmounted; it stays mounted and is gated by its
  `enabled` prop (it no-ops its fetch while inactive), so switching tabs no longer
  remounts/reloads the whole Reviews body.
- Status tabs (Public / Private / Drafts / In Review / Needs Attention) read from the
  always-on React Query caches added in Phase 1B, so switching shows cached content
  immediately instead of clearing to empty. Normal tab switches do not `_cb`
  cache-bust; `_cb` is only added on explicit force-refresh (pull-to-refresh).

### Draft vs Needs Attention status rules
- Drafts = intentional `DRAFT` only. Backend `getMyDraftCollections` filters
  `status: 'DRAFT'` (no FAILED/PROCESSING leak); a DRAFT with missing media is still a
  legitimate draft the owner can edit/delete.
- Needs Attention = `FAILED` / `PROCESSING` only (server items via
  `useBrandNeedsAttentionQuery`; `CHANGES_REQUESTED` is NOT included here).
- Changes Requested = its own tab. Public = only `PUBLISHED` (backend forces
  `status=PUBLISHED` + `visibility=PUBLIC` for non-owner viewers — not frontend-only).

### Failed item Retry / Edit / Delete / Dismiss behavior
- Local-only failed background tasks render in the Needs-Attention banner with
  **Retry/Edit** (re-opens the editor) and **Dismiss** (clears the client task).
- Persisted failed/processing items render as owner cards in Needs Attention; the card
  `⋯` menu provides **Edit** (re-opens the design editor) and **Delete**
  (`brandApi.deleteCollection`, confirm-to-delete).
- Failed/processing/draft items are never shown to public visitors (backend visibility
  enforcement above).
