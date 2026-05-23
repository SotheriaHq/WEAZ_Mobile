import { resolveImageUri } from '@/src/hooks/useResolvedImageUri';

export const resolveFeedMediaUrl = ({
  displayUrl,
  previewUrl,
  thumbnailUrl,
  fileId,
  designId,
  mediaIndex,
}: {
  displayUrl?: string | null;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  fileId?: string | null;
  designId?: string | null;
  mediaIndex?: number | null;
}) =>
  resolveImageUri({
    src: displayUrl || previewUrl || thumbnailUrl || null,
    fileId,
    allowSignedFallback: false,
    debugContext: {
      designId,
      mediaIndex,
      fileId,
      sourceField: fileId ? 'feed.media.fileId' : 'feed.media.displayUrl',
    },
  });
