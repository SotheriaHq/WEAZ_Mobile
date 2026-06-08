import * as ImagePicker from 'expo-image-picker';

import type { DesignEditorAsset } from '@/src/api/DesignApi';
import {
  MOBILE_UPLOAD_POLICIES,
  validatePickedUploadAssets,
} from '@/src/utils/uploadValidation';
import { DESIGN_EDITOR_MAX_MEDIA, MEDIA_VIEW_SLOT_OPTIONS } from './designCreationRules';

export { DESIGN_EDITOR_MAX_MEDIA };

export type DesignEditorMediaSource = 'camera' | 'library';

export type MediaPermissionIssue = {
  source: DesignEditorMediaSource;
  title: string;
  message: string;
  canAskAgain: boolean;
};

export type DesignEditorMediaPickResult =
  | { status: 'success'; assets: DesignEditorAsset[] }
  | { status: 'cancelled' }
  | { status: 'permission'; issue: MediaPermissionIssue }
  | { status: 'limit'; message: string };

const stagedAssetBundles = new Map<string, DesignEditorAsset[]>();

function createHandoffToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDesignEditorAssets(result: ImagePicker.ImagePickerAsset[], existingCount: number) {
  return result.map((asset, index) => ({
    id: `${asset.assetId ?? asset.uri}_${Date.now()}_${existingCount + index}`,
    uri: asset.uri,
    mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    fileName:
      asset.fileName ?? `design-${existingCount + index + 1}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
    fileSize: asset.fileSize ?? 0,
    mediaKind: asset.type === 'video' ? 'video' : 'image',
    aspectRatio:
      typeof asset.width === 'number' && typeof asset.height === 'number' && asset.height > 0
        ? asset.width / asset.height
        : null,
    viewSlot:
      MEDIA_VIEW_SLOT_OPTIONS[existingCount + index]?.value ??
      MEDIA_VIEW_SLOT_OPTIONS[MEDIA_VIEW_SLOT_OPTIONS.length - 1].value,
  })) satisfies DesignEditorAsset[];
}

export function stageDesignEditorAssetBundle(assets: DesignEditorAsset[]) {
  stagedAssetBundles.clear();
  const token = createHandoffToken();
  stagedAssetBundles.set(token, assets.map((asset) => ({ ...asset })));
  return token;
}

export function consumeDesignEditorAssetBundle(token: string) {
  const assets = stagedAssetBundles.get(token) ?? null;
  stagedAssetBundles.delete(token);
  return assets ? assets.map((asset) => ({ ...asset })) : null;
}

export async function pickDesignEditorMediaAssets({
  source,
  existingCount = 0,
  maxMedia = DESIGN_EDITOR_MAX_MEDIA,
}: {
  source: DesignEditorMediaSource;
  existingCount?: number;
  maxMedia?: number;
}): Promise<DesignEditorMediaPickResult> {
  const remainingSlots = Math.max(0, maxMedia - existingCount);
  if (remainingSlots === 0) {
    return {
      status: 'limit',
      message: `You can upload up to ${maxMedia} design assets.`,
    };
  }

  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return {
      status: 'permission',
      issue: {
        source,
        title: source === 'camera' ? 'Camera permission needed' : 'Photo library permission needed',
        message: permission.canAskAgain
          ? source === 'camera'
            ? 'Allow camera access to capture a photo or video for this design.'
            : 'Allow photo library access to select design media from your device.'
          : source === 'camera'
            ? 'Camera access is blocked. Open settings to allow WEAZ to use your camera.'
            : 'Photo library access is blocked. Open settings to allow WEAZ to use your media.',
        canAskAgain: Boolean(permission.canAskAgain),
      },
    };
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.9,
          base64: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsMultipleSelection: true,
          quality: 0.9,
          selectionLimit: remainingSlots,
          base64: false,
        });

  if (result.canceled || !result.assets?.length) {
    return { status: 'cancelled' };
  }

  const validationErrors = validatePickedUploadAssets(
    result.assets.map((asset) => ({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileSize: asset.fileSize,
    })),
    MOBILE_UPLOAD_POLICIES.designMedia,
    { existingCount, maxFiles: maxMedia },
  );
  if (validationErrors.length > 0) {
    return { status: 'limit', message: validationErrors[0] };
  }

  return {
    status: 'success',
    assets: buildDesignEditorAssets(result.assets, existingCount),
  };
}
