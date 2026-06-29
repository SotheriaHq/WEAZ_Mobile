# Phase 11A–11B — Launch Single-Surface + Selector/Tag/Keyboard/Scroll Rescue

Branch: `native-runtime-ux-fixes` • Repo root: `threadly-mobile`
Pre-edit HEAD: `7dbf881` (stabilization) • `f666894` (rescue) present • working tree clean.

> Source of truth = actual code + backend contract. Gemini docs/claims not trusted.

---

## 1. Broken launch sequence — root cause
Splash ownership was already single-path and correct: one module-scope
`SplashScreen.preventAutoHideAsync()` ([app/_layout.tsx](app/_layout.tsx)) and one guarded
`hideNativeSplashOnce(...)` fired from the bootReady shell's `onLayout` (not waiting on feed
API). The visible **tiny → blank → large logo** sequence was a **size/asset mismatch**, not a
double-hide:

- Native splash (`expo-splash-screen` plugin, app.json): logo at the plugin default
  **`imageWidth: 200`**, `contain`, on `#0b0710`.
- React `StartupFallback`: the **same asset** rendered at **`width:'100%', height:'100%'`** →
  full-screen logo. So whenever the JS fallback showed (provider mount / handoff gap), the logo
  jumped from native-200px to React-full-screen, with the mount gap reading as "blank".

## 2. New single-surface splash ownership
- Locked the native size explicitly: `app.json` splash plugin now sets `"imageWidth": 200`.
- `StartupFallback` now renders the logo at a fixed **`SPLASH_LOGO_SIZE = 200`** centered on the
  same `BOOT_BACKGROUND = '#0b0710'` → **pixel-identical** to the native splash. The native→JS
  handoff is now one continuous surface (no tiny→large jump, no visible blank).
- Hide path unchanged (still single, guarded, on first shell `onLayout`; does not wait for feed).
- Diagnostics extended: `hide-native-splash` now logs `splashVisibleMs` (from a module-load
  `bootStartedAt`), alongside existing mount counts, hide reason, hide count, and ready times
  (gated by `isThreadlyDebugEnabled('boot')`). Expected `splashHideCallCount === 1`.
- Expo Go / dev-client / release caveat: native splash assets only apply in dev-client/release
  builds, not Expo Go. The JS `StartupFallback` now matches regardless, so the surface is
  continuous in all three.

## 3. Selector UI — root cause and fix
- Actual components: tag/category selection runs through `AppMultiSelectSheet`
  ([components/ui/AppSelectSheet.tsx](components/ui/AppSelectSheet.tsx)) inside
  `AppBottomSheet`; individual tags render as `Chip`
  ([components/ui/Chip.tsx](components/ui/Chip.tsx)); category/garment use `AppBottomSheet`
  option cards. The user's tested screen is the design composer
  ([app/(tabs)/catalog/create-design/composer.tsx](app/(tabs)/catalog/create-design/composer.tsx)).
- `Chip` already used theme tokens with default/selected/pressed/disabled states (solid `primary`
  fill when selected, `surfaceAlt` + border otherwise) — it was **not** truly flat. The real gap
  was **no distinct state for a pending custom tag**: a user-created tag looked identical to an
  approved global tag.
- Fix: added an additive `pending` prop to `Chip` (warning-tinted outline on a soft surface +
  `· review` suffix, theme tokens only). `AppMultiSelectSheet` now marks freshly-typed custom tags
  as pending and renders them with that treatment.

## 4. Keyboard collapse/expand — root cause and fix
- The selector sheet (`AppBottomSheet`) already lifts with the keyboard via reanimated
  `useAnimatedKeyboard` (UI-thread, smooth) — correct and unchanged.
- The composer screen drove its own collapse/expand with a **fixed `LayoutAnimation.Presets.easeInEaseOut`**
  on every `keyboardDidShow/Hide`, which does not match the OS keyboard curve → the skip/shake.
- Fix: the composer now calls **`Keyboard.scheduleLayoutAnimation(event)`** when the keyboard event
  carries a real duration (syncs the footer + scroll padding to the actual keyboard animation), and
  falls back to the preset only when the event has no curve (older Android `didShow`/`didHide`).
- Old-Android fallback: explicit (preset path when `duration` is absent). No JS-thread animation loop.

## 5. Tag selector scroll — root cause and fix
- The popular/suggested tag list is a `ScrollView` (`scrollArea`) that had **`flexShrink: 1` with no
  bounded height**. Inside `AppBottomSheet` (`scrollable={false}` for the tag sheet), the height
  constraint did not reliably propagate through the flex chain on Android, so the list never became
  scrollable (it either clipped or pushed the custom-tag row off-screen).
- Fix: gave `scrollArea` a concrete **`maxHeight: 240`**, enabled `nestedScrollEnabled`, showed the
  scroll indicator, and added `scrollContent` bottom padding. Parent sheet still owns its own layout;
  the tag sheet has no competing parent ScrollView (`scrollable={false}`), so there is no gesture
  dead-zone. `keyboardShouldPersistTaps="handled"` is retained so taps/select work with the keyboard open.

