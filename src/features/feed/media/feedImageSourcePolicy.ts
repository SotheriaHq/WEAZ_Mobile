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
  const initialUrl = preview ?? thumbnail ?? detail;
  const initialTier: FeedImageSourceTier = preview ? 'preview' : thumbnail ? 'thumbnail' : 'detail';
  const detailUrl = detail ?? initialUrl;

  return {
    initialUrl,
    initialTier,
    detailUrl,
    placeholderUrl: thumbnail && thumbnail !== initialUrl ? thumbnail : null,
    hasDetailUpgrade: Boolean(detailUrl && initialUrl && detailUrl !== initialUrl),
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
