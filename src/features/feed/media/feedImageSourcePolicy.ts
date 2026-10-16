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

  // CARD (640px) first. THUMB (240px) was tried as the placeholder for speed,
  // but stretched to a full-screen page it reads as the photo losing quality
  // until the detail image lands. With media on the Cloudflare edge the CARD
  // arrives quickly, and it is a stand-in a viewer can actually look at.
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

/**
 * The exact source + cache key `FeedImage` will render for this media.
 *
 * A prefetch is only worth anything if it lands under the key the visible
 * image reads. `FeedImage` passes a custom `cacheKey`, and `ExpoImage.prefetch`
 * cannot take one — it caches under the raw URL — so every prefetched page was
 * downloaded a second time when it scrolled in. Prefetchers resolve through
 * this so the two can never drift apart again.
 */
export function resolveFeedImagePrefetchTarget({
  displayUrl,
  previewUrl,
  thumbnailUrl,
  fileId,
}: FeedImageSourcePolicyInput & { fileId?: string | null }): { src: string | null; cacheKey: string | null } {
  const policy = resolveFeedImageSourcePolicy({ displayUrl, previewUrl, thumbnailUrl });
  const src = policy.initialUrl;
  const normalizedFileId = normalizeUrl(fileId);
  if (!src && !normalizedFileId) return { src: null, cacheKey: null };
  // With a file ID the key ignores the URL, so a file-ID-only row still keys
  // correctly before its URL is resolved.
  const cacheKey = buildFeedImageCacheKey({ fileId: normalizedFileId, url: src ?? '', tier: policy.initialTier });
  return { src, cacheKey };
}
