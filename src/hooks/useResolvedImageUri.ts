import { getMediaUrlExpiryMs, getMediaUrlIdentity, hasMediaUrlSignature, isRenewableMediaUrl, isStorageProviderUrl, isUsableMediaUrl } from '@/src/utils/mediaUrlPolicy';
import { advanceMediaSessionEpoch, getMediaSessionEpoch, subscribeMediaSession } from '@/src/utils/mediaUrlSession';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { brandApi, type SignedFileUrlDebugContext } from '@/src/api/BrandApi';
import { mediaDevWarn } from '@/src/features/feed/utils/feedDiagnostics';
import {
  queryClient,
  WIEZ_MEDIA_URL_GC_TIME_MS,
} from '@/src/query/queryClient';
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

const trim = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isS3LikeUrl = isStorageProviderUrl;

const isLoopbackHttpUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  } catch {
    return false;
  }
};

const hasSignedUrlParams = hasMediaUrlSignature;

const getDirectSourceType = (value: string) => {
  if (/^(?:file:|content:|blob:|asset:|data:image\/)/i.test(value)) return 'local-uri';
  if (!isHttpUrl(value)) return null;
  if (isLoopbackHttpUrl(value)) return 'loopback-url';
  if (isS3LikeUrl(value)) return hasSignedUrlParams(value) ? 'signed-s3-url' : 'direct-s3-url';
  return 'direct-url';
};

const isUsableDirectHttpUrl = (value: string) => {
  const sourceType = getDirectSourceType(value);
  return Boolean(sourceType && (sourceType !== 'loopback-url' || Platform.OS === 'web') && isUsableMediaUrl(value));
};

export const isUsableImageHttpUrl = isUsableDirectHttpUrl;

