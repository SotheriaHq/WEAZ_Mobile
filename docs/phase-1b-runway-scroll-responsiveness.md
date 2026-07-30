# Phase 1B Runway Scroll Responsiveness

## 1. Scroll root cause

The vertical feed combined `pagingEnabled`, `snapToInterval`, fast deceleration,
`disableIntervalMomentum`, and a momentum-end `animated: false` correction when a
fling crossed more than one item. The native scroll first settled, then JavaScript
teleported it back one row, producing the visible kick. Viewability also changed
active state and launched duplicate four-row hydration while scrolling.

The supplied 360 x 820, 13:08 development-build recording confirms the target
device class and visible Runway flow. Its encoded screen-recording frame rate is
not reliable enough for frame-time claims; device `gfxinfo` or Perfetto remains
the runtime acceptance evidence.

## 2. Vertical paging config

> **Superseded 2026-07-28 — see §11.** The "one paging owner" rule still holds, but
> the owner is now native paging, not interval snapping. The list below is kept for
> history; do not restore it.

The feed had one paging owner: interval snapping.

- `snapToInterval = measured pageHeight`
- `snapToAlignment = start`
- `disableIntervalMomentum = true`
- `decelerationRate = fast`
- no `pagingEnabled`
- no momentum-end corrective jump
- `getItemLayout.length`, offset spacing, row height, and snap interval all use
  the same integer `pageHeight`

The feed container must report one positive layout before the list mounts. That
height is locked for the current window width/height signature. Same-geometry
remeasurements are ignored and logged; a real window/orientation change may
reposition the saved active page once with an explicit correction reason.
Bottom-island clearance remains overlay-only and therefore does not alter row or
snap geometry.

## 3. Carousel mount strategy

The horizontal carousel keeps its direct nested `ScrollView` gesture path. Every
angle retains a fixed-width frame so paging width never changes, while only the
current, previous, and next frames mount `FeedMediaSlide`. Adjacent frames load
preview media but only the active vertical/current horizontal slide may upgrade
to DETAIL. Dots still derive from the complete media array and update on native
momentum end. Horizontal JavaScript correction jumps were removed.

## 4. Hydration and rendering

Viewability now records only the latest visible index. Active page state changes
once at momentum end. Analytics and legacy detail hydration run through
`InteractionManager.runAfterInteractions` and are bounded to the settled item
plus one forward candidate. Strict feed DTO rows already contain every angle and
are no longer copied into parent hydration state.

`MarketFeedItem` uses stable callbacks and a primitive render version comparator.
Thread/save/patch/meta/active changes therefore rerender affected rows rather
than every visible row because ReactNode wrappers were recreated.

## 5. Android list tuning

- `initialNumToRender = 1`: prioritizes the first full-screen media.
- `maxToRenderPerBatch = 1`: bounds JS/image mount bursts.
- `windowSize = 3`: retains current plus nearby vertical rows.
- `updateCellsBatchingPeriod = 50`: prepares neighbors without large batches.
- `removeClippedSubviews = false`: avoids Android full-screen blank/flicker during
  detach/reattach while the three-row window still bounds memory.
- no high-frequency `onScroll` state or pagination writes; pagination starts
  after settling within two items of the end.

## 6. Chip feedback

Unselected pressed chips no longer use the selected primary-soft fill/border.
Press feedback is transform plus slight opacity only, while selected styling
comes directly from the selected prop in the same parent state update. A stable
44 px wrapper supplies the effective touch height without forcing compact nav
chips to grow visually. Pending custom-tag color/copy and wrapping are unchanged.

## 7. Preload scheduling

The active Runway image emits a one-time first-media-visible event. Market,
Messages, and the authenticated Profile/Catalog tab preloads are then scheduled
after current interactions, beginning 600 ms later and staggered by 500 ms. An
eight-second fallback supports deep links, empty feeds, and network errors.
Preloading remains enabled for later navigation but cannot start on the old fixed
900/1350/1800 ms timers before first Runway media.

## 8. Performance guard decision

The previous guard failure was obsolete assertion text, not a catalog runtime
regression. Catalog now uses `dataActiveTab`; Shop and Reviews already pass
`enabled` only for their active data tab, with the existing product deep-link
exception. The guard was updated to assert those current gates. No catalog
screen implementation was changed.