## 6. Custom tag behavior — root cause and fix
- **Backend contract (verified):** `bthreadly/src/tags/tags.controller.ts` exposes only
  `GET /tags`, `GET /tags/search`, `GET /tags/trending`, read routes, and **admin-gated** mutations
  (`PATCH /tags/admin/status/:name`, `POST /tags/admin/ban`, `/admin/merge`, …). There is **no
  client-callable tag-create/suggest endpoint**. `collections.service.ts` calls
  `tagIndex.syncEntityTags(...)` on design create/update, and `tag-index.service.ts` creates new tags
  with **`status: TagStatus.PENDING`**. So a custom tag included in the design submit payload is
  automatically registered as PENDING for admin approval server-side.
- **Therefore the expected flow needs no new endpoint** (inventing one would violate the contract
  guardrail). Native already: normalizes (`normalizeCustomTagValue`), blocks blank/duplicate/over-max,
  adds the tag to the current post's selected tags immediately, and includes it in the draft/submit
  payload (`tagsInput → tags`). The missing piece was **visibility**: no pending indicator.
- Fix: custom tags added via **Add** now show the `pending` `Chip` treatment + a one-line note
  ("Tags marked '· review' are added to this post now and sent for global approval."). The user can
  proceed immediately; approval happens globally later. Known global suggestions selected from the list
  are **not** marked pending. Add works with the keyboard open (`keyboardShouldPersistTaps="handled"`).
- **Documented backend note:** there is intentionally no mobile `TagsApi.createTag`; global approval is
  driven by the submit payload + admin status route. No backend contract was changed.

## 7. Vertical scroll — root cause and fix
- Runway feed vertical scroll was already stabilized in Phase 9B-1 (measured `pageHeight`, matching
  `getItemLayout`/`snapToInterval`, one-page momentum clamp, stable `keyExtractor`). Verified; **untouched**.
- The composer form scroll has no `onScroll` work (native-smooth); its only jump source was the
  keyboard-driven `contentContainerStyle` paddingBottom relayout, now synced to the keyboard curve
  (§4). No further speculative scroll changes were made (avoiding superficial churn per the brief).

## 8. Old OS/device considerations (Tecno Pop 7 baseline)
- Splash fallback uses transform/size only (no animation loop).
- Keyboard: `scheduleLayoutAnimation` with an explicit preset fallback for old Android events.
- Tag scroll: deterministic `maxHeight` + `nestedScrollEnabled` rather than flex propagation.
- Chip pending state uses border/tint (no heavy shadow), safe on old Android.

## 9. Files changed
- `app.json` — splash plugin `imageWidth: 200` (lock native logo size).
- `app/_layout.tsx` — `StartupFallback` 200px logo (pixel-match native); `splashVisibleMs` diagnostic.
- `components/ui/Chip.tsx` — additive `pending` state (theme tokens).
- `components/ui/AppSelectSheet.tsx` — bounded tag-list scroll, `nestedScrollEnabled`, pending-tag tracking + note.
- `app/(tabs)/catalog/create-design/composer.tsx` — keyboard transition synced via `scheduleLayoutAnimation`.

## 10. Tests run
- `npx tsc --noEmit` → PASS (0)
- `npm run audit:design-system` → PASS (80/188, unchanged)
- `node scripts/test-aspect-aware-media-strategy.js` → PASS
- `npm run test:measurement-bagging-contract` → PASS
- `git diff --check` → clean (benign LF→CRLF notices)
- No tag/category/selector or launch/splash contract test exists in the repo (`package.json`); none added (custom-tag behavior depends on device keyboard + sheet, not unit-testable without overbuilding).

## 11. Manual QA checklist
- Android cold start / kill-reopen: continuous logo, no blank, no tiny→large jump.
- iPad cold start: same.
- Selector default/focused/selected/error/disabled states; pending custom tag visible.
- Selector collapse/expand with keyboard: smooth (no skip/shake).
- Add tag while keyboard open: works; tag appears immediately in Selected.
- Tag list scrolls when tags overflow (≥ ~8–10 popular tags); parent sheet stable.
- Custom tag persists through collapse/expand and into draft/submit payload.
- Custom tag PENDING server-side after submit (admin sees it for approval).
- Vertical scroll on Tecno Pop 7 + iPad 5th gen (Runway + composer form).

## 12. Remaining risks
- `useAnimatedKeyboard` smoothness on very old Android (< API 30) degrades to a step; the explicit
  fallback covers the composer, and the sheet remains usable.
- iOS composer has three keyboard-avoidance mechanisms stacked (`KeyboardAvoidingView` padding +
  `automaticallyAdjustKeyboardInsets` + manual `keyboardHeight`); harmless on the Android baseline but
  worth a focused iOS pass (left untouched to avoid regressing the careful Android-resize footer logic).
- `Chip` min height is 38px (app-wide convention); selector option cards/category rows are 44px. Bumping
  the shared Chip to 44 was deferred to avoid app-wide layout shift.
- All verification is static + unit; on-device QA (esp. Tecno Pop 7 keyboard + tag scroll + splash timing)
  still required.
