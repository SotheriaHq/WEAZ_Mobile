# Phase 4B — Messaging, Search Reliability & Navigation Back-Stack

Mobile-only implementation. No backend (`bthreadly`) or web (`fthreadly`) changes were
required (see §6). Branch `native-runtime-ux-fixes`.

## 1. Phase 4A preflight result

- Phase 4A commit `4e1f9733a92d6a8bf7a9845eda400597355c8726` is present and is `HEAD`
  (`git merge-base --is-ancestor … HEAD` → yes).
- Working tree clean before edits.
- Phase 4B did **not** modify any Phase 4A file (shopper profile, Orders preview,
  Settings styling, floating menu, safe-area banner, dark tokens, bottom nav, New Drop
  badge). Diff is limited to messaging/search/navigation files.

## 2. Inbox participant identity & tabs

- Backend `/messaging/inbox` already returns `participant` (id/username/firstName/
  lastName/profileImage) per conversation, and `MessagingApi.normalizeConversationSummary`
  maps it correctly. No backend or mapping change was needed for name/avatar population.
- The weak `DM` avatar placeholder is replaced with **real initials** derived from the
  participant name / username / conversation title (`getConversationInitials`), falling
  back to a neutral `💬` only when nothing is known.
- Inbox tabs (`All / Unread / Orders`) are now **left-aligned**. `Tabs` gained an opt-in
  `align?: 'center' | 'start'` prop (default `center`, preserving every other caller).
  Inbox passes `align="start"`; the scrollable container drops the centering
  `flexGrow`/`justifyContent: center` so tabs begin at the far left and the underline
  measures/aligns from the first tab. The active underline already uses `primary`.

## 3. Chat header identity source order

Header identity is now resolved in priority order:

1. **Message-derived participant** — the first message whose sender is not the current
   user (most authoritative; carries the real avatar).
2. **Route-param participant** — name/username/avatar/id passed from the inbox row via
   `buildThreadParams` (`participantName`, `participantUsername`, `participantAvatarUrl`,
   `participantId`). Provides an immediate, correct header before/without messages.
3. `null` → only then does the header show contextual fallback copy.

Effects:

- Title shows the real participant name whenever it is known (route param or message).
- `Participant unavailable` only appears when the participant is genuinely unknown and
  it is not a new brand thread.
- `DM` avatar fallback replaced with initials (neutral `💬` only when truly empty).
- Order/inquiry context labels are preserved.
- No backend thread DTO change was required (the inbox already carries identity, and the
  message-derived path covers deep-link entry).

## 4. Composer emoji & attachment behavior

- **Attachments** wire to the existing upload contract `MessagingApi.uploadMessageAttachment`
  (`/uploads/message-image`, validated by `MOBILE_UPLOAD_POLICIES.messageImage`). Flow:
  pick image (`expo-image-picker`, already a dependency) → best-effort compress
  (`compressPickedImage('messageImage')`) → upload → store returned **real file id**.
  Only successfully-uploaded ids are sent via `attachmentFileIds` on `sendMessage` /
  `startConversation`. No fabricated ids. Up to `MAX_PENDING_ATTACHMENTS` (4) images.
  Pending previews show uploading/error state and a remove (`✕`) control.
- **Emoji** uses a lightweight inline emoji row (curated set) toggled by a `😊` button —
  no new dependency, no heavy picker. Tapping an emoji appends it to the composer text.
- Send is enabled when there is text **or** at least one ready attachment; blocked while
  any attachment is still uploading and while sending (double-send guarded by `sending`).
- Documents (PDF) are intentionally out of scope here (no document-picker dependency);
  the upload API supports them and can be wired in a follow-up.

## 5. Search suggestion/result state model

The full results page is now decoupled from live typing via a `submitted` flag:

- While typing (`submitted === false`), the screen stays on the **suggestions** view even
  though the live debounced search keeps running in the background to keep results warm.
- The results `FlatList` (and the `loading` / `error` / `No results found` cards) render
  only when `submitted === true` — set by an explicit submit: keyboard search, a
  recent/popular tap (`runSubmittedSearch`), or `autoSubmit` deep-link.
