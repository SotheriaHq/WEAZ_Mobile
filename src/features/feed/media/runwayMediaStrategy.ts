import {
  getImageAspectClass,
  type AspectAwareMediaStrategy,
  type ImageAspectClass,
} from '@/src/components/media/aspectAwareMediaStrategy';

/**
 * RUNWAY FIT POLICY — the single rule shared by native and mobile web.
 *
 * The web twin lives at `fthreadly/src/components/runway/runwayMediaFit.ts` and
 * MUST stay numerically identical. They are separate git repos, so the duplicate
 * is deliberate; change both or the two surfaces drift apart again (they did:
 * web used a viewport-blind `aspect >= 1.05 ? contain : cover`, native used a
 * crop-percentage cap, and the same 3:4 photo rendered full-bleed on a phone
 * browser and letterboxed in the app).
 *
 * The rule is stated in terms of IMAGE SHAPE, not crop percentage, because that
 * is how the decision was specified:
 *
 *   • Tall/vertical shots (9:16, 2:3)      → FILL the screen edge to edge.
 *   • Square-favouring (3:4, 4:5, 1:1)     → CONTAIN on the matte. Never
 *   • Landscape / wide                       stretched, never cropped — the
 *                                            whole design stays viewable.
 *
 * Why shape and not "how much would cover crop?": a percentage cap puts a cliff
 * in the middle of the common phone-photo range. On a 411x937 viewport the old
 * 0.20 cap made 0.5235 fill and 0.5625 letterbox — two shots a viewer reads as
 * identical, treated oppositely, which is what "inconsistent rendering" meant.
 * A shape threshold has no such cliff: everything one side of it fills.
 */

/**
 * The fill/contain boundary. Below this the image is "tall" and fills; at or
 * above it the image "favours square" and is contained on the matte.
 *
 * 0.72 sits between 2:3 (0.667 → fills) and 3:4 (0.75 → contained). 4:5 (0.8)
 * and 1:1 are contained, which is the intent: those are the Instagram-shaped
 * crops the owner named as the ones that must be padded rather than cut.
 *
 * THIS IS THE TUNING KNOB. Raising it to 0.78 flips 3:4 to full-bleed at the
 * cost of hiding ~41% of such a shot on a 20:9 phone; lowering it toward 0.6
 * pads more. Nothing else in the policy needs to move.
 */
export const RUNWAY_FILL_MAX_ASPECT = 0.72;

/**
 * Any shape may fill when cover would crop essentially nothing — this is what
 * lets a landscape image go edge to edge on a landscape viewport (tablet,
 * rotated device) instead of being pointlessly padded on a screen it fits.
 */
export const RUNWAY_SAFE_COVER_CROP_TOLERANCE = 0.12;

/**
 * Backstop for pathological geometry: a "tall" image on a viewport that is even
 * taller (short/landscape windows, split screen) can still lose most of itself
 * to a cover fit. Past this, contain wins regardless of shape. On a normal
 * phone (viewport aspect ~0.44) nothing below RUNWAY_FILL_MAX_ASPECT reaches
 * it — 0.5 crops 12%, 0.667 crops 34% — so this never fires in the common case.
 */
export const RUNWAY_MAX_FILL_CROP = 0.45;

type RunwayMediaStrategyInput = {
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAspectRatio?: number | null;
};

export type RunwayMediaStrategyResult = {
  strategy: AspectAwareMediaStrategy;
  imageAspectRatio: number | null;
  imageClass: ImageAspectClass;
  coverCropFraction: number | null;
};

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function getCoverCropFraction(imageAspect: number, viewportAspect: number): number {
  if (!isPositiveFinite(imageAspect) || !isPositiveFinite(viewportAspect)) return 1;
  return imageAspect >= viewportAspect
    ? 1 - viewportAspect / imageAspect
    : 1 - imageAspect / viewportAspect;
}

/** Shape-only half of the policy — the part that needs no viewport and so can
 *  be applied identically before first layout and by the web twin. */
export function shouldRunwayMediaFill(aspect: number | null | undefined): boolean {
  return isPositiveFinite(aspect) && aspect < RUNWAY_FILL_MAX_ASPECT;
}

export function resolveRunwayMediaStrategy({
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  imageAspectRatio,
}: RunwayMediaStrategyInput): RunwayMediaStrategyResult {
  const resolvedAspect = isPositiveFinite(imageAspectRatio)
    ? imageAspectRatio
    : isPositiveFinite(imageWidth) && isPositiveFinite(imageHeight)
      ? imageWidth / imageHeight
      : null;
  const imageClass = getImageAspectClass(resolvedAspect);

  if (resolvedAspect === null || imageClass === 'unknown') {
    return {
      strategy: 'letter-solid',
      imageAspectRatio: null,
      imageClass: 'unknown',
      coverCropFraction: null,
    };
  }

  // Blur/soft ambient backdrops are banned on the runway: the blurred copy
  // painted a frame after the foreground and read as a double-render flash, and
  // pale mattes read as white padding around content. Contained media always
  // sits on the deep-black matte.
  const fillsByShape = shouldRunwayMediaFill(resolvedAspect);
  const hasViewport = isPositiveFinite(viewportWidth) && isPositiveFinite(viewportHeight);

  if (!hasViewport) {
    // Pre-layout: commit to the shape decision now so the first paint matches
    // the settled one. Changing fit after measurement is a visible re-fit.
    return {
      strategy: fillsByShape ? 'edge' : 'letter-solid',
      imageAspectRatio: resolvedAspect,
      imageClass,
      coverCropFraction: null,
    };
  }

  const viewportAspect = viewportWidth / viewportHeight;
  const crop = getCoverCropFraction(resolvedAspect, viewportAspect);
  const fills =
    crop <= RUNWAY_SAFE_COVER_CROP_TOLERANCE || (fillsByShape && crop <= RUNWAY_MAX_FILL_CROP);

  return {
    strategy: fills ? 'edge' : 'letter-solid',
    imageAspectRatio: resolvedAspect,
    imageClass,
    coverCropFraction: crop,
  };
}
