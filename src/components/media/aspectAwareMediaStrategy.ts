export type ContainerAspectBucket =
  | 'ultra-tall'
  | 'tall'
  | 'standard-tall'
  | 'near-square-portrait'
  | 'square-ish'
  | 'near-square-landscape'
  | 'wide'
  | 'ultra-wide';

export type ImageAspectClass =
  | 'ultra-portrait'
  | 'portrait'
  | 'square'
  | 'landscape'
  | 'ultra-wide'
  | 'unknown';

export type AspectAwareMediaStrategy =
  | 'edge'
  | 'contain-blur'
  | 'letter-blur'
  | 'letter-soft'
  | 'letter-solid';

/**
 * Tolerance for treating `cover` (edge-to-edge) as acceptable.
 *
 * If `cover` would crop away no more than this fraction of the image, we fill the
 * container immersively. Above it, cropping would start eating garment/design
 * detail, so we `contain` the image and add an intentional backdrop instead.
 *
 * Phase 10 rationale: this single threshold — plus the image-shape switch below —
 * is the entire decision matrix. There is deliberately no universal `cover`/`contain`;
 * the choice depends on how the image shape relates to the visible container.
 */
const EDGE_COVER_CROP_TOLERANCE = 0.28;

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Fraction of the image cropped away by a `cover` fit in the given container. */
function coverCropFraction(imageAspect: number, containerAspect: number): number {
  return imageAspect >= containerAspect
    ? 1 - containerAspect / imageAspect // cropped on the left/right
    : 1 - imageAspect / containerAspect; // cropped on the top/bottom
}

export function getContainerAspectBucket(aspect: number): ContainerAspectBucket {
  if (!isPositiveFinite(aspect)) return 'square-ish';
  if (aspect < 0.45) return 'ultra-tall';
  if (aspect < 0.55) return 'tall';
  if (aspect < 0.65) return 'standard-tall';
  if (aspect < 0.85) return 'near-square-portrait';
  if (aspect < 1.15) return 'square-ish';
  if (aspect < 1.5) return 'near-square-landscape';
  if (aspect < 1.9) return 'wide';
  return 'ultra-wide';
}

export function getImageAspectClass(aspect: number | null | undefined): ImageAspectClass {
  if (!isPositiveFinite(aspect)) return 'unknown';
  if (aspect < 0.55) return 'ultra-portrait';
  if (aspect < 0.85) return 'portrait';
  if (aspect < 1.15) return 'square';
  if (aspect < 1.85) return 'landscape';
  return 'ultra-wide';
}

export function resolveMediaStrategy(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAspectRatio?: number | null;
  override?: AspectAwareMediaStrategy | null;
}): AspectAwareMediaStrategy {
  if (params.override) return params.override;

  const hasContainerDimensions =
    isPositiveFinite(params.containerWidth) && isPositiveFinite(params.containerHeight);
  const imageAspect = isPositiveFinite(params.imageAspectRatio)
    ? params.imageAspectRatio
    : isPositiveFinite(params.imageWidth) && isPositiveFinite(params.imageHeight)
      ? params.imageWidth / params.imageHeight
      : null;
  const imageClass = getImageAspectClass(imageAspect);

  // Unknown image dimensions: never crop, never blur. A clean contained matte keeps
  // the first paint stable; once onLoad reports real dimensions, the only change is a
  // foreground rescale inside the same fixed container — no container layout shift,
  // and no heavy blurred-flash regression.
  if (imageClass === 'unknown' || imageAspect === null) {
    return 'letter-solid';
  }

  // Container not measured yet. Portrait media is meant to fill the vertical
  // experience immersively, so default it to edge; wider media gets a clean matte
  // until the container is measured (avoids a blurred flash before first layout).
  if (!hasContainerDimensions) {
    return imageClass === 'ultra-portrait' || imageClass === 'portrait' ? 'edge' : 'letter-solid';
  }

  const containerAspect = params.containerWidth / params.containerHeight;
  const crop = coverCropFraction(imageAspect, containerAspect);

  // Snug fit → immersive edge-to-edge cover (negligible cropping).
  if (crop <= EDGE_COVER_CROP_TOLERANCE) {
    return 'edge';
  }

  // Does not fit snugly. Contain the image (no detail cropping) and pick the backdrop
  // by image shape. This switch is the square-vs-landscape differentiator the rescue
  // requires: square never shares landscape's treatment.
  switch (imageClass) {
    case 'landscape':
    case 'ultra-wide':
      // Wide media in a taller container: image-reflective ambient blur — stronger
      // blur + opacity than square so the two never read as the same treatment.
      return 'letter-blur';
    case 'square':
      // Square media: a SUBTLE same-image ambient fill (lighter blur, lower opacity,
      // no dark wash) over the dominant-color matte. Distinct from landscape's values;
      // the foreground stays sharp and uncropped (contain).
      return 'letter-soft';
    case 'portrait':
    case 'ultra-portrait':
    default:
      // Reaching this switch means a cover fit would crop more than the
      // tolerance allows. Tall media used to force edge-fill anyway in portrait
      // containers, which hid 30%+ of near-square portrait shots (4:5, 3:4)
      // off-screen. Contain instead — no design detail is ever cropped away.
      return 'letter-solid';
  }
}
