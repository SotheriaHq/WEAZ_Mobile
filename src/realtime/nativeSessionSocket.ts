import { AppState } from 'react-native';
import { getApiAccessToken, getApiSecurityIdentity, refreshRealtimeAccessToken } from '@/src/api/httpClient';
import { bindSessionSocket } from './sessionSocket';

export function bindNativeSessionSocket(socket: Parameters<typeof bindSessionSocket>[0]): () => void {
  return bindSessionSocket(socket, { current: () => {
    const token = getApiAccessToken(), identity = getApiSecurityIdentity();
    return token && identity ? { token, identity } : null;
  }, refresh: refreshRealtimeAccessToken, subscribeAvailable: listener => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') listener(); });
    return () => subscription.remove();
  } });
}
