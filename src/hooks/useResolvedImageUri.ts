import { Image as ExpoImage } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { brandApi, type SignedFileUrlDebugContext } from '@/src/api/BrandApi';
import { mediaDevLog, mediaDevWarn } from '@/src/features/feed/utils/feedDiagnostics';
import { queryClient } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';

type UseResolvedImageUriArgs = {
  src?: string | null;
  fileId?: string | null;
  enabled?: boolean;
  allowSignedFallback?: boolean;
  debugContext?: SignedFileUrlDebugContext;
};

const SIGNED_URI_TTL_MS = 4 * 60 * 1000;
const SIGNED_URI_REFRESH_SKEW_MS = 30 * 1000;
const MISSING_URI_TTL_MS = 2 * 60 * 1000;
const resolvedUriCache = new Map<string, { uri: string; expiresAt: number }>();
const resolvedUriMissingCache = new Map<string, number>();
const pendingResolutions = new Map<string, Promise<string | null>>();

function devMediaLog(event: string, details: Record<string, unknown>) {
  mediaDevLog(event, details);
}

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

const hasSignedUrlParams = (value: string) => {
  try {
    const parsed = new URL(value);
    return Boolean(
      parsed.searchParams.get('X-Amz-Signature') ||
        parsed.searchParams.get('Signature') ||
        parsed.searchParams.get('Expires') ||
        parsed.searchParams.get('expires') ||
        parsed.searchParams.get('token'),
    );
  } catch {
    return false;
  }
};

const getDirectSourceType = (value: string) => {
  if (!isHttpUrl(value)) return null;
  if (isLoopbackHttpUrl(value)) return 'loopback-url';
  if (isS3LikeUrl(value)) return hasSignedUrlParams(value) ? 'signed-s3-url' : 'direct-s3-url';
  return 'direct-url';
};

const isUsableDirectHttpUrl = (value: string) => {
  const sourceType = getDirectSourceType(value);
  return Boolean(sourceType && (sourceType !== 'loopback-url' || Platform.OS === 'web'));
};

export const isUsableImageHttpUrl = isUsableDirectHttpUrl;

