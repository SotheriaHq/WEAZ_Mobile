import { MOBILE_UPLOAD_POLICIES } from './uploadValidation';

type CompressionProfile = 'profileImage' | 'bannerImage' | 'designMedia' | 'messageImage';

// Max dimension is applied to the LONGEST side only.
// Aspect ratio is always preserved — we never crop or stretch.
// Supported images inside both limits pass through without another generation.
const PROFILES: Record<
  CompressionProfile,
  { maxLongSide: number; minLongSide: number; maxBytes: number }
> = {
  profileImage: { maxLongSide: 1080, minLongSide: 720, maxBytes: MOBILE_UPLOAD_POLICIES.profileImage.maxSizeBytes },
  bannerImage: { maxLongSide: 2560, minLongSide: 1920, maxBytes: MOBILE_UPLOAD_POLICIES.bannerImage.maxSizeBytes },
  // Keep a high-resolution master for portrait fashion and the server's zoom variants.
  designMedia: { maxLongSide: 4096, minLongSide: 2048, maxBytes: MOBILE_UPLOAD_POLICIES.designMedia.maxSizeBytes },
  messageImage: { maxLongSide: 2560, minLongSide: 1280, maxBytes: MOBILE_UPLOAD_POLICIES.messageImage.maxSizeBytes },
};

// Preserve masters that already fit; only the real upload ceiling can trigger retries.
const INITIAL_QUALITY = 0.97;
const MIN_QUALITY = 0.95;
const MAX_COMPRESSION_ATTEMPTS = 6;
const LIMIT_HEADROOM = 0.98;
let activeEncodes = 0;
const encodeWaiters: Array<() => void> = [];
async function acquireEncode() {
  if (activeEncodes < 2) { activeEncodes++; return; }
  await new Promise<void>((resolve) => encodeWaiters.push(resolve));
}
function releaseEncode() {
  const next = encodeWaiters.shift();
  if (next) next();
  else activeEncodes--;
}

async function getLocalUriSize(uri: string): Promise<number | null> {
  try {
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    const size = new File(uri).size;
    if (Number.isFinite(size) && size > 0) return size;
  } catch { /* Older runtimes can use the asynchronous metadata API. */ }
  try {
    const legacy = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const info = await legacy.getInfoAsync(uri);
    if (info.exists && !info.isDirectory && Number.isFinite(info.size) && info.size > 0) return info.size;
  } catch { /* Unknown size is validated by the upload endpoint. */ }
  return null;
}

function discardCandidate(uri: string, sourceUri: string) {
  if (uri === sourceUri || !uri.startsWith('file://')) return;
  try {
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    new File(uri).delete();
  } catch { /* Temporary cache files remain safe for OS cleanup on older runtimes. */ }
}

export type CompressedImage = {
  uri: string;
  width: number;
  height: number;
  // The actual output format, including PNG when transparency is preserved.
  mimeType: string;
  fileName: string;
  // True when the original image was returned without compression. Callers can
  // use this for diagnostics; it is safe to ignore.
  compressed?: boolean;
  fileSize?: number;
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

// Never throws: unavailable codecs retain the original and normal upload validation applies.
export async function compressPickedImage(
  uri: string,
  originalWidth: number,
  originalHeight: number,
  originalFileName: string | null | undefined,
  profile: CompressionProfile,
  metadata: { mimeType?: string | null; fileSize?: number | null } = {},
): Promise<CompressedImage> {
  const inferred = metadata.mimeType?.trim().toLowerCase() || inferMimeType(originalFileName, uri);
  const measured = typeof metadata.fileSize === 'number' && Number.isFinite(metadata.fileSize) && metadata.fileSize > 0
    ? metadata.fileSize : await getLocalUriSize(uri);
  const extensionByMime: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif' };
  const actualName = extensionByMime[inferred]
    ? `${(originalFileName || 'image').replace(/\.[^.]+$/, '')}.${extensionByMime[inferred]}` : originalFileName;
  const original = (): CompressedImage => ({
    ...originalImage(uri, originalWidth, originalHeight, actualName),
    mimeType: inferred,
    ...(measured !== null ? { fileSize: measured } : {}),
  });
  const cfg = PROFILES[profile];
  const longSide = Math.max(originalWidth, originalHeight);
  if (inferred === 'image/gif' && (profile === 'designMedia' || profile === 'bannerImage')) return original();
  if (['image/jpeg', 'image/png', 'image/webp'].includes(inferred) && measured !== null && measured <= cfg.maxBytes)
    return original();
  const manipulator = getManipulator();
  if (!manipulator) return original();
  await acquireEncode();
  let kept: Awaited<ReturnType<typeof manipulator.manipulateAsync>> | null = null;
  let keptSize: number | null = null;
  try {
    const { manipulateAsync, SaveFormat } = manipulator;
    // PNG/WebP/AVIF may carry alpha. JPEG is never a safe fallback for them.
    const preserveAlpha = ['image/png', 'image/webp', 'image/avif', 'image/gif'].includes(inferred);
    const format = preserveAlpha ? SaveFormat.PNG : SaveFormat.JPEG;
    const mimeType = preserveAlpha ? 'image/png' : 'image/jpeg';
    const extension = preserveAlpha ? 'png' : 'jpg';
    const targetBytes = Math.floor(cfg.maxBytes * LIMIT_HEADROOM);
    let maxLongSide = Math.min(Math.max(longSide, 1), cfg.maxLongSide);
    let quality = INITIAL_QUALITY;
    for (let attempt = 0; attempt < MAX_COMPRESSION_ATTEMPTS; attempt++) {
      const actions: Parameters<typeof manipulateAsync>[1] = [];
      if (longSide > maxLongSide && originalWidth > 0 && originalHeight > 0) {
        const scale = maxLongSide / longSide;
        actions.push({ resize: { width: Math.max(1, Math.round(originalWidth * scale)), height: Math.max(1, Math.round(originalHeight * scale)) } });
      }
      // Every attempt reads the source, never an already-compressed candidate.
      const candidate = await manipulateAsync(uri, actions, { compress: preserveAlpha ? 1 : quality, format });
      const size = await getLocalUriSize(candidate.uri);
      if (!kept || (size !== null && (keptSize === null || size < keptSize))) {
        if (kept) discardCandidate(kept.uri, uri);
        kept = candidate; keptSize = size;
      } else discardCandidate(candidate.uri, uri);
      if (size === null || size <= targetBytes) break;
      if (measured !== null && measured <= cfg.maxBytes && ['image/jpeg', 'image/png', 'image/webp'].includes(inferred)) {
        if (kept) discardCandidate(kept.uri, uri);
        return original();
      }
      if (!preserveAlpha && quality > MIN_QUALITY) { quality = Math.max(MIN_QUALITY, quality - 0.02); continue; }
      const next = Math.max(Math.min(longSide, cfg.minLongSide), Math.round(maxLongSide * 0.9));
      if (next >= maxLongSide) break;
      maxLongSide = next;
    }
    if (!kept) return original();
    if (keptSize !== null && keptSize > cfg.maxBytes) {
      discardCandidate(kept.uri, uri);
      return original();
    }
    return { uri: kept.uri, width: kept.width, height: kept.height, mimeType,
      fileName: `${(originalFileName ?? 'image').replace(/\.[^.]+$/, '')}.${extension}`, compressed: true,
      ...(keptSize !== null ? { fileSize: keptSize } : {}),
    };
  } catch {
    if (kept) discardCandidate(kept.uri, uri);
    return original();
  } finally { releaseEncode(); }
}
