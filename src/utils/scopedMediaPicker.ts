import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type MediaPickerScope = { actorId: string; flowId: string; subjectId?: string | null };
export type MediaPickerRequest = { source: 'camera' | 'library'; options: ImagePicker.ImagePickerOptions };
export type PickerPermissionIssue = {
  source: 'camera' | 'library'; title: string; message: string; canAskAgain: boolean;
};
export type ScopedMediaPickerResult =
  | { status: 'success'; assets: ImagePicker.ImagePickerAsset[]; isCurrent: () => boolean }
  | { status: 'cancelled' }
  | { status: 'permission'; issue: PickerPermissionIssue }
  | { status: 'error'; message: string };

const PENDING_KEY = 'wiez.media-picker.pending.v1';
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
let pickerBusy = false;

export function requiredPickerPermission(request: MediaPickerRequest, platform = Platform.OS) {
  if (platform === 'web') return null;
  if (request.source === 'camera') return 'camera';
  const types = request.options.mediaTypes;
  const includesVideo = types === ImagePicker.MediaTypeOptions.All ||
    types === ImagePicker.MediaTypeOptions.Videos || (Array.isArray(types) && types.includes('videos'));
  const originalVideo = request.options.videoExportPreset == null ||
    request.options.videoExportPreset === ImagePicker.VideoExportPreset.Passthrough;
  return platform === 'ios' && includesVideo && !request.options.allowsEditing && originalVideo ? 'library' : null;
}

export function pickerPermissionGranted(permission: { granted: boolean; accessPrivileges?: string }) {
  return permission.granted || permission.accessPrivileges === 'limited';
}

export async function readPickerPermission(request: MediaPickerRequest) {
  const required = requiredPickerPermission(request);
  return required === 'camera' ? ImagePicker.getCameraPermissionsAsync() :
    required === 'library' ? ImagePicker.getMediaLibraryPermissionsAsync() : null;
}

/** Called only by an explicit user action. Android replay is bound to a durable subject. */
export async function pickScopedMedia(
  scope: MediaPickerScope, request: MediaPickerRequest, isCurrent: () => boolean,
): Promise<ScopedMediaPickerResult> {
  if ((pickerBusy && Platform.OS !== 'web') || !scope.actorId || !isCurrent()) return { status: 'cancelled' };
  pickerBusy = true;
  const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let persisted = false;
  try {
    // Web launch must remain in the user's click stack; browser cancellation may never settle the SDK promise.
    if (Platform.OS === 'web') {
      const result = await (request.source === 'camera' ? ImagePicker.launchCameraAsync(request.options) :
        ImagePicker.launchImageLibraryAsync(request.options));
      return isCurrent() && !result.canceled && result.assets?.length ?
        { status: 'success', assets: result.assets, isCurrent } : { status: 'cancelled' };
    }
    if (Platform.OS === 'android') {
      let previous: { actorId?: string; flowId?: string; subjectId?: string; source?: string; createdAt?: number } | null = null;
      try { previous = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? 'null'); } catch { /* Recovery is optional. */ }
      const pending = await ImagePicker.getPendingResultAsync();
      await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
      if (!isCurrent()) return { status: 'cancelled' };
      const age = Date.now() - (previous?.createdAt ?? 0);
      const owned = Boolean(scope.subjectId) && previous?.actorId === scope.actorId &&
        previous?.flowId === scope.flowId && previous?.subjectId === scope.subjectId &&
        previous?.source === request.source && age >= 0 && age <= RECOVERY_WINDOW_MS;
      if (owned && pending && !('code' in pending) && !pending.canceled && pending.assets?.length) {
        return { status: 'success', assets: pending.assets, isCurrent };
      }
    }

    const required = requiredPickerPermission(request);
    let permission = await readPickerPermission(request);
    if (!isCurrent()) return { status: 'cancelled' };
    if (permission && !pickerPermissionGranted(permission) && permission.canAskAgain) {
      permission = required === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() :
        await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!isCurrent()) return { status: 'cancelled' };
    if (permission && !pickerPermissionGranted(permission)) {
      return { status: 'permission', issue: {
        source: request.source,
        title: required === 'camera' ? 'Camera permission needed' : 'Media permission needed',
        message: permission.canAskAgain ? 'Choose again to allow access, or cancel and keep your current selection.' :
          'Open Settings to allow access, then return and choose again. Your current selection is kept.',
        canAskAgain: permission.canAskAgain,
      } };
    }

    if (Platform.OS === 'android' && scope.subjectId) {
      try {
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ ...scope, source: request.source, createdAt: Date.now(), operationId }));
        persisted = true;
      } catch { /* Selection works even when recovery storage is unavailable. */ }
    }
    if (!isCurrent()) return { status: 'cancelled' };
    const result = await (request.source === 'camera' ? ImagePicker.launchCameraAsync(request.options) :
      ImagePicker.launchImageLibraryAsync(request.options));
    if (!isCurrent() || result.canceled || !result.assets?.length) return { status: 'cancelled' };
    return { status: 'success', assets: result.assets, isCurrent };
  } catch {
    return isCurrent() ? { status: 'error', message: 'Unable to open media. Please choose again.' } : { status: 'cancelled' };
  } finally {
    if (persisted) await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
    pickerBusy = false;
  }
}