## 9. Diagnostics

Opt-in feed/scroll/nav diagnostics now report page/row/snap height, current and
target index, fling distance, settle duration, late/viewability warnings,
correction count/reason, ignored page-height remeasurement, horizontal mounted
indices, deferred hydration completion, first media timestamp/tier, and tab
preload defer/schedule/start/skip reasons.

## 10. Manual QA checklist

- [ ] Tecno Pop 7: slow and fast vertical Runway paging
- [ ] Fast multi-page fling stops one interval without a corrective kick
- [ ] Horizontal current/previous/next swipe and accurate dots
- [ ] Single-image post behavior
- [ ] First Runway media before Market/Messages/Profile preload logs
- [ ] Cached reopen and restored page
- [ ] Tab navigation after idle preload
- [ ] Chip selected/unselected, pending tag, and wrapped-tag feedback
- [ ] Android row recycle: no blank or flicker
- [ ] Rotate/rescale once and verify geometry-change correction only
- [ ] iPad visual check
- [ ] Capture release/dev-client `gfxinfo` or Perfetto evidence for final timing

## 11. Amendment (2026-07-28) — interval snapping replaced by native paging

Phase 1B correctly diagnosed *double* paging ownership (`pagingEnabled` **and**
`snapToInterval`, plus a JS corrective teleport) and correctly removed the teleport.
It picked the wrong survivor. Interval snapping is itself the source of the
long-standing "swipe is smooth while my finger is down, then speeds up and slams
into the next page" complaint.

Verified in the installed React Native 0.85.3 sources, not inferred:

- **Android** — `ReactScrollView.flingAndSnap()`. `disableIntervalMomentum`
  replaces the velocity projection with the raw offset at finger-lift
  (`targetOffset = getScrollY()`), and the snap branch then runs
  `velocityY += (largerOffset - targetOffset) * 10.0`. That boost was written for
  small carousel items; on a full-screen page the term is up to a whole page of
  remaining travel, so it injects roughly ten times the page remainder as
  synthetic velocity into an `OverScroller.fling` clamped to `minY == maxY ==
  target`. The last leg rockets and stops dead — and it is *worst* on a short
  flick, because that leaves the most distance for the boost to multiply.
- **iOS** — `RCTEnhancedScrollView.scrollViewWillEndDragging`. The same flag
  retargets from `scrollView.contentOffset` and takes `ceil()` on any positive
  velocity, so a 5%-travel flick commits to a full page that UIScrollView must
  then cover under `decelerationRate="fast"`.

Both are the same defect in different clothing: the drag phase is finger-driven
and the settle phase's speed is a function of *remaining distance*, not of the
user's gesture, so the two phases do not share a velocity.

Current config — still exactly one paging owner:

- `pagingEnabled`
- no `snapToInterval`, no `snapToAlignment`, no `disableIntervalMomentum`
- `decelerationRate` left at default. `"fast"` shortens Android's fling
  projection, which biases `smoothScrollAndSnap` toward snapping *back* on gentle
  flicks — the "my swipe didn't take" failure mode.
- no momentum-end corrective jump (unchanged from Phase 1B)
- `pageHeight` is now the **unrounded** measured viewport height. Native paging
  snaps to multiples of the scroll view's own pixel height, so rounding the row
  height to whole dp made row *k* start at `round(k * pageHeight * density)` while
  paging targeted `k * viewportPx`; on fractional-density devices (2.625, 2.75,
  3.5) those drift ~0.5px per page until a sliver of the neighbouring page shows.

`snapToAlignment` must stay unset as well: any explicit value keeps Android on the
boosted branch even when no interval is set (`flingAndSnap` only short-circuits to
`smoothScrollAndSnap` when interval, offsets **and** alignment are all unset).

`scripts/test-runway-responsiveness-contract.js` now enforces this and was
repointed from the deprecated `MarketFeedScreen.tsx` re-export shim to
`RunwayFeedScreen.tsx` — against the shim, eight of its assertions had been
silently failing since the rename.

## 12. Amendment (2026-07-28) — transit scrim

§11 fixed the *motion* of the settle. It did not change what the eye is asked to
process during the settle, which was reported separately as visual fatigue: "when
I'm scrolling, everything is just really vivid as they're transitioning, so it
feels like your eyes are seeing so many things at the same time."

