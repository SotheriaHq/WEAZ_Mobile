import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  pickScopedMedia, pickerPermissionGranted, readPickerPermission,
  type MediaPickerRequest, type MediaPickerScope, type PickerPermissionIssue,
} from '@/src/utils/scopedMediaPicker';
import { getMediaSessionEpoch } from '@/src/utils/mediaUrlSession';

export function useScopedMediaPicker(scope: { actorId?: string | null; flowId: string; subjectId?: string | null },
  onPermissionIssue?: (issue: PickerPermissionIssue | null) => void) {
  const mounted = useRef(false);
  const deniedRequest = useRef<MediaPickerRequest | null>(null);
  const current = useRef({ identity: '', generation: 0, focused: false });
  const identity = JSON.stringify([scope.actorId, scope.flowId, scope.subjectId, getMediaSessionEpoch()]);
  if (current.current.identity !== identity) {
    current.current = { ...current.current, identity, generation: current.current.generation + 1 };
    deniedRequest.current = null;
  }
  const latest = useRef({ scope, onPermissionIssue });
  latest.current = { scope, onPermissionIssue };
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    current.current.focused = true;
    return () => { current.current.focused = false; current.current.generation += 1; deniedRequest.current = null; };
  }, []));
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !deniedRequest.current) return;
      const generation = current.current.generation;
      const request = deniedRequest.current;
      void readPickerPermission(request).then((permission) => {
        if (!mounted.current || generation !== current.current.generation || !current.current.focused) return;
        if (!permission || pickerPermissionGranted(permission)) {
          deniedRequest.current = null;
          latest.current.onPermissionIssue?.({
            source: request.source, title: 'Media access ready',
            message: 'Access is enabled. Choose again to continue.', canAskAgain: true,
          });
        }
      }).catch(() => undefined);
    });
    return () => listener.remove();
  }, []);
  const pick = useCallback(async (request: MediaPickerRequest) => {
    if (busy.current && Platform.OS !== 'web') return { status: 'cancelled' } as const;
    busy.current = true;
    const generation = ++current.current.generation;
    const epoch = getMediaSessionEpoch();
    const isCurrent = () => mounted.current && current.current.focused &&
      current.current.generation === generation && getMediaSessionEpoch() === epoch;
    try {
      const result = await pickScopedMedia(latest.current.scope as MediaPickerScope, request, isCurrent);
      if (!isCurrent()) return { status: 'cancelled' } as const;
      if (result.status === 'permission') {
        deniedRequest.current = request;
        if (latest.current.onPermissionIssue) latest.current.onPermissionIssue(result.issue);
        else Alert.alert(result.issue.title, result.issue.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Settings', onPress: () => { void Linking.openSettings().catch(() => undefined); } },
        ]);
      } else if (result.status === 'error') Alert.alert('Media selection', result.message);
      else { deniedRequest.current = null; latest.current.onPermissionIssue?.(null); }
      return result;
    } finally { busy.current = false; }
  }, []);
  return { pick };
}
