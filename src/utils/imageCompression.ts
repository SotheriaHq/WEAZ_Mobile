type CompressionProfile = 'profileImage' | 'bannerImage' | 'designMedia' | 'messageImage';

// Max dimension is applied to the LONGEST side only.
// Aspect ratio is always preserved — we never crop or stretch.
// Only images larger than maxLongSide are resized; smaller images are only quality-compressed.
const PROFILES: Record<CompressionProfile, { maxLongSide: number; quality: number }> = {
  profileImage: { maxLongSide: 800,  quality: 0.78 },
  bannerImage:  { maxLongSide: 1200, quality: 0.75 },
  designMedia:  { maxLongSide: 1600, quality: 0.72 },
  messageImage: { maxLongSide: 1024, quality: 0.75 },
};

export type CompressedImage = {
  uri: string;
  width: number;
  height: number;
  // 'image/jpeg' when compression ran; the original/inferred mime when we fell
  // back to the uncompressed image (e.g. native module unavailable).
  mimeType: string;
  fileName: string;
  // True when the original image was returned without compression. Callers can
  // use this for diagnostics; it is safe to ignore.
  compressed?: boolean;
};

// expo-image-manipulator is a native module that requires a native rebuild
// (expo prebuild / dev-client build) to be available. We require it lazily so a
// missing native module does NOT crash the module graph at load time, and we
// remember when it is unavailable so we do not repeatedly trigger the
// "Cannot find native module 'ExpoImageManipulator'" error on every pick.
let manipulatorModule: typeof import('expo-image-manipulator') | null | undefined;

function isManipulatorAvailable() {
  // Expo SDK 50+ JSI modules
  if ((globalThis as any).expo?.modules?.ExpoImageManipulator) {
    return true;
  }
  // Legacy or standard native modules
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModulesProxy } = require('expo-modules-core');
    if (NativeModulesProxy && NativeModulesProxy.ExpoImageManipulator) {
      return true;
    }
  } catch (err) {
    // Ignore
  }
  return false;
}

function getManipulator(): typeof import('expo-image-manipulator') | null {
  if (manipulatorModule !== undefined) return manipulatorModule;
  
  if (!isManipulatorAvailable()) {
    console.warn('[ImageCompression] Native module ExpoImageManipulator is unavailable. Falling back to original image.');
    manipulatorModule = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    // Touch the API we rely on so a lazily-thrown native binding surfaces here
    // (and is cached as unavailable) rather than at call time.
    manipulatorModule = typeof mod?.manipulateAsync === 'function' ? mod : null;
  } catch (err) {
    console.warn('[ImageCompression] Failed to load ExpoImageManipulator:', err);
    manipulatorModule = null;
  }
  return manipulatorModule;
}

function inferMimeType(fileName: string | null | undefined, uri: string): string {
  const source = String(fileName || uri || '').toLowerCase();
  if (source.endsWith('.png')) return 'image/png';
  if (source.endsWith('.webp')) return 'image/webp';
  if (source.endsWith('.heic') || source.endsWith('.heif')) return 'image/heic';
  if (source.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function originalImage(
  uri: string,
  originalWidth: number,
  originalHeight: number,
  originalFileName: string | null | undefined,
): CompressedImage {
  return {
    uri,
    width: originalWidth,
    height: originalHeight,
    mimeType: inferMimeType(originalFileName, uri),
    fileName: originalFileName?.trim() || `image-${Date.now()}.jpg`,
    compressed: false,
  };
}

// Never throws. Compresses with expo-image-manipulator when available, and
// otherwise (or on any failure) returns the original image unchanged so image
// selection cannot crash. Compression is therefore best-effort/optional.
export async function compressPickedImage(
  uri: string,
  originalWidth: number,
  originalHeight: number,
  originalFileName: string | null | undefined,
  profile: CompressionProfile,
): Promise<CompressedImage> {
  const manipulator = getManipulator();
  if (!manipulator) {
    return originalImage(uri, originalWidth, originalHeight, originalFileName);
  }

  try {
    const { manipulateAsync, SaveFormat } = manipulator;
    const cfg = PROFILES[profile];
    const longSide = Math.max(originalWidth, originalHeight);

    const actions: Parameters<typeof manipulateAsync>[1] = [];

    if (longSide > cfg.maxLongSide && longSide > 0) {
      const scale = cfg.maxLongSide / longSide;
      actions.push({
        resize: {
          width: Math.round(originalWidth * scale),
          height: Math.round(originalHeight * scale),
        },
      });
    }

    const result = await manipulateAsync(uri, actions, {
      compress: cfg.quality,
      format: SaveFormat.JPEG,
    });

    const baseName = (originalFileName ?? 'image').replace(/\.[^.]+$/, '');

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      mimeType: 'image/jpeg',
      fileName: `${baseName}.jpg`,
      compressed: true,
    };
  } catch {
    return originalImage(uri, originalWidth, originalHeight, originalFileName);
  }
}
