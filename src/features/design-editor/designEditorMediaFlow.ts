import * as ImagePicker from 'expo-image-picker';
import type { MediaPickerRequest, ScopedMediaPickerResult } from '@/src/utils/scopedMediaPicker';

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
  | { status: 'success'; assets: DesignEditorAsset[]; isCurrent: () => boolean }
  | { status: 'cancelled' }
  | { status: 'permission'; issue: MediaPermissionIssue }
  | { status: 'limit'; message: string };

const stagedAssetBundles = new Map<string, DesignEditorAsset[]>();

function createHandoffToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type ProcessedPickerAsset = ImagePicker.ImagePickerAsset & { fileSize?: number | null };

function buildDesignEditorAssets(result: ProcessedPickerAsset[], existingCount: number) {
  return result.map((asset, index) => ({
    id: `${asset.assetId ?? asset.uri}_${Date.now()}_${existingCount + index}`,
    uri: asset.uri,
    mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    fileName:
      asset.fileName ?? `design-${existingCount + index + 1}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
    fileSize: asset.fileSize ?? 0,
    mediaKind: asset.type === 'video' ? 'video' : 'image',
    width: asset.width,
    height: asset.height,
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
  pick,
}: {
  source: DesignEditorMediaSource;
  existingCount?: number;
  maxMedia?: number;
  pick: (request: MediaPickerRequest) => Promise<ScopedMediaPickerResult>;
}): Promise<DesignEditorMediaPickResult> {
  const remainingSlots = Math.max(0, maxMedia - existingCount);
  if (remainingSlots === 0) {
    return {
      status: 'limit',
      message: `You can upload up to ${maxMedia} design assets.`,
    };
  }

  const result = await pick({ source, options:
    source === 'camera'
      ? {
          mediaTypes: ['images', 'videos'],
          quality: 1,
          base64: false,
        }
      : {
          mediaTypes: ['images', 'videos'],
          quality: 1,
          allowsMultipleSelection: true,
          selectionLimit: remainingSlots,
          base64: false,
          presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
        } });

  if (result.status === 'error') return { status: 'limit', message: result.message };
  if (result.status !== 'success') return result;

  // Compression is deferred until save/upload time to ensure the local
  // preview appears instantly. We set fileSize to undefined for images
  // so size validation is skipped at pick time (videos keep their size).
  const processedAssets = result.assets.map((asset) => {
    if (asset.type === 'video') return asset;
    return {
      ...asset,
      fileSize: undefined,
    };
  });

  const validationErrors = validatePickedUploadAssets(
    processedAssets.map((asset) => ({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileSize: asset.fileSize,
    })),
    {
      ...MOBILE_UPLOAD_POLICIES.designMedia,
      // Picker input formats are converted before upload; the wire policy stays strict.
      allowedMimeTypes: [...MOBILE_UPLOAD_POLICIES.designMedia.allowedMimeTypes, 'image/heic', 'image/heif', 'image/avif'],
      allowedExtensions: [...MOBILE_UPLOAD_POLICIES.designMedia.allowedExtensions, 'heic', 'heif', 'avif'],
    },
    { existingCount, maxFiles: maxMedia },
  );
  if (validationErrors.length > 0) {
    return { status: 'limit', message: validationErrors[0] };
  }

  return {
    status: 'success',
    assets: buildDesignEditorAssets(processedAssets, existingCount),
    isCurrent: result.isCurrent,
  };
}
