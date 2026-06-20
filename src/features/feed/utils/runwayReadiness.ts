import { feedLoadDevLog } from '@/src/features/feed/utils/feedDiagnostics';

export type RunwayFirstMediaVisibleEvent = {
  timestamp: number;
  mediaId: string;
  sourceTier: string;
};

let firstMediaVisible: RunwayFirstMediaVisibleEvent | null = null;
const listeners = new Set<(event: RunwayFirstMediaVisibleEvent) => void>();

export function markRunwayFirstMediaVisible(details: {
  mediaId: string;
  sourceTier: string;
}) {
  if (firstMediaVisible) return firstMediaVisible;

  firstMediaVisible = {
    timestamp: Date.now(),
    mediaId: details.mediaId,
    sourceTier: details.sourceTier,
  };
  feedLoadDevLog('first-media-visible', firstMediaVisible);
  listeners.forEach((listener) => listener(firstMediaVisible!));
  listeners.clear();
  return firstMediaVisible;
}

export function getRunwayFirstMediaVisible() {
  return firstMediaVisible;
}

export function subscribeRunwayFirstMediaVisible(
  listener: (event: RunwayFirstMediaVisibleEvent) => void,
) {
  if (firstMediaVisible) {
    listener(firstMediaVisible);
    return () => undefined;
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
