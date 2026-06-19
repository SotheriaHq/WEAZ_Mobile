import {
  getImageAspectClass,
  type AspectAwareMediaStrategy,
  type ImageAspectClass,
} from '@/src/components/media/aspectAwareMediaStrategy';

export const RUNWAY_SAFE_COVER_CROP_TOLERANCE = 0.12;

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

  const hasViewport = isPositiveFinite(viewportWidth) && isPositiveFinite(viewportHeight);
  if (!hasViewport) {
    return {
      strategy: imageClass === 'landscape' || imageClass === 'ultra-wide' ? 'letter-blur' : 'letter-soft',
      imageAspectRatio: resolvedAspect,
      imageClass,
      coverCropFraction: null,
    };
  }

  const crop = getCoverCropFraction(resolvedAspect, viewportWidth / viewportHeight);
  if (crop <= RUNWAY_SAFE_COVER_CROP_TOLERANCE) {
    return {
      strategy: 'edge',
      imageAspectRatio: resolvedAspect,
      imageClass,
      coverCropFraction: crop,
    };
  }

  return {
    strategy: imageClass === 'landscape' || imageClass === 'ultra-wide' ? 'letter-blur' : 'letter-soft',
    imageAspectRatio: resolvedAspect,
    imageClass,
    coverCropFraction: crop,
  };
}
