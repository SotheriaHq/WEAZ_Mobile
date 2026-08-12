import { useLocalSearchParams } from 'expo-router';

import CollectionDetailViewer from '@/components/catalog/CollectionDetailViewer';

export default function DesignDetailAliasRoute() {
  const params = useLocalSearchParams<{
    designId?: string | string[];
    openComments?: string | string[];
    commentId?: string | string[];
    coverImage?: string | string[];
    coverFileId?: string | string[];
  }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId ?? '';
  const openComments = Array.isArray(params.openComments) ? params.openComments[0] : params.openComments;
  const commentId = Array.isArray(params.commentId) ? params.commentId[0] : params.commentId;
  const autoOpenComments = openComments === '1' || openComments === 'true' || openComments === 'yes';
  // Router params cannot carry null, so callers send '' for "no cover".
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  const coverImage = first(params.coverImage) || null;
  const coverFileId = first(params.coverFileId) || null;

  return (
    <CollectionDetailViewer
      collectionId={designId}
      scope="design"
      autoOpenComments={autoOpenComments}
      initialCommentId={commentId ?? null}
      initialCoverImage={coverImage}
      initialCoverFileId={coverFileId}
    />
  );
}