That is a real and separate defect. Mid-transit the feed presented, at full
luminance and with a hard seam between them:

- two full-bleed images
- two `FeedActionRail`s — high-contrast icons plus numeric counts, at the same
  screen edge, sliding past each other at different vertical positions

Nothing in the feed was keyed to scroll position. `activePageIndex` only moves at
momentum end, so no element de-emphasised while the pages were actually sharing
the viewport; `NewDropBadge` gated on `isActive`, and `FeedActionRail` did not
gate at all.

Fix — a per-page transit scrim in `RunwayFeedItem`:

- `Animated.Value` on the screen fed by `onScroll` with
  `useNativeDriver: true`, `scrollEventThrottle={16}`, **no JS listener**. The
  per-frame path stays entirely on the native thread, so this cannot regress §11.
- `RunwayFeedList` is now an `Animated.createAnimatedComponent(FlatList)`; a plain
  FlatList cannot host a native-driven `onScroll`. The forwarded ref still
  resolves to the FlatList, so the loop's `scrollToOffset` calls are unaffected.
- Each row interpolates a `theme.colors.bg` scrim on `|scrollY - index *
  pageHeight|`, clamped, peaking at `RUNWAY_PAGE_SCRIM_MAX_OPACITY` (0.55) one
  full page away and reaching **0 at centre** — an idle feed is pixel-identical to
  before. Midpoint is 0.72x the peak rather than 0.5x, so the outgoing page
  recedes while the two pages actually overlap rather than only once it is
  already leaving.
- The scrim is the **last child** of the page, so it covers the action rail and
  meta overlay as well as the media, and is `pointerEvents="none"`.

Because the curve is symmetric about the centred page, it needs no direction
detection and behaves identically for up-swipes, down-swipes, and the loop
teleport.

`RUNWAY_PAGE_SCRIM_MAX_OPACITY` is the single tuning knob; the contract test
asserts the constant, the interpolation, the clamp, the `pointerEvents`, and the
native driver.

## 13. Amendment (2026-07-28) — transit scrim, second pass

§12 shipped one symmetric full-page scrim. Reviewing it against how the platforms
and the reference feeds actually solve this turned up three gaps. All three are
still scroll-linked, native-driven, and 0/1 at centre, so an idle feed remains
pixel-identical and none of them touch paging.

**a. The scrim was fading the light theme toward white.** `scrimColor` was
`theme.colors.bg`. But `styles.feedListContainer` sets the Runway stage to
`tokens.themes.dark.colors.bg` in *both* themes, with an existing comment that
gaps "must read as the deep-black matte in both themes, never a light theme
surface flash." The scrim was doing exactly what that comment forbids, and worse:
in light mode the midpoint of every swipe was *brighter* than either page, which
is the opposite of what a "my eyes were starting to bother me" report needs. The
scrim now dissolves toward the stage matte, so a receding page and the gap behind
it are the same colour.

**b. Chrome now retires faster than media** (`CHROME_FADE_END_RATIO`, 0.45).
The badge, action rail and meta card are wrapped in one `pointerEvents="box-none"`
`Animated.View` that reaches 0 by the time a page is 45% out, rather than sharing
the media's full-page ramp. Rationale: icons and numeric counts hold foveal
attention far harder than photography does, and the mid-swipe frame contained
*two* action rails at the same screen edge at different heights. Retiring them
early means the busiest instant of the transition is two softened photographs and
nothing else competing. This is the scroll-linked form of Material's fade-through
rule — outgoing gone in the first ~100ms of 300ms, the long tail reserved for the
incoming element, explicitly to stop attention being split.

**c. Subtle page scale** (`RUNWAY_PAGE_SCALE_MIN`, 0.94). Android's own reference
answer to this problem, the ViewPager2 zoom-out transformer, pairs MIN_ALPHA 0.5
with MIN_SCALE 0.85 — the alpha independently corroborates §12's 0.55 scrim; the
scale does not carry over, because 0.85 on a full-bleed page opens a ~60px matte
band at the seam that reads as a layout bug. 0.94 is enough for the one job that
matters: **breaking the hard seam between two full-bleed photographs.** Without
it the outgoing and incoming images abut edge-to-edge and read as a single
continuous surface with no boundary telling the eye where one piece of content
ends — a large part of the "seeing so many things at the same time" report.

