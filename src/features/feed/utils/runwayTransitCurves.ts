/**
 * Scroll-linked curves for the Runway vertical feed's page transition.
 *
 * This module is deliberately free of React and React Native imports so the
 * geometry can be unit-tested directly (`scripts/test-runway-transit-curves.js`)
 * instead of being asserted as source text. The component layer does nothing but
 * hand these ranges to `Animated.Value.interpolate`.
 *
 * ## Why these curves exist
 *
 * The feed pages full-bleed media. Before this, nothing was keyed to scroll
 * position at all — `activePageIndex` only moves at momentum end — so mid-swipe
 * the viewport held two full-bleed photographs *and* two action rails, all at
 * full luminance with a hard seam between them. That was reported as eye strain:
 * "everything is just really vivid as they're transitioning, so it feels like
 * your eyes are seeing so many things at the same time."
 *
 * ## Shared invariants (locked by the unit test)
 *
 * - Every curve is a **pure function of scroll offset**. Nothing here detects
 *   direction, tracks velocity or reads previous state, so a loop teleport or a
 *   programmatic `scrollToOffset` produces exactly the same output as a drag.
 *   (Scale and chrome are additionally symmetric about centre; the scrim is
 *   deliberately not — see `SCRIM_INCOMING_RATIO`.)
 * - Every curve reads its **rest value** exactly at centre (scrim 0, scale 1,
 *   chrome 1), so an idle feed is pixel-identical to a feed with none of this.
 *   This is the invariant that makes the whole feature safe to ship blind.
 * - Every curve **clamps** past one page of travel in either direction.
 * - `inputRange` is always strictly increasing, including at degenerate page
 *   heights — `Animated.interpolate` throws otherwise.
 */

/** Scrim opacity once a page sits a full viewport away from centre. */
export const RUNWAY_PAGE_SCRIM_MAX_OPACITY = 0.55;

/**
 * Scrim at the halfway point, as a fraction of the peak. Deliberately more than
 * half: the midpoint is exactly where the eye is asked to parse two pages at
 * once, so the outgoing page has to recede *early* rather than on a linear ramp
 * that only dims it once it is already mostly gone.
 *
 * This front-loading is the scroll-linked form of Material's "fade through"
 * rule, where the outgoing element is gone in the first ~100ms of a 300ms
 * transition and the long tail belongs to the incoming element — stated reason
 * being to stop attention from being split between the two.
 */
export const SCRIM_MIDPOINT_RATIO = 0.72;

/**
 * How much of the scrim a page carries while it is *approaching* from below,
 * relative to what the same page carries once it has been left behind above.
 *
 * The first version of this treatment was fully symmetric: mid-swipe both pages
 * sat at the same 0.396 dim. That is calmer than two undimmed pages, but it is
 * only half the brief. Dimming both equally leaves the eye with two equally
 * murky candidates and no hint which one to settle on — the transition reads as
 * washed out rather than directed.
 *
 * Every reference implementation resolves this with *hierarchy*, not uniform
 * suppression: Material's fade-through gives the outgoing element the first
 * ~100ms and the incoming element the remaining ~200ms plus the scale-in,
 * explicitly so attention is not split between them. ViewPager2's zoom-out
 * transformer does the same via alpha.
 *
 * This is that rule expressed against scroll offset instead of elapsed time.
 * `scrollY < offset` means the list has not reached this page yet — it is still
 * below the viewport, i.e. the page being scrolled *toward* — so that half of
 * the curve is scaled down and the page arrives noticeably clearer than the one
 * being left behind. At the midpoint of a downward swipe that is roughly 0.20
 * against 0.40: a 2x luminance advantage, which is a focal target rather than a
 * brightness jump.
 *
 * The trade-off, stated plainly: this is keyed to offset, not gesture
 * direction, so it favours the page below the viewport in *both* directions.
 * Scrolling back up therefore favours the page being left rather than the one
 * being revisited. That is accepted deliberately — a vertical feed is consumed
 * overwhelmingly downward, and the alternative (real direction detection) means
 * a JS scroll listener, which is exactly what the paging fix removed.
 *
 * Set to 1 to restore the symmetric behaviour.
 */
export const SCRIM_INCOMING_RATIO = 0.5;

/**
 * Scale of a page a full viewport from centre.
 *
 * ViewPager2's stock zoom-out transformer — Android's own reference answer for
 * paged content — pairs MIN_ALPHA 0.5 with MIN_SCALE 0.85. The alpha
 * independently corroborates the scrim above. The scale does not carry over:
 * 0.85 is tuned for a card pager, and on a full-bleed page it opens a ~60px
 * matte band at the seam that reads as a layout bug.
 *
 * 0.94 is enough for the one job that matters here — **breaking the hard seam**.
 * Without it the outgoing and incoming photographs abut edge-to-edge and read as
 * one continuous surface, with no boundary telling the eye where one piece of
 * content ends.
 *
 * Set to 1 to disable. This is also the value suppressed under Reduce Motion,
 * since scale is the only one of the three curves that is actually *motion*;
 * the scrim and chrome fades are cross-fades, which is what Reduce Motion
 * prefers as a substitute for movement rather than something it wants removed.
 */
export const RUNWAY_PAGE_SCALE_MIN = 0.94;

