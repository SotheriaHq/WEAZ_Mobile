import { Image } from 'react-native';
import { useEffect, useState } from 'react';

import { brandApi, type SignedFileUrlDebugContext } from '@/src/api/BrandApi';

type UseResolvedImageUriArgs = {
  src?: string | null;
  fileId?: string | null;
  enabled?: boolean;
  debugContext?: SignedFileUrlDebugContext;
};

const SIGNED_URI_TTL_MS = 4 * 60 * 1000;
const SIGNED_URI_REFRESH_SKEW_MS = 30 * 1000;
const MISSING_URI_TTL_MS = 2 * 60 * 1000;
const resolvedUriCache = new Map<string, { uri: string; expiresAt: number }>();
const resolvedUriMissingCache = new Map<string, number>();
const pendingResolutions = new Map<string, Promise<string | null>>();

const trim = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isS3LikeUrl = (value: string) => {
  const lower = value.toLowerCase();
  return lower.includes('.s3.') || lower.includes('amazonaws.com');
};

const isPotentialFileId = (value: string) => !isHttpUrl(value) && !/[/?#\\]/.test(value);

const getResolutionCacheKey = (directSrc: string | null, normalizedFileId: string | null) => {
  if (normalizedFileId && directSrc) return `file:${normalizedFileId}|src:${directSrc}`;
  if (normalizedFileId) return `file:${normalizedFileId}`;
  if (directSrc) return `src:${directSrc}`;
  return null;
};

const getCachedUriEntry = (key: string) => {
  const missingCachedUntil = resolvedUriMissingCache.get(key);
  if (missingCachedUntil && missingCachedUntil > Date.now()) {
    return '__missing__';
  }
  if (missingCachedUntil) {
    resolvedUriMissingCache.delete(key);
  }

  const cached = resolvedUriCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  if (cached) {
    resolvedUriCache.delete(key);
  }
  return null;
};

const getCachedUri = (key: string) => {
  const cached = getCachedUriEntry(key);
  if (cached === '__missing__') return cached;
  return cached?.uri ?? null;
};

const setCachedUri = (key: string, uri: string) => {
  resolvedUriMissingCache.delete(key);
  resolvedUriCache.set(key, {
    uri,
    expiresAt: Date.now() + SIGNED_URI_TTL_MS,
  });
};

const setMissingUri = (key: string) => {
  resolvedUriMissingCache.set(key, Date.now() + MISSING_URI_TTL_MS);
};

export const resolveImageUri = async ({
  src,
  fileId,
  forceRefresh = false,
  debugContext,
}: {
  src?: string | null;
  fileId?: string | null;
  forceRefresh?: boolean;
  debugContext?: SignedFileUrlDebugContext;
}) => {
  const directSrc = trim(src);
  const normalizedFileId = trim(fileId);

  if (!directSrc && !normalizedFileId) {
    return null;
  }

  if (directSrc && isHttpUrl(directSrc) && !isS3LikeUrl(directSrc)) {
    return directSrc;
  }

  const cacheKey = getResolutionCacheKey(directSrc, normalizedFileId);
  if (!cacheKey) {
    return null;
  }
  if (forceRefresh) {
    resolvedUriCache.delete(cacheKey);
    resolvedUriMissingCache.delete(cacheKey);
  }
  const cached = getCachedUri(cacheKey);
  if (cached === '__missing__') {
    return null;
  }
  if (cached) {
    return cached;
  }

  const pending = pendingResolutions.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      if (normalizedFileId && isPotentialFileId(normalizedFileId)) {
        const signed = await brandApi.getSignedFileUrl(normalizedFileId, {
          ...debugContext,
          fileId: debugContext?.fileId ?? normalizedFileId,
        });
        if (signed) {
          setCachedUri(cacheKey, signed);
          return signed;
        }
      }

      if (directSrc) {
        if (isHttpUrl(directSrc)) {
          setCachedUri(cacheKey, directSrc);
        }
        return directSrc;
      }

      setMissingUri(cacheKey);
      return null;
    } catch {
      setMissingUri(cacheKey);
      return null;
    } finally {
      pendingResolutions.delete(cacheKey);
    }
  })();

  pendingResolutions.set(cacheKey, promise);
  return promise;
};

export const prefetchResolvedImageAsset = async ({
  src,
  fileId,
  debugContext,
}: UseResolvedImageUriArgs) => {
  const uri = await resolveImageUri({ src, fileId, debugContext });
  if (!uri) {
    return false;
  }

  try {
    return await Image.prefetch(uri);
  } catch {
    return false;
  }
};

export function useResolvedImageUri({
  src,
  fileId,
  enabled = true,
  debugContext,
}: UseResolvedImageUriArgs) {
  const directSrc = trim(src);
  const normalizedFileId = trim(fileId);
  const cacheKey = getResolutionCacheKey(directSrc, normalizedFileId);
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (directSrc && isHttpUrl(directSrc) && !isS3LikeUrl(directSrc)) {
      return directSrc;
    }
    const cached = cacheKey ? getCachedUri(cacheKey) : null;
    return cached === '__missing__' ? null : cached;
  });
  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      return () => {
        mounted = false;
      };
    }

    if (!directSrc && !normalizedFileId) {
      setResolvedUri(null);
      return () => {
        mounted = false;
      };
    }

    if (directSrc && isHttpUrl(directSrc) && !isS3LikeUrl(directSrc)) {
      setResolvedUri(directSrc);
      return () => {
        mounted = false;
      };
    }

    void resolveImageUri({ src: directSrc, fileId: normalizedFileId, debugContext }).then((nextUri) => {
      if (mounted) {
        setResolvedUri((current) => nextUri ?? current);
      }
    });

    return () => {
      mounted = false;
    };
  }, [debugContext, directSrc, enabled, normalizedFileId]);

  useEffect(() => {
    if (!enabled || !cacheKey || !resolvedUri) return;
    if (directSrc && isHttpUrl(directSrc) && !isS3LikeUrl(directSrc) && !normalizedFileId) return;

    const cached = getCachedUriEntry(cacheKey);
    if (!cached || cached === '__missing__') return;

    const delay = Math.max(1_000, cached.expiresAt - Date.now() - SIGNED_URI_REFRESH_SKEW_MS);
    const timeout = setTimeout(() => {
      void resolveImageUri({ src: directSrc, fileId: normalizedFileId, forceRefresh: true, debugContext }).then((nextUri) => {
        setResolvedUri((current) => nextUri ?? current);
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [cacheKey, debugContext, directSrc, enabled, normalizedFileId, resolvedUri]);

  return resolvedUri;
}

export function useResolvedImageAsset(args: UseResolvedImageUriArgs) {
  const uri = useResolvedImageUri(args);
  const directSrc = trim(args.src);
  const normalizedFileId = trim(args.fileId);
  const enabled = args.enabled ?? true;

  const [loading, setLoading] = useState<boolean>(() => {
    if (!enabled) return false;
    if (!directSrc && !normalizedFileId) return false;
    if (directSrc && isHttpUrl(directSrc) && !isS3LikeUrl(directSrc)) return false;
    return uri == null;
  });

  useEffect(() => {
    if (!enabled || (!directSrc && !normalizedFileId)) {
      setLoading(false);
      return;
    }

    if (directSrc && isHttpUrl(directSrc) && !isS3LikeUrl(directSrc)) {
      setLoading(false);
      return;
    }

    if (uri) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    void resolveImageUri({
      src: directSrc,
      fileId: normalizedFileId,
      debugContext: args.debugContext,
    }).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [args.debugContext, directSrc, enabled, normalizedFileId, uri]);

  return {
    uri,
    loading,
  };
}
