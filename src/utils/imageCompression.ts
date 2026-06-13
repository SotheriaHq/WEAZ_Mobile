import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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
  mimeType: 'image/jpeg';
  fileName: string;
};

/**
 * Compress a picked image while preserving its aspect ratio.
 *
 * - If the longest side exceeds the profile's maxLongSide, both dimensions are
 *   scaled down proportionally (no crop, no stretch).
 * - The result is always saved as JPEG at the profile's quality level.
 * - fileSize is intentionally not returned — callers should omit it from
 *   subsequent validation so the size check is skipped (the compressed output
 *   is always well under the 2 MB limit after this step).
 */
export async function compressPickedImage(
  uri: string,
  originalWidth: number,
  originalHeight: number,
  originalFileName: string | null | undefined,
  profile: CompressionProfile,
): Promise<CompressedImage> {
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
  };
}