/**
 * Fraction of a page's travel over which its chrome (action rail, meta card,
 * new-drop badge) fades out completely. Much shorter than the scrim's full page.
 *
 * Two-speed on purpose. Icons and numeric counts hold foveal attention far
 * harder than imagery does, and mid-swipe there are *two* action rails at the
 * same screen edge sliding past each other at different heights. Retiring the
 * chrome by the time the pages are halfway means the busiest instant of the
 * transition is two softened photographs and nothing else competing for gaze.
 */
export const CHROME_FADE_END_RATIO = 0.45;

/** Smallest page height the curves will build against. */
const MIN_PAGE_HEIGHT = 1;

export type TransitCurve = {
  inputRange: number[];
  outputRange: number[];
};

/**
 * The screen clamps `pageHeight` to >= 1 before it ever reaches a row, but this
 * module does not rely on that. A zero or negative height would collapse
 * `inputRange` to repeated values and make `Animated.interpolate` throw, which
 * is a crash rather than a visual glitch — so it is guarded here too.
 */
function normalisePageHeight(pageHeight: number): number {
  return Number.isFinite(pageHeight) && pageHeight > MIN_PAGE_HEIGHT ? pageHeight : MIN_PAGE_HEIGHT;
}

function pageOffsetFor(pageIndex: number, pageHeight: number): number {
  // Row k always starts at k * pageHeight — `getItemLayout` and every
  // `scrollToOffset` in the screen agree on that — so this needs no measurement
  // of its own and stays correct while the list is recycling rows.
  const safeIndex = Number.isFinite(pageIndex) ? pageIndex : 0;
  return safeIndex * pageHeight;
}

/**
 * Scrim opacity: 0 at centre, front-loaded, and lighter on the approach side
 * than on the departure side so the incoming page wins the mid-swipe contrast.
 */
export function buildScrimCurve(pageIndex: number, pageHeight: number): TransitCurve {
  const height = normalisePageHeight(pageHeight);
  const offset = pageOffsetFor(pageIndex, height);
  const half = height / 2;
  // Departure side (scrollY > offset): the page has been left above.
  const leavingPeak = RUNWAY_PAGE_SCRIM_MAX_OPACITY;
  const leavingMid = leavingPeak * SCRIM_MIDPOINT_RATIO;
  // Approach side (scrollY < offset): the page is still below, coming up.
  const arrivingPeak = leavingPeak * SCRIM_INCOMING_RATIO;
  const arrivingMid = leavingMid * SCRIM_INCOMING_RATIO;
  return {
    inputRange: [offset - height, offset - half, offset, offset + half, offset + height],
    outputRange: [arrivingPeak, arrivingMid, 0, leavingMid, leavingPeak],
  };
}

/**
 * Page scale: 1 at centre, `RUNWAY_PAGE_SCALE_MIN` a full page out.
 *
 * `enabled: false` returns a flat curve rather than `null` so the caller keeps a
 * single unconditional code path — no conditional hooks, and no branch that
 * could accidentally leave a stale transform applied when Reduce Motion flips
 * on mid-session.
 */
export function buildScaleCurve(pageIndex: number, pageHeight: number, enabled: boolean): TransitCurve {
  const height = normalisePageHeight(pageHeight);
  const offset = pageOffsetFor(pageIndex, height);
  const min = enabled ? RUNWAY_PAGE_SCALE_MIN : 1;
  return {
    inputRange: [offset - height, offset, offset + height],
    outputRange: [min, 1, min],
  };
}

/** Chrome opacity: 1 at centre, 0 by `CHROME_FADE_END_RATIO` of a page out. */
export function buildChromeCurve(pageIndex: number, pageHeight: number): TransitCurve {
  const height = normalisePageHeight(pageHeight);
  const offset = pageOffsetFor(pageIndex, height);
  // Guard the ratio as well as the height: a mis-tuned 0 would collapse the
  // range to [offset, offset, offset] and throw.
  const end = Math.max(MIN_PAGE_HEIGHT / 2, height * CHROME_FADE_END_RATIO);
  return {
    inputRange: [offset - end, offset, offset + end],
    outputRange: [0, 1, 0],
  };
}

/**
 * Clamped piecewise-linear evaluation, matching `Animated.interpolate` with
 * `extrapolate: 'clamp'`.
 *
 * Exported so the unit test can assert what a curve actually *outputs* at a
 * given scroll offset rather than that the source contains a particular string.
 * The component never calls this — the native driver does the equivalent work
 * off the JS thread.
 */
export function evaluateCurve(curve: TransitCurve, scrollOffset: number): number {
  const { inputRange, outputRange } = curve;
  if (scrollOffset <= inputRange[0]) return outputRange[0];
  const last = inputRange.length - 1;
  if (scrollOffset >= inputRange[last]) return outputRange[last];

  for (let i = 1; i <= last; i += 1) {
    if (scrollOffset > inputRange[i]) continue;
    const spanStart = inputRange[i - 1];
    const spanEnd = inputRange[i];
    const progress = (scrollOffset - spanStart) / (spanEnd - spanStart);
    return outputRange[i - 1] + progress * (outputRange[i] - outputRange[i - 1]);
  }
  return outputRange[last];
}