It is a `transform`, never a layout change, so row height stays exactly
`pageHeight` and `getItemLayout` / native paging keep agreeing (the contract test
asserts both the transform and the absence of any `height: pageHeight * …`).

### Evaluated and deliberately not applied

- **Motion blur.** Rejected on evidence, not taste. It costs GPU time, memory
  bandwidth and shader complexity for a per-frame full-screen pass; stacking
  animated blurred layers is a known cause of janky scrolling on mobile; and the
  usability result is bad precisely in a browse feed, where the user is scrolling
  *in order to read content as it passes*. It would also be the one technique here
  that could regress §11.
- **`renderToHardwareTextureAndroid` on the chrome wrapper.** This is textbook
  territory — RN's own perf guidance names "text with a transparent background
  positioned on top of an image" being animated as the case it exists for, which
  is exactly the action rail. Not applied because the same wrapper contains
  `FeedMetaOverlay`'s `expo-blur` `BlurView`, and flattening a live blur into a
  static hardware texture is the classic way to get stale or artefacted output.
  The win is speculative; the risk is not. Revisit with a profiler, and if taken,
  scope it to the rail alone rather than the whole wrapper.
- **Rasterising the scrim.** Not indicated. The scrim is a single solid-colour
  layer with animated alpha, not alpha compositing over a tree — already cheap.

### d. Geometry moved into a pure, unit-tested module

All three curves now live in `src/features/feed/utils/runwayTransitCurves.ts`,
which imports nothing from React or React Native. `RunwayFeedItem` contains no
transition maths at all — it binds the exported ranges to the shared native
scroll value and nothing else.

The reason is that the previous contract assertions were *source text*
(`expectIncludes(feedItem, 'transform: [{ scale: pageScale }]')`). That is the
right tool for "this prop must never come back", but it proves nothing about
geometry: a reformat breaks it and a sign error sails through.
`scripts/test-runway-transit-curves.js` now evaluates the curves at real scroll
offsets and locks nine invariants:

1. `inputRange` strictly increasing at every page height, **including 0, negative
   and NaN** — `Animated.interpolate` throws on a non-monotonic range, which is a
   crash rather than a visual glitch. The screen clamps `pageHeight` to >= 1
   before a row ever sees it, but the module no longer depends on that.
2. Rest values exact at centre (scrim 0, scale 1, chrome 1) — the invariant that
   makes the whole feature safe to ship without device validation.
3. Symmetry about centre, so no direction detection is needed anywhere.
4. Clamping out to 1000x page height.
5. Opacity within [0,1] and scale within [`RUNWAY_PAGE_SCALE_MIN`, 1] sampled
   across the full transition.
6. The scrim is front-loaded — halfway must exceed a linear ramp.
7. Chrome reaches 0 before the scrim finishes (chrome leads, media follows).
8. Reduce Motion flattens scale and leaves the cross-fades alone.
9. Curve centres equal `pageHeight * index`, matching `getItemLayout`.

The responsiveness contract keeps only what a unit test cannot see: that the
component still binds to the native scroll value, the render tree shape, and that
interpolation ranges are never hand-rolled back into the component.

### e. Reduce Motion

Scale is the only one of the three curves that is actually *motion*, so it is the
only one suppressed when the OS Reduce Motion setting is on. The scrim and chrome
cross-fades stay: a cross-fade is what that setting wants **instead of** movement,
not another thing to strip.

`buildScaleCurve(..., enabled: false)` returns a flat `[1, 1, 1]` curve rather
than `null`, so the component keeps one unconditional code path — no conditional
hooks, and no way to leave a stale transform applied when the setting flips
mid-session.

The read/subscribe pair was already open-coded in `ThreadTapBurstOverlay` and
`ThreadRailAction`; this would have been a third copy, so it was extracted to
`src/hooks/useReduceMotion.ts`. Those two still have their own inline copies —
migrating them is mechanical but touches unrelated catalog animation timing, so
it was left as follow-up rather than folded into a feed change.

### Tuning knobs, in the order worth touching them

All are exported from `runwayTransitCurves.ts`, which is the single source of
truth for them.

1. `RUNWAY_PAGE_SCALE_MIN` (0.94) — most likely to want adjustment. Toward 0.90
   for a stronger card/depth read, 1.0 to disable the effect entirely.
