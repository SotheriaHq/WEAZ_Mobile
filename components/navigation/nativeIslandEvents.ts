import { DeviceEventEmitter } from 'react-native';

const COLLAPSE_EVENT = 'threadly.nativeIsland.collapse';

export function requestNativeIslandCollapse() {
  DeviceEventEmitter.emit(COLLAPSE_EVENT);
}

export function subscribeToNativeIslandCollapse(callback: () => void) {
  const subscription = DeviceEventEmitter.addListener(COLLAPSE_EVENT, callback);
  return () => subscription.remove();
}
