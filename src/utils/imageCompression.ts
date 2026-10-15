type CompressionProfile = 'profileImage' | 'bannerImage' | 'designMedia' | 'messageImage';

const MB = 1024 * 1024;

// Max dimension is applied to the LONGEST side only.
// Aspect ratio is always preserved — we never crop or stretch.
// Only images larger than maxLongSide are resized; smaller images are only quality-compressed.
const PROFILES: Record<
  CompressionProfile,
  { maxLongSide: number; minLongSide: number; maxBytes: number }
> = {
  profileImage: { maxLongSide: 1080, minLongSide: 512, maxBytes: 2 * MB },
  bannerImage: { maxLongSide: 1920, minLongSide: 720, maxBytes: 2 * MB },
  designMedia: { maxLongSide: 1600, minLongSide: 720, maxBytes: 2 * MB },
  messageImage: { maxLongSide: 1280, minLongSide: 512, maxBytes: 2 * MB },
};

const INITIAL_QUALITY = 0.99;
const MIN_QUALITY = 0.9;
const MAX_COMPRESSION_ATTEMPTS = 6;

async function getLocalUriSize(uri: string): Promise<number | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return Number.isFinite(blob.size) && blob.size > 0 ? blob.size : null;
  } catch {
    return null;
  }
}

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

// Never throws. Each supported native image starts with a 99%-quality JPEG
// encode and is adaptively resized only when needed. A 90% byte reduction is a
// best-effort target, not a destructive guarantee: we retain the smallest
// high-quality result and never trade a valid picker interaction for a crash.
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
    const originalSize = await getLocalUriSize(uri);
    const targetBytes = Math.max(
      64 * 1024,
      Math.min(
        cfg.maxBytes,
        originalSize ? Math.floor(originalSize * 0.1) : cfg.maxBytes,
      ),
    );

    let maxLongSide = Math.min(Math.max(longSide, 1), cfg.maxLongSide);
    let quality = INITIAL_QUALITY;
    let result: Awaited<ReturnType<typeof manipulateAsync>> | null = null;
    let resultSize: number | null = null;

    for (let attempt = 0; attempt < MAX_COMPRESSION_ATTEMPTS; attempt += 1) {
      const actions: Parameters<typeof manipulateAsync>[1] = [];
      if (longSide > maxLongSide && longSide > 0) {
        const scale = maxLongSide / longSide;
        actions.push({
          resize: {
            width: Math.max(1, Math.round(originalWidth * scale)),
            height: Math.max(1, Math.round(originalHeight * scale)),
          },
        });
      }

      const candidate = await manipulateAsync(uri, actions, {
        compress: quality,
        format: SaveFormat.JPEG,
      });
      const candidateSize = await getLocalUriSize(candidate.uri);
      if (resultSize === null || (candidateSize !== null && candidateSize < resultSize)) {
        result = candidate;
        resultSize = candidateSize;
      }
      if (candidateSize === null || candidateSize <= targetBytes) break;

      const nextLongSide = Math.round(maxLongSide * 0.82);
      if (nextLongSide >= cfg.minLongSide && nextLongSide < maxLongSide) {
        maxLongSide = nextLongSide;
        continue;
      }
      if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.02);
        continue;
      }
      break;
    }

    if (!result) return originalImage(uri, originalWidth, originalHeight, originalFileName);

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
