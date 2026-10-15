# Phase 8C — Background & Typography Correction (single-pass)

Follow-up correction after Phase 8B (Gemini). The client smoke-tested 8B and still
saw the same gray backgrounds and "too big / too plain" profile text. Only the
notification icon was visibly new. This pass fixes the remaining visual mismatch
without reworking the Phase 8B typography system.

## Phase 8 recap

**Original client complaints (vs Facebook mobile):** thin/flat fonts; profile text
not bold/tiny/dense; dim bio; off-white background; cards don't pop; cramped top
section; inconsistent white/gray layering; missing notification icon/count.

**Phase 8A audit conclusion:** keep Inter; the problem is hierarchy/density/contrast/
background layering and raw-typography drift, not the font family. Add semantic
variants, keep AppText the gatekeeper, use `maxFontSizeMultiplier`.

**Phase 8B (Gemini) implemented:** Inter fallback safety (`FontMode`), `AppText`
`sanitizeStyle` + `maxFontSizeMultiplier`, semantic typography tokens, `textMuted`
contrast bump, `#F0F2F5` `bg` token, some raw-typography migrations, notification
icon/count on profile/catalog.

**Remaining 8B complaints (this pass):** bio/stats still too large/loose; page still
dim-white; top-white/lower-gray split; gray blanket under the Shop tab; market should
be white too; contact chips are bulky gray pills; **draft cards collapse into thin
gray lines**; bottom island sits on a gray strip; runway 🔔 has no count.

## Root cause — gray backgrounds

The Phase 8B `bg` token is `#F0F2F5` (intentional gray canvas). Every page-root
`SafeAreaView` painted itself with `theme.colors.bg`, while the header, tabs, and tab
pager painted `theme.colors.surface` (white). Result: white top, gray everything the
white sections didn't cover (lower content area, behind the Shop grid, the strip
behind the floating island). It was never a "blanket" component — it was the page
root showing through.

**Changed to a clean white page baseline** (`theme.colors.surface`):

- `app/(tabs)/catalog/index.tsx` — both `SafeAreaView` roots (skeleton + main).
- `src/features/market/components/MarketScreen.tsx` — both `SafeAreaView` roots.
- `src/features/market/components/MarketSkeleton.tsx` — root.

Gray/tinted surfaces now live **only inside components** that need separation
(banner area `surfaceAlt`, cards, inputs, filters, image scrims). Cards still pop via
border + shadow/elevation + scrims. Dark mode unaffected (token-driven).

## Typography density (`src/styles/tokens.ts` + `AppText.tsx`)

Tightened the semantic tiers instead of resizing per-screen (no raw drift):

| Token | Before | After |
| --- | --- | --- |
| `bodyReadable` (bio/about) | 15 / 500 / 22, Inter Regular | 14 / 500 / 20, **Inter Medium** |
| `statValue` | 14 / 700 / 20 | 13 / 700 / 17 |
| `statLabel` | 12 / 600 / 16 | 11 / 600 / 14 |

- Bio now reads denser, darker, medium-weight (`AppText` `FONT_FAMILY_MAP.bodyReadable`
  → `medium`).
- Brand/profile name unchanged (banner uses `title`, already `adjustsFontSizeToFit` —
  still pops, not oversized). Location keeps `smallBold` (client said it looked right).
- Tab labels unchanged (`caption`, already compact + bold-on-active).

## Contact metadata (`BrandProfileHeader.tsx`)

Before: gray (`surfaceAlt`) rounded pills with a bordered chip per item showing the
verbose label ("Email") + value.

After: Facebook-style stacked metadata — emoji icon + value, `smallBold`, `default`
tone, **no background, no border**, one per line, truncated. Emoji map:

| Label | Emoji |
| --- | --- |
| Email | ✉️ |
| Website | 🌐 |
| Instagram | 📷 (instagram) |
| Phone | 📞 |
| Facebook | 📘 |
| X | ✖️ |

## Draft / content card collapse (`CollectionCard.tsx`)

**Root cause:** the card is an `Animated.View` that combined `elevation: 5` **and**
`overflow: 'hidden'` with no explicit height. On Android, elevation + overflow:hidden
on the same view drops child layers (the same bug the island nav documents) — drafts,
whose private cover images never resolve to trigger a relayout, stayed collapsed and
rendered as faint gray slivers (the `skeletonBase` look).

**Fix:** structural split + explicit height.

- Outer `Animated.View` (`styles.card`): explicit `height: imageHeight`, `borderRadius`,
  shadow/elevation — **no** `overflow:hidden`, **no** border.
- New inner `styles.cardClip`: `flex: 1`, `borderRadius`, `borderWidth`, `overflow:hidden`,
  border color — does the clipping, carries no elevation.

The explicit height guarantees the card can never collapse to a line; skeleton (load)
and empty states are untouched, filters/tabs and tablet grid preserved.

## Bottom island

No island change needed. The "gray strip" was the page root behind the floating
island; the white baseline removes it. Runway/media scrim behavior untouched
(`NativeIslandBottomNav` `IslandGlass` is independent of page bg).

## Notification count — single source, aligned with web

- **Source of truth:** `useUnreadNotificationCount()` (`src/realtime/notifications.ts`),
  backed by `NotificationsApi.getUnreadCount` (same backend endpoint as web) + realtime
  socket deltas. Not hardcoded.
- **Now unified across every 🔔/avatar surface:**
  - Catalog/profile bell — `BrandProfileHeader` (already wired).
  - Island "Me" badge — `app/(tabs)/_layout.tsx` `profileBadge` (already wired).
  - **Runway bell — newly added** in `MarketFeedScreen` (was missing entirely).
- **Badge presentation (per client):** no background pill — the count renders in the
  **system/brand color, bold** (`AppText variant="badgeLabel" tone="primary"`). Applied
  to the catalog bell and runway bell. 0/loading → icon only; `>99` → `99+`.
  - This also removed an existing `audit:design-system` finding (the old badge passed
    `color` inline to `AppText`).

## Manual QA checklist

- [ ] Catalog/Profile is clean white top→bottom; no white/gray split.
- [ ] No gray blanket under the Shop tab/product/draft area.
- [ ] Market root is clean white; cards still pop.
- [ ] Bio/about reads smaller, denser, darker; stats compact.
- [ ] Contact rows are emoji + value, tiny/bold, no pills; long values truncate.
- [ ] Draft cards render full height (or proper skeleton/empty state) — never lines.
- [ ] Bell count shows on runway, catalog, and island; all equal; no bg, bold, brand color.
- [ ] Dark mode intact.

## Validation

- `npx tsc --noEmit`
- `npm run audit:design-system`
- `git diff --check`
