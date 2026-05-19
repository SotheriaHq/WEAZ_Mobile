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

const STRATEGY_MATRIX: Record<
  Exclude<ImageAspectClass, 'unknown'>,
  Record<ContainerAspectBucket, AspectAwareMediaStrategy>
> = {
  'ultra-portrait': {
    'ultra-tall': 'edge',
    tall: 'edge',
    'standard-tall': 'contain-blur',
    'near-square-portrait': 'contain-blur',
    'square-ish': 'contain-blur',
    'near-square-landscape': 'contain-blur',
    wide: 'contain-blur',
    'ultra-wide': 'contain-blur',
  },
  portrait: {
    'ultra-tall': 'edge',
    tall: 'edge',
    'standard-tall': 'edge',
    'near-square-portrait': 'contain-blur',
    'square-ish': 'contain-blur',
    'near-square-landscape': 'contain-blur',
    wide: 'contain-blur',
    'ultra-wide': 'contain-blur',
  },
  square: {
    'ultra-tall': 'letter-soft',
    tall: 'letter-soft',
    'standard-tall': 'contain-blur',
    'near-square-portrait': 'edge',
    'square-ish': 'edge',
    'near-square-landscape': 'contain-blur',
    wide: 'contain-blur',
    'ultra-wide': 'contain-blur',
  },
  landscape: {
    'ultra-tall': 'letter-solid',
    tall: 'letter-solid',
    'standard-tall': 'letter-solid',
    'near-square-portrait': 'letter-blur',
    'square-ish': 'letter-blur',
    'near-square-landscape': 'edge',
    wide: 'edge',
    'ultra-wide': 'contain-blur',
  },
  'ultra-wide': {
    'ultra-tall': 'letter-solid',
    tall: 'letter-solid',
    'standard-tall': 'letter-solid',
    'near-square-portrait': 'letter-solid',
    'square-ish': 'letter-blur',
    'near-square-landscape': 'letter-blur',
    wide: 'letter-blur',
    'ultra-wide': 'edge',
  },
};

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

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

  const hasContainerDimensions = isPositiveFinite(params.containerWidth) && isPositiveFinite(params.containerHeight);
  const imageAspect = isPositiveFinite(params.imageAspectRatio)
    ? params.imageAspectRatio
    : isPositiveFinite(params.imageWidth) && isPositiveFinite(params.imageHeight)
      ? params.imageWidth / params.imageHeight
      : null;
  const imageClass = getImageAspectClass(imageAspect);

  if (imageClass === 'unknown') {
    return hasContainerDimensions ? 'contain-blur' : 'edge';
  }

  if (!hasContainerDimensions) {
    return 'edge';
  }

  const containerBucket = getContainerAspectBucket(params.containerWidth / params.containerHeight);
  return STRATEGY_MATRIX[imageClass][containerBucket];
}
