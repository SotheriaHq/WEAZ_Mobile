import { Image } from 'react-native';
import { useEffect, useRef, useState } from 'react';

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

const isLoopbackHttpUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  } catch {
    return false;
  }
};

const isSafeDirectHttpUrl = (value: string) => isHttpUrl(value) && !isS3LikeUrl(value) && !isLoopbackHttpUrl(value);

const isPotentialFileId = (value: string) => !isHttpUrl(value) && !/[/?#\\]/.test(value);

const getResolutionCacheKey = (directSrc: string | null, normalizedFileId: string | null) => {
  if (normalizedFileId && directSrc) return `file:${normalizedFileId}|src:${directSrc}`;
  if (normalizedFileId) return `file:${normalizedFileId}`;
  if (directSrc) return `src:${directSrc}`;
  return null;
};

const parseCompactAmzDate = (value: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isFinite(timestamp) ? timestamp : null;
};

const getSignedUriExpiresAt = (uri: string) => {
  try {
    const parsed = new URL(uri);
    const explicitExpiresAt = parsed.searchParams.get('expiresAt') ?? parsed.searchParams.get('ExpiresAt');
    if (explicitExpiresAt) {
      const timestamp = Date.parse(explicitExpiresAt);
      if (Number.isFinite(timestamp)) return timestamp;
    }

    const unixExpires = parsed.searchParams.get('Expires') ?? parsed.searchParams.get('expires');
    if (unixExpires) {
      const timestamp = Number(unixExpires) * 1000;
      if (Number.isFinite(timestamp)) return timestamp;
    }

    const amzDate = parsed.searchParams.get('X-Amz-Date');
    const amzExpires = Number(parsed.searchParams.get('X-Amz-Expires'));
    const amzStartedAt = amzDate ? parseCompactAmzDate(amzDate) : null;
    if (amzStartedAt && Number.isFinite(amzExpires)) {
      return amzStartedAt + amzExpires * 1000;
    }
  } catch {
    return null;
  }

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
  const expiresAt = getSignedUriExpiresAt(uri) ?? Date.now() + SIGNED_URI_TTL_MS;
  resolvedUriMissingCache.delete(key);
  resolvedUriCache.set(key, {
    uri,
    expiresAt,
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

  if (directSrc && isSafeDirectHttpUrl(directSrc)) {
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

      if (directSrc && isSafeDirectHttpUrl(directSrc)) {
        setCachedUri(cacheKey, directSrc);
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
  if (!uri || !isHttpUrl(uri)) {
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
  const activeKey = cacheKey ?? (directSrc ? `direct:${directSrc}` : null);
  const previousKeyRef = useRef<string | null>(activeKey);
  const resolvedKeyRef = useRef<string | null>(null);
  const lastSuccessfulRef = useRef<{ key: string; uri: string } | null>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (directSrc && isSafeDirectHttpUrl(directSrc)) {
      const key = `direct:${directSrc}`;
      resolvedKeyRef.current = key;
      lastSuccessfulRef.current = { key, uri: directSrc };
      return directSrc;
    }
    const cachedKey = cacheKey;
    const cached = cachedKey ? getCachedUri(cachedKey) : null;
    if (cachedKey && cached && cached !== '__missing__') {
      resolvedKeyRef.current = cachedKey;
      lastSuccessfulRef.current = { key: cachedKey, uri: cached };
      return cached;
    }
    return null;
  });

  useEffect(() => {
    if (activeKey === previousKeyRef.current) return;
    previousKeyRef.current = activeKey;

    if (!activeKey) {
      resolvedKeyRef.current = null;
      lastSuccessfulRef.current = null;
      setResolvedUri(null);
      return;
    }

    if (directSrc && isSafeDirectHttpUrl(directSrc)) {
      resolvedKeyRef.current = activeKey;
      lastSuccessfulRef.current = { key: activeKey, uri: directSrc };
      setResolvedUri(directSrc);
      return;
    }

    const cached = cacheKey ? getCachedUri(cacheKey) : null;
    if (cached && cached !== '__missing__') {
      resolvedKeyRef.current = activeKey;
      lastSuccessfulRef.current = { key: activeKey, uri: cached };
      setResolvedUri(cached);
    }
  }, [activeKey, cacheKey, directSrc]);

  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      return () => {
        mounted = false;
      };
    }

    if (!directSrc && !normalizedFileId) {
      resolvedKeyRef.current = null;
      lastSuccessfulRef.current = null;
      setResolvedUri(null);
      return () => {
        mounted = false;
      };
    }

    if (directSrc && isSafeDirectHttpUrl(directSrc)) {
      resolvedKeyRef.current = activeKey ?? `direct:${directSrc}`;
      lastSuccessfulRef.current = { key: activeKey ?? `direct:${directSrc}`, uri: directSrc };
      setResolvedUri(directSrc);
      return () => {
        mounted = false;
      };
    }

    void resolveImageUri({ src: directSrc, fileId: normalizedFileId, debugContext }).then((nextUri) => {
      if (mounted) {
        if (nextUri) {
          if (activeKey) {
            resolvedKeyRef.current = activeKey;
            lastSuccessfulRef.current = { key: activeKey, uri: nextUri };
          }
          setResolvedUri(nextUri);
          return;
        }

        setResolvedUri((current) => {
          if (current && resolvedKeyRef.current === activeKey) return current;
          const lastSuccessful = lastSuccessfulRef.current;
          return lastSuccessful?.key === activeKey ? lastSuccessful.uri : null;
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeKey, debugContext, directSrc, enabled, normalizedFileId]);

  useEffect(() => {
    if (!enabled || !cacheKey || !resolvedUri) return;
    if (directSrc && isSafeDirectHttpUrl(directSrc) && !normalizedFileId) return;

    const cached = getCachedUriEntry(cacheKey);
    if (!cached || cached === '__missing__') return;

    const delay = Math.max(1_000, cached.expiresAt - Date.now() - SIGNED_URI_REFRESH_SKEW_MS);
    const timeout = setTimeout(() => {
      void resolveImageUri({ src: directSrc, fileId: normalizedFileId, forceRefresh: true, debugContext }).then((nextUri) => {
        if (nextUri) {
          if (activeKey) {
            resolvedKeyRef.current = activeKey;
            lastSuccessfulRef.current = { key: activeKey, uri: nextUri };
          }
          setResolvedUri(nextUri);
          return;
        }

        setResolvedUri((current) => {
          if (current && resolvedKeyRef.current === activeKey) return current;
          return lastSuccessfulRef.current?.key === activeKey ? lastSuccessfulRef.current.uri : null;
        });
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [activeKey, cacheKey, debugContext, directSrc, enabled, normalizedFileId, resolvedUri]);

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
    if (directSrc && isSafeDirectHttpUrl(directSrc)) return false;
    return uri == null;
  });

  useEffect(() => {
    if (!enabled || (!directSrc && !normalizedFileId)) {
      setLoading(false);
      return;
    }

    if (directSrc && isSafeDirectHttpUrl(directSrc)) {
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