2. `SCRIM_INCOMING_RATIO` (0.5) — how much clearer the arriving page is than the
   departing one. 1 restores symmetric dimming. See §15.
3. `RUNWAY_PAGE_SCRIM_MAX_OPACITY` (0.55) — depth of the dim.
4. `CHROME_FADE_END_RATIO` (0.45) — lower retires the rail sooner.
5. `SCRIM_MIDPOINT_RATIO` (0.72) — shapes *when* the falloff happens.

None of these were validated on a device; they were reasoned from the references
above. The unit test asserts the *shape* invariants, not the specific values, so
retuning any of them will not fight the tests — except `RUNWAY_PAGE_SCALE_MIN`,
which must stay within (0, 1], and `SCRIM_INCOMING_RATIO`, which must stay within
(0, 1] and below 1 for the asymmetry invariant to hold.

## 14. Amendment (2026-07-28) — the guards protecting all of this were rotten

Wiring the transit work into CI surfaced that **the Runway contract tests had
never been run by CI at all.** Neither `ci.yml`, `phase8-quality-gate.yml`, nor
the `ci:phase8` script referenced them. The §11 physics contract — whose entire
purpose is "do not restore those four paging props" — was enforceable only by
remembering to run it by hand.

Both Runway tests are now steps in `phase8-quality-gate.yml` and in `ci:phase8`.
They run **before** `test:aspect-aware-media`, because a failing step skips
everything after it and that test was red (below).

Repairs to guards that had been failing or silently mis-targeted:

- **`test:aspect-aware-media`** — asserted the pre-2026-07-27 progressive image
  path (start on the card tier, upgrade to detail on activation). That upgrade was
  deliberately removed: swapping tiers changed the ExpoImage `recyclingKey` +
  `cacheKey` and remounted the image on every activation — the per-scroll
  "blink". The assertions now describe detail-first tiering, and
  `hasDetailUpgrade === false` is documented as the anti-blink invariant.
  Degradation cases (preview-only, thumbnail-only, blank display URL, placeholder
  equal to the initial URL) were added, since none were covered.
- **`check:perf-regressions`** — four dead assertions. Three named
  `THREADLY_QUERY_STALE_TIME_MS` / `THREADLY_QUERY_GC_TIME_MS` /
  `THREADLY_SAVED_STATUS_STALE_TIME_MS`, which became `WIEZ_*` at the brand
  rename. The fourth asserted `lastSavedCheckKeyRef` against
  `MarketFeedScreen.tsx` — the deprecated re-export shim — while the ref lives in
  `RunwayFeedScreen.tsx`.
- **`test-latency-phase3-contract`** — read the same `MarketFeedScreen.tsx` shim
  as its `runway` source, so every Runway assertion in it ran against an
  eight-line re-export. It also still expected the 1500ms `'first-media-timeout'`
  fallback that was replaced by the much earlier `'early-warm'` timer.
- **`FeedActionRail.tsx` / `FeedMetaOverlay.tsx`** — deleted. Both were one-line
  shims that re-exported **`RunwayFeedScreen`** under those component names, so
  importing either would silently pull in the entire feed screen. The real
  components are local to `RunwayFeedScreen.tsx` (~403 and ~507). Nothing imported
  them; the responsiveness contract now fails if they reappear.

### Still red — not this change's to fix

A sweep of every script in `scripts/` found eight more failing guards outside the
Runway/media domain. They were not touched, because each needs a decision about
whether the *test* is stale or the *code* is broken, and rewriting expectations
blind would mask real regressions. Several look like they could be genuine bugs
rather than rot:

`test-api-contract` · `test-lifecycle-sync-contract` · `test-market-signal-queue-contract` ·
`test-product-collection-management-contract` (ENOENT: `app/catalog/index.tsx`) ·
`test-push-token-registration-contract` · `test-session-cleanup-contract`
("logout should clear active brand") · `test-upload-validation-contract` (ENOENT:
`app/catalog/edit-profile.tsx`) · `audit-theme-system`.

The dominant pattern in the ones already diagnosed is the same twice over: the
`THREADLY_` → `WIEZ_` rename, and files that moved (`app/catalog/*` →
`app/(tabs)/catalog/*`, `MarketFeedScreen` → `RunwayFeedScreen`). A guard that
reads a moved file throws ENOENT; one that greps a renamed constant fails; one
that runs `assertNotMatches` against a shim **passes silently**, which is the
dangerous direction and is worth auditing for specifically.

