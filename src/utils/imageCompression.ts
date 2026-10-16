type CompressionProfile = 'profileImage' | 'bannerImage' | 'designMedia' | 'messageImage';

const MB = 1024 * 1024;

// Max dimension is applied to the LONGEST side only.
// Aspect ratio is always preserved — we never crop or stretch.
// Only images larger than maxLongSide are resized; smaller images are only quality-compressed.
const PROFILES: Record<
  CompressionProfile,
  { maxLongSide: number; minLongSide: number; maxBytes: number }
> = {
  profileImage: { maxLongSide: 1080, minLongSide: 720, maxBytes: 2 * MB },
  bannerImage: { maxLongSide: 1920, minLongSide: 1280, maxBytes: 2 * MB },
  // 2048 = the server's largest (ZOOM) variant, so nothing the server renders
  // is ever upscaled from a smaller upload. The floor is 1600: below that a
  // full-screen Runway page on a 1440px-wide phone starts to soften.
  designMedia: { maxLongSide: 2048, minLongSide: 1600, maxBytes: 2 * MB },
  messageImage: { maxLongSide: 1280, minLongSide: 720, maxBytes: 2 * MB },
};

/*
  Quality first, size second.

  This used to start at 0.99 — a JPEG setting that buys almost nothing visible
  over 0.92 and roughly doubles the bytes — and then chase a target of 10% of
  the ORIGINAL file size, shrinking the long side by 18% per attempt down to a
  720px floor. A 4MB phone photo therefore usually landed near 720-880px: the
  design was permanently softened before it ever reached the server, and every
  Runway variant was then upscaled from it. It also cost up to six full
  re-encodes per photo.

  Now: one 0.92 encode at up to the profile's max side, which nearly always
  fits the upload limit. Only if it does not do we step quality down, and only
  after that the size — never below the profile floor.
*/
const INITIAL_QUALITY = 0.92;
const MIN_QUALITY = 0.86;
const MAX_COMPRESSION_ATTEMPTS = 6;
/** Headroom under the hard upload limit for multipart overhead. */
const LIMIT_HEADROOM = 0.95;

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
    // The only size goal is fitting the upload limit — never a fraction of the
    // original, which is what used to grind photos down to 720px.
    const targetBytes = Math.floor(cfg.maxBytes * LIMIT_HEADROOM);

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

      // Over the limit: give up a little JPEG quality before any pixels, and
      // pixels only in small steps, never under the profile floor.
      if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.03);
        continue;
      }
      const nextLongSide = Math.max(cfg.minLongSide, Math.round(maxLongSide * 0.9));
      if (nextLongSide < maxLongSide) {
        maxLongSide = nextLongSide;
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
