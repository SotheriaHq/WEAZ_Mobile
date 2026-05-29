import { Image } from 'react-native';
import { useEffect, useState } from 'react';

const DEFAULT_ASPECT_RATIO = 4 / 5;
const aspectRatioCache = new Map<string, number>();

const normalizeAspectRatio = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

export function useMediaAspectRatio(
  uri?: string | null,
  initialAspectRatio?: number | null,
) {
  const cachedInitialAspectRatio = uri ? aspectRatioCache.get(uri) : undefined;
  const initialValue =
    normalizeAspectRatio(initialAspectRatio) ??
    cachedInitialAspectRatio ??
    DEFAULT_ASPECT_RATIO;

  const [aspectRatio, setAspectRatio] = useState(initialValue);

  useEffect(() => {
    const providedRatio = normalizeAspectRatio(initialAspectRatio);
    if (providedRatio) {
      setAspectRatio(providedRatio);
      if (uri) {
        aspectRatioCache.set(uri, providedRatio);
      }
      return;
    }

    if (!uri) {
      setAspectRatio(DEFAULT_ASPECT_RATIO);
      return;
    }

    const cached = aspectRatioCache.get(uri);
    if (cached) {
      setAspectRatio(cached);
      return;
    }

    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        const nextRatio = width / height;
        aspectRatioCache.set(uri, nextRatio);
        setAspectRatio(nextRatio);
      },
      () => {
        if (!cancelled) {
          setAspectRatio(DEFAULT_ASPECT_RATIO);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [initialAspectRatio, uri]);

  return aspectRatio;
}

export default useMediaAspectRatio;
