const MB = 1024 * 1024;

export type MobileUploadAsset = {
  uri?: string | null;
  fileName?: string | null;
  name?: string | null;
  mimeType?: string | null;
  type?: string | null;
  fileSize?: number | null;
  size?: number | null;
};

export type MobileUploadPolicy = {
  label: string;
  allowedMimeTypes: readonly string[];
  allowedExtensions: readonly string[];
  maxSizeBytes: number;
  videoMaxSizeBytes?: number;
  maxFiles?: number;
};

export class MobileUploadValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors[0] ?? 'This file cannot be uploaded.');
    this.name = 'MobileUploadValidationError';
    this.errors = errors;
  }
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'] as const;

export const MOBILE_UPLOAD_POLICIES = {
  profileImage: {
    label: 'Profile photo',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedExtensions: IMAGE_EXTENSIONS,
    maxSizeBytes: 2 * MB,
    maxFiles: 1,
  },
  bannerImage: {
    label: 'Banner image',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedExtensions: IMAGE_EXTENSIONS,
    maxSizeBytes: 2 * MB,
    maxFiles: 1,
  },
  designMedia: {
    label: 'Design media',
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    allowedExtensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS],
    maxSizeBytes: 2 * MB,
    videoMaxSizeBytes: 100 * MB,
    maxFiles: 6,
  },
  messageImage: {
    label: 'Message image',
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedExtensions: IMAGE_EXTENSIONS,
    maxSizeBytes: 2 * MB,
    maxFiles: 5,
  },
  messageDocument: {
    label: 'Message document',
    allowedMimeTypes: ['application/pdf'],
    allowedExtensions: ['pdf'],
    maxSizeBytes: 2 * MB,
    maxFiles: 5,
  },
} as const satisfies Record<string, MobileUploadPolicy>;

const normalizeMimeType = (value: string | undefined | null) =>
  String(value ?? '').trim().toLowerCase().split(';')[0];

const assetName = (asset: MobileUploadAsset) => asset.fileName ?? asset.name ?? asset.uri ?? '';

const getExtension = (asset: MobileUploadAsset) => {
  const source = assetName(asset).trim().split(/[\\/]/).pop() ?? '';
  const extension = source.includes('.') ? source.split('.').pop() : '';
  return String(extension ?? '').toLowerCase();
};

const getSize = (asset: MobileUploadAsset) => {
  const size = asset.fileSize ?? asset.size;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : null;
};

const formatBytesAsMB = (bytes: number) => {
  const mb = bytes / MB;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
};

const resolveSizeLimit = (asset: MobileUploadAsset, policy: MobileUploadPolicy) => {
  const mimeType = normalizeMimeType(asset.mimeType ?? asset.type);
  if (policy.videoMaxSizeBytes && mimeType.startsWith('video/')) {
    return policy.videoMaxSizeBytes;
  }
  return policy.maxSizeBytes;
};

export const validatePickedUploadAsset = (
  asset: MobileUploadAsset,
  policy: MobileUploadPolicy,
): string[] => {
  const errors: string[] = [];
  const uri = String(asset.uri ?? '').trim();
  const mimeType = normalizeMimeType(asset.mimeType ?? asset.type);
  const extension = getExtension(asset);
  const isAllowedMime = mimeType.length > 0 && policy.allowedMimeTypes.includes(mimeType);
  const isAllowedExtension =
    extension.length > 0 && policy.allowedExtensions.includes(extension);

  if (!uri) {
    errors.push(`${policy.label} is missing a local file reference.`);
  }

  if (!isAllowedMime && !isAllowedExtension) {
    errors.push(`${policy.label} must be a supported file type.`);
  }

  const size = getSize(asset);
  const maxSizeBytes = resolveSizeLimit(asset, policy);
  if (size !== null && size > maxSizeBytes) {
    errors.push(`${policy.label} must be ${formatBytesAsMB(maxSizeBytes)} or smaller.`);
  }

  return errors;
};

export const validatePickedUploadAssets = (
  assets: readonly MobileUploadAsset[],
  policy: MobileUploadPolicy,
  options?: { existingCount?: number; maxFiles?: number },
): string[] => {
  const maxFiles = options?.maxFiles ?? policy.maxFiles;
  const totalFiles = assets.length + (options?.existingCount ?? 0);
  const errors: string[] = [];

  if (typeof maxFiles === 'number' && totalFiles > maxFiles) {
    errors.push(`You can upload up to ${maxFiles} ${policy.label.toLowerCase()} files.`);
  }

  for (const asset of assets) {
    errors.push(...validatePickedUploadAsset(asset, policy));
  }

  return errors;
};

export const assertValidPickedUploadAsset = (
  asset: MobileUploadAsset,
  policy: MobileUploadPolicy,
) => {
  const errors = validatePickedUploadAsset(asset, policy);
  if (errors.length > 0) {
    throw new MobileUploadValidationError(errors);
  }
};

export const assertValidPickedUploadAssets = (
  assets: readonly MobileUploadAsset[],
  policy: MobileUploadPolicy,
  options?: { existingCount?: number; maxFiles?: number },
) => {
  const errors = validatePickedUploadAssets(assets, policy, options);
  if (errors.length > 0) {
    throw new MobileUploadValidationError(errors);
  }
};

export const getMobileUploadValidationMessage = (error: unknown) =>
  error instanceof MobileUploadValidationError
    ? error.message
    : 'This file cannot be uploaded. Please choose a different file.';
