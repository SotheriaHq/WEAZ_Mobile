import { MOBILE_UPLOAD_POLICIES } from './uploadValidation';

type CompressionProfile = 'profileImage' | 'bannerImage' | 'designMedia' | 'messageImage';
type EncodedFormat = 'jpeg' | 'webp' | 'png';

// Compression only: the output always keeps the source's pixel dimensions.
// Best quality first, and the last entry is the floor for reaching the target.
const QUALITIES = [0.95, 0.9, 0.85, 0.8];
// The largest view served is 2048 pixels wide. A photo with far more pixels than
// that is scaled down on the way, which hides heavier compression.
const LARGE_PHOTO_PIXELS = 8_000_000;
const LARGE_PHOTO_QUALITIES = [...QUALITIES, 0.7, 0.6];
// Only ever spent to get under the ceiling, because a softer photo is better than
// a refused one. WebP, since JPEG cannot bring 24MP and above that far down.
const LAST_RESORT_WEBP_QUALITIES = [0.6, 0.5, 0.4];
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

type Encoded = { uri: string; width: number; height: number; format: EncodedFormat; size: number | null };

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
  const { maxSizeBytes: maxBytes, preferredSizeBytes: targetBytes } = MOBILE_UPLOAD_POLICIES[profile];
  const accepted = ['image/jpeg', 'image/png', 'image/webp'].includes(inferred);
  const fitsCeiling = accepted && measured !== null && measured <= maxBytes;
  if (inferred === 'image/gif' && (profile === 'designMedia' || profile === 'bannerImage')) return original();
  // An efficient source is a better master than a second lossy generation.
  if (accepted && measured !== null && measured <= targetBytes) return original();
  const manipulator = getManipulator();
  if (!manipulator) return original();
  await acquireEncode();
  let fit: Encoded | null = null;
  let atFloor: Encoded | null = null;
  const discard = (candidate: Encoded | null) => { if (candidate) discardCandidate(candidate.uri, uri); };
  try {
    const { manipulateAsync, SaveFormat } = manipulator;
    const saveFormats = { jpeg: SaveFormat.JPEG, webp: SaveFormat.WEBP, png: SaveFormat.PNG };
    // Every attempt reads the source, never an already-compressed candidate.
    const encode = async (format: EncodedFormat, quality: number): Promise<Encoded> => {
      const result = await manipulateAsync(uri, [], { compress: quality, format: saveFormats[format] });
      return { uri: result.uri, width: result.width, height: result.height, format, size: await getLocalUriSize(result.uri) };
    };
    const finished = (candidate: Encoded): CompressedImage => ({
      uri: candidate.uri, width: candidate.width, height: candidate.height, mimeType: `image/${candidate.format}`,
      fileName: `${(originalFileName ?? 'image').replace(/\.[^.]+$/, '')}.${candidate.format === 'jpeg' ? 'jpg' : candidate.format}`, compressed: true,
      ...(candidate.size !== null ? { fileSize: candidate.size } : {}),
    });

    // Flat artwork and screenshots can fit with no loss at all, so a lossless
    // file that plausibly fits is worth one attempt before any quality is spent.
    // These may carry alpha, and JPEG is never a safe fallback for them.
    const mayHaveAlpha = ['image/png', 'image/webp', 'image/avif', 'image/gif'].includes(inferred);
    if (mayHaveAlpha && (measured === null || measured <= targetBytes * 2)) {
      const lossless = await encode('png', 1);
      if (lossless.size === null || lossless.size <= targetBytes) return finished(lossless);
      discard(lossless);
    }

    // The highest quality that fits, by bisection, so a photo costs at most three
    // encodes. An unmeasurable result is left for the upload endpoint to validate.
    const format: EncodedFormat = mayHaveAlpha ? 'webp' : 'jpeg';
    const qualities = originalWidth * originalHeight >= LARGE_PHOTO_PIXELS ? LARGE_PHOTO_QUALITIES : QUALITIES;
    const floorRung = qualities.length - 1;
    let low = 0;
    let high = floorRung;
    for (let rung = Math.floor(high / 2); low <= high; rung = Math.floor((low + high) / 2)) {
      const candidate = await encode(format, qualities[rung]);
      if (candidate.size === null || candidate.size <= targetBytes) {
        discard(fit);
        fit = candidate;
        if (candidate.size === null) break;
        high = rung - 1;
      } else if (rung === floorRung) {
        atFloor = candidate;
        low = rung + 1;
      } else {
        discard(candidate);
        low = rung + 1;
      }
    }
    if (fit) return finished(fit);
    if (!atFloor) return original();

    // The target is only an aim, and more quality will not be spent chasing it.
    // Anything the API accepts goes up.
    if (fitsCeiling) { discard(atFloor); return original(); }
    if (atFloor.size !== null && atFloor.size <= maxBytes) return finished(atFloor);

    for (const quality of LAST_RESORT_WEBP_QUALITIES) {
      const candidate = await encode('webp', quality);
      if (candidate.size === null || candidate.size <= maxBytes) { discard(atFloor); return finished(candidate); }
      discard(candidate);
    }
    discard(atFloor);
    return original();
  } catch {
    discard(fit);
    discard(atFloor);
    return original();
  } finally { releaseEncode(); }
}
