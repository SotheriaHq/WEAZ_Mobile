let sessionEpoch = 0;
const listeners = new Set<() => void>();

/** Fence media capabilities and pending resolutions across account changes. */
export const getMediaSessionEpoch = () => sessionEpoch;
export const advanceMediaSessionEpoch = () => { sessionEpoch += 1; listeners.forEach((listener) => listener()); };
export const subscribeMediaSession = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
