import {
  getImageAspectClass,
  type AspectAwareMediaStrategy,
  type ImageAspectClass,
} from '@/src/components/media/aspectAwareMediaStrategy';

export const RUNWAY_SAFE_COVER_CROP_TOLERANCE = 0.12;
// Portrait media may stretch the tolerance a little further to stay immersive
// (9:16 stills on 20:9 phones crop ~18–20%), but near-square portrait shots
// (4:5, 3:4) must never cover-fill: beyond this cap they contain uncropped so
// no part of the design hides off-screen.
export const RUNWAY_PORTRAIT_EDGE_MAX_CROP = 0.2;

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

  // Full-view-first runway policy: vertical media fills the phone screen
  // edge-to-edge; anything that cannot cover snugly is contained UNCROPPED on
  // the deep-black runway matte. Blur/soft ambient backdrops are banned here —
  // the blurred copy painted a frame after the foreground and read as a
  // double-render flash, and pale mattes read as white padding around content.
  const isPortrait = imageClass === 'portrait' || imageClass === 'ultra-portrait';
  const hasViewport = isPositiveFinite(viewportWidth) && isPositiveFinite(viewportHeight);
  if (!hasViewport) {
    return {
      strategy: isPortrait ? 'edge' : 'letter-solid',
      imageAspectRatio: resolvedAspect,
      imageClass,
      coverCropFraction: null,
    };
  }

  const viewportAspect = viewportWidth / viewportHeight;
  const crop = getCoverCropFraction(resolvedAspect, viewportAspect);
  if (
    crop <= RUNWAY_SAFE_COVER_CROP_TOLERANCE ||
    (isPortrait && viewportAspect < 1 && crop <= RUNWAY_PORTRAIT_EDGE_MAX_CROP)
  ) {
    return {
      strategy: 'edge',
      imageAspectRatio: resolvedAspect,
      imageClass,
      coverCropFraction: crop,
    };
  }

  return {
    strategy: 'letter-solid',
    imageAspectRatio: resolvedAspect,
    imageClass,
    coverCropFraction: crop,
  };
}
