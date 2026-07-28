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