- Editing the query (`onChangeQuery`) returns to suggestion mode, so suggestions never
  flash away mid-keystroke and a stale empty result can never overwrite valid suggestions.
- Selecting a suggestion still routes directly to the entity (`openSearchItem`).
  Debounce/cancellation (AbortController + request-id guards) and recent-search history
  are unchanged.

## 6. Backend search parity — finding (no change made)

Audited `bthreadly/src/search/search.service.ts`. Both `suggest()` and `search()` call the
**same** page functions (`searchProfilesPage`, `searchBrandsPage`, `searchProductsPage`,
`searchDesignsPage`, `searchCollectionsPage`):

- **Profiles** bypass the Redis suggestion index entirely in both paths → identical
  matching, no parity gap.
- **Brands / products / designs / collections** read the Redis suggestion index first
  (`fetchSuggestionItemsWithFallback`) and **DB-fall-back to the same live page function**
  when Redis is empty.

So the headline concern ("known brand/profile shows in suggestions but results say *No
results*") does not occur for profile/brand identity at the matching level. The only
residual divergence is **Redis suggestion-index staleness**: when Redis holds an entry the
live results query would now exclude (unpublished/visibility/coverage), suggestions can
show it while results do not. Fixing this safely requires DB-backed index reconciliation
(validating/hydrating Redis-sourced ids against the live query) plus tests against a real
database — which cannot be validated in this environment without weakening search.
**Recommendation:** scope an index-reconciliation backend task with DB-backed tests; do
not relax the live-results coverage/visibility filter.

## 7. Navigation / back-stack fixes

`AppBackButton` already does `canGoBack() → back()` else `navigate(fallbackHref)` when no
custom `onPress` is supplied; Settings sub-screens, Orders, and Chat already pass a safe
`fallbackHref`. The unsafe pattern was a custom `onPress` (or button) calling bare
`router.back()` with no fallback. Fixed:

- `app/(tabs)/me-edit.tsx` — Edit Info `handleBack` now `backOrNavigate('/(tabs)/me')`.
- `app/(tabs)/catalog/edit-profile.tsx` — owner edit `handleBack` → `backOrNavigate('/catalog')`.
- `app/posts/[postId].tsx` — error-state Back button → `backOrNavigate('/(tabs)')`.
- `app/studio/staff.tsx` — two `AppBackButton onPress={() => router.back()}` replaced with
  `fallbackHref="/studio"` (and the now-unused `router` import removed).

Chat back already returns to Inbox (`fallbackHref="/(tabs)/inbox"`); Orders/Settings
fallbacks were already correct and left unchanged. No broad routing rewrite.

## 8. Tests run

- `npx tsc --noEmit` — pass.
- `npm run audit:design-system` — pass (Findings 80/188, no new violations).
- `npm run test:brand-profile-contract` — pass.
- `npm run test:shopper-settings-contract` — pass.
- `npm run test:measurement-bagging-contract` — pass.
- `npm run test:design-editor-contract` — pass.
- `node scripts/test-catalog-entity-contract.js` — pass.
- `git diff --check` — clean.

## 9. Manual QA checklist (device)

- Inbox: conversation rows show real name + avatar (initials fallback, never `DM`).
- Inbox: `All / Unread / Orders` start at far left; active underline aligned.
- Chat header (existing thread from inbox): real participant name + avatar immediately.
- Chat header (empty/new brand thread): shows brand/start copy, not `Conversation`.
- Send text message.
- Attach image → preview → send; remove a pending attachment before send.
- Emoji button opens row; tapping appends emoji.
- Search: type a known brand/profile → suggestions stay stable (no flash).
- Search: repeat the same query → stable suggestions.
- Search: submit (keyboard) → results page; tap a suggestion → routes to entity.
- Edit Info → back returns to Me (not Runway).
- Orders back → Profile/Me; Settings sub-screen back → Settings; Chat back → Inbox.
- Devices: Tecno Pop 7 (old Android) and iPad.