const isPotentialFileId = (value: string) => !isHttpUrl(value) && !/[/?#\\]/.test(value);

const getResolutionCacheKey = (
  directSrc: string | null,
  normalizedFileId: string | null,
  allowSignedFallback: boolean,
) => {
  if (normalizedFileId) return `file:${allowSignedFallback ? 'signed' : 'public'}:${normalizedFileId}`;
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

const shouldPreferFileIdResolution = (directSrc: string | null, normalizedFileId: string | null) => {
  if (!directSrc || !normalizedFileId) return false;
  if (!isUsableDirectHttpUrl(directSrc)) return true;
  if (isS3LikeUrl(directSrc) && !hasSignedUrlParams(directSrc)) return true;
  if (!hasSignedUrlParams(directSrc)) return false;

  const expiresAt = getSignedUriExpiresAt(directSrc);
  return !expiresAt || expiresAt <= Date.now() + SIGNED_URI_REFRESH_SKEW_MS;
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

export const clearResolvedImageUriCache = () => {
  resolvedUriCache.clear();
  resolvedUriMissingCache.clear();
  pendingResolutions.clear();
};

export const resolveImageUri = async ({
  src,
  fileId,
  forceRefresh = false,
  allowSignedFallback = true,
  debugContext,
}: {
  src?: string | null;
  fileId?: string | null;
  forceRefresh?: boolean;
  allowSignedFallback?: boolean;
  debugContext?: SignedFileUrlDebugContext;
}) => {
  const directSrc = trim(src);
  const normalizedFileId = trim(fileId);

  if (!directSrc && !normalizedFileId) {
    devMediaLog('resolve-skip', {
      reason: 'missing-source',
      sourceType: 'none',
      designId: debugContext?.designId ?? null,
      mediaIndex: debugContext?.mediaIndex ?? null,
    });
    return null;
  }

  if (directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
    devMediaLog('resolve-direct', {
      sourceType: getDirectSourceType(directSrc),
      hasFileId: Boolean(normalizedFileId),
      designId: debugContext?.designId ?? null,
      mediaIndex: debugContext?.mediaIndex ?? null,
    });
    return directSrc;
  }

  const cacheKey = getResolutionCacheKey(directSrc, normalizedFileId, allowSignedFallback);
  if (!cacheKey) {
    devMediaLog('resolve-failed', {
      reason: 'missing-cache-key',
      sourceType: directSrc ? getDirectSourceType(directSrc) ?? 'unsupported-src' : 'none',
      hasFileId: Boolean(normalizedFileId),
      designId: debugContext?.designId ?? null,
      mediaIndex: debugContext?.mediaIndex ?? null,
    });
    return null;
  }
  if (forceRefresh) {
    resolvedUriCache.delete(cacheKey);
    resolvedUriMissingCache.delete(cacheKey);
    if (normalizedFileId) {
      queryClient.removeQueries({ queryKey: queryKeys.media.publicUrl(normalizedFileId), exact: true });
      if (allowSignedFallback) {
        queryClient.removeQueries({ queryKey: queryKeys.media.signedUrl(normalizedFileId), exact: true });
      }
    }
  }
  const cached = getCachedUri(cacheKey);
  if (cached === '__missing__') {
    devMediaLog('resolve-failed', {
      reason: 'missing-cache',
      sourceType: directSrc ? getDirectSourceType(directSrc) ?? 'unsupported-src' : 'fileId',
      hasFileId: Boolean(normalizedFileId),
      designId: debugContext?.designId ?? null,
      mediaIndex: debugContext?.mediaIndex ?? null,
    });
    return null;
  }
  if (cached) {
    devMediaLog('resolve-cache-hit', {
      sourceType: directSrc ? getDirectSourceType(directSrc) ?? 'fileId' : 'fileId',
      hasFileId: Boolean(normalizedFileId),
      designId: debugContext?.designId ?? null,
      mediaIndex: debugContext?.mediaIndex ?? null,
    });
    return cached;
  }

  const pending = pendingResolutions.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      if (normalizedFileId && isPotentialFileId(normalizedFileId)) {
        const publicUrl = await queryClient.fetchQuery({
          queryKey: queryKeys.media.publicUrl(normalizedFileId),
          queryFn: () =>
            brandApi.getPublicFileUrl(normalizedFileId, {
              ...debugContext,
              fileId: debugContext?.fileId ?? normalizedFileId,
            }),
          staleTime: SIGNED_URI_TTL_MS - SIGNED_URI_REFRESH_SKEW_MS,
          gcTime: SIGNED_URI_TTL_MS,
        });
        if (publicUrl) {
          setCachedUri(cacheKey, publicUrl);
          devMediaLog('resolve-public', {
            sourceType: 'fileId',
            hasFileId: true,
            designId: debugContext?.designId ?? null,
            mediaIndex: debugContext?.mediaIndex ?? null,
          });
          return publicUrl;
        }

        if (!allowSignedFallback) {
          setMissingUri(cacheKey);
          devMediaLog('resolve-failed', {
            reason: 'signed-fallback-disabled',
            sourceType: 'fileId',
            hasFileId: true,
            designId: debugContext?.designId ?? null,
            mediaIndex: debugContext?.mediaIndex ?? null,
          });
          return null;
        }

        const signedUrl = await queryClient.fetchQuery({
          queryKey: queryKeys.media.signedUrl(normalizedFileId),
          queryFn: () =>
            brandApi.getPrivateSignedFileUrl(normalizedFileId, {
              ...debugContext,
              fileId: debugContext?.fileId ?? normalizedFileId,
            }),
          staleTime: SIGNED_URI_TTL_MS - SIGNED_URI_REFRESH_SKEW_MS,
          gcTime: SIGNED_URI_TTL_MS,
        });
        if (signedUrl) {
          setCachedUri(cacheKey, signedUrl);
          devMediaLog('resolve-signed', {
            sourceType: 'fileId',
            hasFileId: true,
            designId: debugContext?.designId ?? null,
            mediaIndex: debugContext?.mediaIndex ?? null,
          });
          return signedUrl;
        }
      }

      if (directSrc && isUsableDirectHttpUrl(directSrc)) {
        setCachedUri(cacheKey, directSrc);
        devMediaLog('resolve-direct-late', {
          sourceType: getDirectSourceType(directSrc),
          hasFileId: Boolean(normalizedFileId),
          designId: debugContext?.designId ?? null,
          mediaIndex: debugContext?.mediaIndex ?? null,
        });
        return directSrc;
      }

      setMissingUri(cacheKey);
      devMediaLog('resolve-failed', {
        reason: normalizedFileId ? 'fileId-signing-returned-empty' : 'unsupported-or-protected-source-without-fileId',
        sourceType: directSrc ? getDirectSourceType(directSrc) ?? 'unsupported-src' : 'none',
        hasFileId: Boolean(normalizedFileId),
        designId: debugContext?.designId ?? null,
        mediaIndex: debugContext?.mediaIndex ?? null,
      });
      return null;
    } catch {
      devMediaLog('resolve-failed', {
        reason: 'resolution-error',
        sourceType: directSrc ? getDirectSourceType(directSrc) ?? 'unsupported-src' : 'fileId',
        hasFileId: Boolean(normalizedFileId),
        designId: debugContext?.designId ?? null,
        mediaIndex: debugContext?.mediaIndex ?? null,
      });
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
  allowSignedFallback = true,
  debugContext,
}: UseResolvedImageUriArgs) => {
  const uri = await resolveImageUri({ src, fileId, allowSignedFallback, debugContext });
  if (!uri || !isHttpUrl(uri)) {
    return false;
  }

  try {
    return await ExpoImage.prefetch(uri, 'memory-disk');
  } catch {
    mediaDevWarn('prefetch-image-failed', {
      designId: debugContext?.designId ?? null,
      mediaIndex: debugContext?.mediaIndex ?? null,
      hasFileId: Boolean(fileId),
    });
    return false;
  }
};

export function useResolvedImageUri({
  src,
  fileId,
  enabled = true,
  allowSignedFallback = true,
  debugContext,
}: UseResolvedImageUriArgs) {
  const directSrc = trim(src);
  const normalizedFileId = trim(fileId);
  const cacheKey = getResolutionCacheKey(directSrc, normalizedFileId, allowSignedFallback);
  const activeKey = cacheKey ?? (directSrc ? `direct:${directSrc}` : null);
  const previousKeyRef = useRef<string | null>(activeKey);
  const resolvedKeyRef = useRef<string | null>(null);
  const lastSuccessfulRef = useRef<{ key: string; uri: string } | null>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
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

    if (directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
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

    if (directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
      resolvedKeyRef.current = activeKey ?? `direct:${directSrc}`;
      lastSuccessfulRef.current = { key: activeKey ?? `direct:${directSrc}`, uri: directSrc };
      setResolvedUri(directSrc);
      return () => {
        mounted = false;
      };
    }

    void resolveImageUri({ src: directSrc, fileId: normalizedFileId, allowSignedFallback, debugContext }).then((nextUri) => {
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
  }, [activeKey, allowSignedFallback, debugContext, directSrc, enabled, normalizedFileId]);

  useEffect(() => {
    if (!enabled || !cacheKey || !resolvedUri) return;
    if (directSrc && isUsableDirectHttpUrl(directSrc) && !normalizedFileId) return;

    const cached = getCachedUriEntry(cacheKey);
    if (!cached || cached === '__missing__') return;

    const delay = Math.max(1_000, cached.expiresAt - Date.now() - SIGNED_URI_REFRESH_SKEW_MS);
    const timeout = setTimeout(() => {
      void resolveImageUri({ src: directSrc, fileId: normalizedFileId, forceRefresh: true, allowSignedFallback, debugContext }).then((nextUri) => {
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
  }, [activeKey, allowSignedFallback, cacheKey, debugContext, directSrc, enabled, normalizedFileId, resolvedUri]);

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
    if (directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) return false;
    return uri == null;
  });

  useEffect(() => {
    if (!enabled || (!directSrc && !normalizedFileId)) {
      setLoading(false);
      return;
    }

    if (directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
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
      allowSignedFallback: args.allowSignedFallback,
      debugContext: args.debugContext,
    }).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [args.allowSignedFallback, args.debugContext, directSrc, enabled, normalizedFileId, uri]);

  return {
    uri,
    loading,
  };
}