## 15. Amendment (2026-07-28) — transit scrim, third pass

Feedback after §13 shipped: measurably better, still not calm enough. Two gaps,
one a straightforward bug in §13's own coverage, the other a missing half of the
brief the research was commissioned to answer.

### a. The carousel dot row never faded

`RunwayFeedItem` fades chrome by wrapping the badge, action rail and meta overlay
in one `Animated.View`. The dot indicator is not in that wrapper — it is rendered
inside `FeedMediaCarousel`, a sibling that sits *below* the chrome layer, because
it depends on the carousel's own `safeActiveIndex`.

Consequence: after §13 made everything else retire by 45% of a page, the dots
became the **most prominent moving element in the transition**. They are white
(`textInverse`) pills with an 18px active state, horizontally centred, and during
a vertical swipe there are two rows of them sliding past each other. Small, high
contrast, high spatial frequency — close to worst case for pulling gaze. They
picked up only the slow scrim, never the fast chrome curve.

Fix: `FeedMediaCarousel` takes an optional `chromeOpacity` prop (the same
interpolation the page already built) and binds it to the dot row. Handing the
curve down rather than nesting the carousel inside the chrome wrapper is
deliberate — wrapping would fade the media along with it. Still native-driven,
still zero JS work per frame.

Both the unit test (Invariant 11) and the responsiveness contract now assert the
prop is plumbed, because this is a silent failure: the dots simply stop fading
and nothing else breaks.

### b. The scrim was symmetric, which is only half the brief

§13 dimmed the outgoing and incoming pages identically. That is calmer than two
undimmed pages, but the original research request was explicitly *"reduce the
visual prominence of the outgoing content **while guiding the user's focus toward
the incoming content**"* — and uniform suppression does only the first half. Two
equally murky pages give the eye no anchor; the transition reads washed out
rather than directed.

Every reference resolves this with hierarchy rather than uniform dimming.
Material's fade-through spends the first ~100ms of 300ms retiring the outgoing
element and the remaining ~200ms plus a scale-in on the incoming one, stating the
reason as not splitting attention. ViewPager2's zoom-out transformer does the
same through alpha.

`SCRIM_INCOMING_RATIO` (0.5) expresses that against scroll offset instead of
elapsed time. `scrollY < offset` means the list has not reached that page yet —
it is below the viewport and being scrolled toward — so that half of the curve is
halved. Midpoint of a downward swipe is now ~0.20 dim on the arriving page
against ~0.40 on the departing one.

**This is still a pure function of scroll offset.** No direction detection, no
velocity, no JS scroll listener — the thing the paging fix removed and must not
come back. The honest cost is that the bias is keyed to position, not gesture, so
scrolling back up favours the page being left rather than the one being
revisited. Accepted deliberately: a vertical feed is consumed overwhelmingly
downward, and the asymmetry is subtle rather than a mode switch.

Scale and chrome stay symmetric. Asymmetric scale would make the seam band uneven
and read as a layout bug; asymmetric chrome would bring the incoming action rail
back on screen mid-swipe, which is the exact thing §13 removed.

### Invariants updated

- Invariant 3 no longer claims the scrim is symmetric, and asserts that exactly
  one builder is exempt so a future curve cannot quietly join it.
- Invariant 4's negative-side clamp now expects the lighter approach peak.
- Invariant 10 (new): the approach side is strictly less dimmed than the
  departure side at every sampled delta, follows `SCRIM_INCOMING_RATIO` exactly,
  and both halves still meet at exactly 0 — so the asymmetry can never produce a
  step at centre and a settled page is untouched regardless of arrival direction.
- Invariant 11 (new): the dot-row plumbing above.

Mutation-checked: setting `SCRIM_INCOMING_RATIO` to 1 fails Invariant 10 at all
six sampled deltas.

### Still not validated on a device

Same caveat as §13 and it has not moved: none of these values has been looked at.
`SCRIM_INCOMING_RATIO` is the new one to judge — if the arriving page now reads
as too bright relative to §13, raise it toward 0.7; 1 is exactly the old
behaviour.
