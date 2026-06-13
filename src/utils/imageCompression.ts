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

// expo-image-manipulator is a native module that requires a native rebuild
// (expo prebuild / dev-client build) to be available. We require it lazily
// inside the function so a missing native module does NOT crash the module
// graph at load time — callers already have try/catch and fall back to the
// original uncompressed image when this throws.
function loadManipulator(): typeof import('expo-image-manipulator') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-image-manipulator') as typeof import('expo-image-manipulator');
}

export async function compressPickedImage(
  uri: string,
  originalWidth: number,
  originalHeight: number,
  originalFileName: string | null | undefined,
  profile: CompressionProfile,
): Promise<CompressedImage> {
  const { manipulateAsync, SaveFormat } = loadManipulator();
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
