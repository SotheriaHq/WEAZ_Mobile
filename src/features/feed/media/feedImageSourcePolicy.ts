export type FeedImageSourceTier = 'thumbnail' | 'preview' | 'detail';

type FeedImageSourcePolicyInput = {
  displayUrl?: string | null;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type FeedImageSourcePolicy = {
  initialUrl: string | null;
  initialTier: FeedImageSourceTier;
  detailUrl: string | null;
  placeholderUrl: string | null;
  hasDetailUpgrade: boolean;
};

const normalizeUrl = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
};

export function resolveFeedImageSourcePolicy({
  displayUrl,
  previewUrl,
  thumbnailUrl,
}: FeedImageSourcePolicyInput): FeedImageSourcePolicy {
  const detail = normalizeUrl(displayUrl);
  const preview = normalizeUrl(previewUrl);
  const thumbnail = normalizeUrl(thumbnailUrl);

  // Detail-first: render the full display image from the start so a page never
  // swaps tiers (preview -> detail) after it becomes active. That swap changed
  // the ExpoImage recyclingKey + cacheKey and remounted the image on every
  // activation — the per-scroll "blink". A low-res preview/thumbnail still
  // rides along as the placeholder so the decode gap shows a soft image, never
  // a black frame. Neighbors are prefetched at the display tier, so a settled
  // page usually paints the sharp image instantly.
  const initialUrl = detail ?? preview ?? thumbnail;
  const initialTier: FeedImageSourceTier = detail ? 'detail' : preview ? 'preview' : 'thumbnail';
  const detailUrl = initialUrl;

  const placeholderUrl =
    preview && preview !== initialUrl
      ? preview
      : thumbnail && thumbnail !== initialUrl
        ? thumbnail
        : null;

  return {
    initialUrl,
    initialTier,
    detailUrl,
    placeholderUrl,
    // No per-activation upgrade: we already start at the best available tier.
    hasDetailUpgrade: false,
  };
}

export function buildFeedImageCacheKey({
  fileId,
  url,
  tier,
}: {
  fileId?: string | null;
  url: string;
  tier: FeedImageSourceTier;
}) {
  const normalizedFileId = typeof fileId === 'string' ? fileId.trim() : '';
  if (normalizedFileId) return `runway:${normalizedFileId}:${tier}`;

  try {
    const parsed = new URL(url);
    return `runway:${tier}:${parsed.origin}${parsed.pathname}`;
  } catch {
    return `runway:${tier}:${url}`;
  }
}