const isPotentialFileId = (value: string) => !isHttpUrl(value) && !/[/?#\\]/.test(value);

const getResolutionCacheKey = (
  directSrc: string | null,
  normalizedFileId: string | null,
  allowSignedFallback: boolean,
) => {
  if (normalizedFileId) return `${getMediaSessionEpoch()}:file:${allowSignedFallback ? 'signed' : 'public'}:${normalizedFileId}:${directSrc ? getMediaUrlIdentity(directSrc) : 'none'}`;
  if (directSrc) return `${getMediaSessionEpoch()}:src:${allowSignedFallback ? 'signed' : 'public'}:${getMediaUrlIdentity(directSrc)}`;
  return null;
};

const getSignedUriExpiresAt = getMediaUrlExpiryMs;

const shouldPreferFileIdResolution = (directSrc: string | null, _fileId: string | null) => Boolean(directSrc && !isUsableDirectHttpUrl(directSrc));

const getCachedUriEntry = (key: string) => {
  const missingCachedUntil = resolvedUriMissingCache.get(key);
  if (missingCachedUntil && missingCachedUntil > Date.now()) {
    return '__missing__';
  }
  if (missingCachedUntil) {
    resolvedUriMissingCache.delete(key);
  }

  const cached = resolvedUriCache.get(key);
  if (cached && cached.expiresAt > Date.now() && isUsableMediaUrl(cached.uri)) {
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
  const signedExpiry = getSignedUriExpiresAt(uri);
  const expiresAt = signedExpiry === null ? Date.now() + SIGNED_URI_TTL_MS : signedExpiry - SIGNED_URI_REFRESH_SKEW_MS;
  resolvedUriMissingCache.delete(key);
  resolvedUriCache.set(key, {
    uri,
    expiresAt,
  });
  while (resolvedUriCache.size > 512) resolvedUriCache.delete(resolvedUriCache.keys().next().value!);
};

const setMissingUri = (key: string) => {
  resolvedUriMissingCache.set(key, Date.now() + MISSING_URI_TTL_MS);
};

export const clearResolvedImageUriCache = () => {
  advanceMediaSessionEpoch();
  resolvedUriCache.clear();
  resolvedUriMissingCache.clear();
  pendingResolutions.clear();
};

export const resolveImageUri = async ({
  src, fileId, forceRefresh = false, allowSignedFallback = true, debugContext,
}: {
  src?: string | null; fileId?: string | null; forceRefresh?: boolean;
  allowSignedFallback?: boolean; debugContext?: SignedFileUrlDebugContext;
}): Promise<string | null> => {
  const epoch = getMediaSessionEpoch();
  const directSrc = trim(src);
  const normalizedFileId = trim(fileId);
  if (!directSrc && !normalizedFileId) return null;
  if (!forceRefresh && directSrc && isUsableDirectHttpUrl(directSrc)) return directSrc;
  const cacheKey = getResolutionCacheKey(directSrc, normalizedFileId, allowSignedFallback);
  if (!cacheKey) return null;
  if (forceRefresh) { resolvedUriCache.delete(cacheKey); resolvedUriMissingCache.delete(cacheKey); }
  const cached = getCachedUri(cacheKey);
  if (cached === '__missing__') return null;
  if (cached) return cached;
  const pending = pendingResolutions.get(cacheKey);
  if (pending) return pending;
  const promise = (async (): Promise<string | null> => {
    let resolved: string | null = null;
    try {
      const mustRefresh = forceRefresh || Boolean(directSrc && !isUsableMediaUrl(directSrc));
      if (directSrc && isRenewableMediaUrl(directSrc) && typeof brandApi.getSignedMediaSourceUrl === 'function') {
        resolved = await brandApi.getSignedMediaSourceUrl(directSrc, { ...debugContext, forceRefresh: mustRefresh, allowSignedFallback });
      }
      if (!resolved && normalizedFileId && isPotentialFileId(normalizedFileId)) {
        const publicKey = queryKeys.media.publicUrl(normalizedFileId);
        const privateKey = queryKeys.media.signedUrl(normalizedFileId);
        const cachedPublic = queryClient.getQueryData<string | null>(publicKey);
        const refreshQuery = mustRefresh || Boolean(cachedPublic && !isUsableMediaUrl(cachedPublic));
        if (refreshQuery) {
          queryClient.removeQueries({ queryKey: publicKey, exact: true });
          queryClient.removeQueries({ queryKey: privateKey, exact: true });
        }
        const context = { ...debugContext, ...(refreshQuery ? { forceRefresh: true } : {}) };
        resolved = await queryClient.fetchQuery({
          queryKey: publicKey, queryFn: () => brandApi.getPublicFileUrl(normalizedFileId, context),
          staleTime: refreshQuery ? 0 : SIGNED_URI_TTL_MS - SIGNED_URI_REFRESH_SKEW_MS, gcTime: WIEZ_MEDIA_URL_GC_TIME_MS,
        });
        if (!resolved && allowSignedFallback) {
          const cachedPrivate = queryClient.getQueryData<string | null>(privateKey);
          if (cachedPrivate && !isUsableMediaUrl(cachedPrivate)) queryClient.removeQueries({ queryKey: privateKey, exact: true });
          resolved = await queryClient.fetchQuery({
            queryKey: privateKey, queryFn: () => brandApi.getPrivateSignedFileUrl(normalizedFileId, context),
            staleTime: refreshQuery ? 0 : SIGNED_URI_TTL_MS - SIGNED_URI_REFRESH_SKEW_MS, gcTime: WIEZ_MEDIA_URL_GC_TIME_MS,
          });
        }
      }
      if (!resolved && directSrc && !isRenewableMediaUrl(directSrc) && isUsableDirectHttpUrl(directSrc)) resolved = directSrc;
      if (epoch !== getMediaSessionEpoch()) return null;
      if (resolved && isUsableMediaUrl(resolved, Date.now(), 0)) {
        setCachedUri(cacheKey, resolved);
        return resolved;
      }
      setMissingUri(cacheKey);
      while (resolvedUriMissingCache.size > 512) resolvedUriMissingCache.delete(resolvedUriMissingCache.keys().next().value!);
      return null;
    } catch { return null; }
  })();
  pendingResolutions.set(cacheKey, promise);
  try { return await promise; }
  finally { if (pendingResolutions.get(cacheKey) === promise) pendingResolutions.delete(cacheKey); }
};

// Prefetch decodes at thumbnail size: the point is the disk entry, which Glide
// writes from the original bytes whatever size is decoded. Decoding a 1440px
// bitmap per neighbour page would just be memory pressure on low-RAM phones.
const PREFETCH_DECODE_PX = 64;

export const prefetchResolvedImageAsset = async ({
  src,
  fileId,
  allowSignedFallback = true,
  debugContext,
  cacheKey,
}: UseResolvedImageUriArgs & {
  /**
   * The `cacheKey` the rendering `<Image>` passes. Required whenever it passes
   * one: `ExpoImage.prefetch` caches under the raw URL, which a custom-keyed
   * image never reads, so the prefetch would be a wasted second download.
   */
  cacheKey?: string | null;
}) => {
  const uri = await resolveImageUri({ src, fileId, allowSignedFallback, debugContext });
  if (!uri || !isHttpUrl(uri)) {
    return false;
  }

  try {
    if (cacheKey) {
      // `loadAsync` builds the same custom-key Glide model the view does, so
      // the source bytes land in the disk entry the visible image reads.
      const ref = await ExpoImage.loadAsync(
        { uri, cacheKey },
        Platform.OS === 'android'
          ? { maxWidth: PREFETCH_DECODE_PX, maxHeight: PREFETCH_DECODE_PX }
          : undefined,
      );
      ref.release();
      return true;
    }
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
  const session = useSyncExternalStore(subscribeMediaSession, getMediaSessionEpoch, getMediaSessionEpoch);
  const activeKey = `${session}:${cacheKey ?? (directSrc ? `direct:${directSrc}` : 'none')}`;
  const epoch = session;
  // Surviving instances must authorize new payloads after any account change.
  const mountEpoch = useRef(epoch);
  const accountChanged = mountEpoch.current !== epoch;
  const previousKeyRef = useRef<string | null>(activeKey);
  const resolvedKeyRef = useRef<string | null>(null);
  const lastSuccessfulRef = useRef<{ key: string; uri: string } | null>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (!accountChanged && directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
      const key = activeKey;
      resolvedKeyRef.current = key;
      lastSuccessfulRef.current = { key, uri: directSrc };
      return directSrc;
    }
    const cachedKey = cacheKey;
    const cached = cachedKey ? getCachedUri(cachedKey) : null;
    if (cachedKey && cached && cached !== '__missing__') {
      resolvedKeyRef.current = activeKey;
      lastSuccessfulRef.current = { key: activeKey, uri: cached };
      return cached;
    }
    return null;
  });

  useEffect(() => {
    const requiresAuthorization = mountEpoch.current !== epoch;
    if (activeKey === previousKeyRef.current) return;
    previousKeyRef.current = activeKey;
    if (requiresAuthorization) { lastSuccessfulRef.current = null; resolvedKeyRef.current = null; setResolvedUri(null); }

    if (!activeKey) {
      resolvedKeyRef.current = null;
      lastSuccessfulRef.current = null;
      setResolvedUri(null);
      return;
    }

    if (!requiresAuthorization && directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
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
      return;
    }

    // Never carry a URI across source identities. Callers that want stale-while-
    // revalidate rendering keep their own identity-bound preview layer.
    resolvedKeyRef.current = null;
    setResolvedUri(null);
  }, [activeKey, cacheKey, directSrc, epoch]);

  useEffect(() => {
    let mounted = true;
    const requiresAuthorization = mountEpoch.current !== epoch;

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

    if (!requiresAuthorization && directSrc && isUsableDirectHttpUrl(directSrc) && !shouldPreferFileIdResolution(directSrc, normalizedFileId)) {
      resolvedKeyRef.current = activeKey ?? `direct:${directSrc}`;
      lastSuccessfulRef.current = { key: activeKey ?? `direct:${directSrc}`, uri: directSrc };
      setResolvedUri(directSrc);
      return () => {
        mounted = false;
      };
    }

    void resolveImageUri({ src: directSrc, fileId: normalizedFileId, forceRefresh: requiresAuthorization, allowSignedFallback, debugContext }).then((nextUri) => {
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
          if (current && isUsableMediaUrl(current) && resolvedKeyRef.current === activeKey) return current;
          const lastSuccessful = lastSuccessfulRef.current;
          return lastSuccessful?.key === activeKey && isUsableMediaUrl(lastSuccessful.uri) ? lastSuccessful.uri : null;
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeKey, allowSignedFallback, debugContext, directSrc, enabled, normalizedFileId, epoch]);

  useEffect(() => {
    if (!enabled) return;
    const expiresAt = getSignedUriExpiresAt(resolvedUri);
    let mounted = true;
    const renew = () => {
      void resolveImageUri({ src: resolvedUri ?? directSrc, fileId: normalizedFileId, forceRefresh: true, allowSignedFallback, debugContext }).then((nextUri) => {
        if (mounted && epoch === getMediaSessionEpoch()) {
          setResolvedUri(nextUri);
          if (nextUri && activeKey) { resolvedKeyRef.current = activeKey; lastSuccessfulRef.current = { key: activeKey, uri: nextUri }; }
        }
      });
    };
    const timeout = expiresAt === null ? null : setTimeout(renew, Math.min(2_147_483_647, Math.max(1000, expiresAt - Date.now() - SIGNED_URI_REFRESH_SKEW_MS)));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && (normalizedFileId || isRenewableMediaUrl(directSrc)) && !isUsableMediaUrl(resolvedUri)) renew();
    });
    return () => { mounted = false; if (timeout) clearTimeout(timeout); subscription.remove(); };
  }, [activeKey, allowSignedFallback, debugContext, directSrc, enabled, normalizedFileId, resolvedUri, epoch]);

  if (resolvedKeyRef.current === activeKey && isUsableMediaUrl(resolvedUri, Date.now(), 0)) return resolvedUri;
  return !accountChanged && directSrc && isUsableDirectHttpUrl(directSrc) ? directSrc : null;
}

export function useResolvedImageAsset(args: UseResolvedImageUriArgs) {
  const [override, setOverride] = useState<{ base: string | null; fileId: string | null; uri: string } | null>(null);
  const base = trim(args.src);
  const file = trim(args.fileId);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useRef({ base, file });
  current.current = { base, file };
  const overrideMatches = override?.base === base && override?.fileId === file;
  const uri = useResolvedImageUri({ ...args, src: overrideMatches ? override!.uri : args.src });
  const refreshUri = useCallback(async () => {
    const epoch = getMediaSessionEpoch();
    const next = await resolveImageUri({ src: uri ?? args.src, fileId: args.fileId, forceRefresh: true, allowSignedFallback: args.allowSignedFallback, debugContext: args.debugContext });
    if (next && mounted.current && epoch === getMediaSessionEpoch() && current.current.base === base && current.current.file === file) setOverride({ base, fileId: file, uri: next });
    return next;
  }, [args.allowSignedFallback, args.debugContext, args.fileId, args.src, base, file, uri]);
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
    refreshUri,
  };
}
