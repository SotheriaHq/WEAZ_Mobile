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

The feed now has one paging owner: interval snapping.

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
