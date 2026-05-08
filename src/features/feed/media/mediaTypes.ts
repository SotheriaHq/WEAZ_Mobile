export type FeedResolvedMediaType = 'image' | 'video';

export type FeedResolvedMedia = {
  id: string;
  collectionId: string;
  mediaIndex: number;
  displayUrl: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  fileId: string | null;
  type: FeedResolvedMediaType;
  label: string;
  threadsCount: number;
};
