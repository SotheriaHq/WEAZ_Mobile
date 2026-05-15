import { useLocalSearchParams } from 'expo-router';

import CollectionDetailViewer from '@/components/catalog/CollectionDetailViewer';

export default function DesignDetailAliasRoute() {
  const params = useLocalSearchParams<{
    designId?: string | string[];
    openComments?: string | string[];
    commentId?: string | string[];
  }>();
  const designId = Array.isArray(params.designId) ? params.designId[0] : params.designId ?? '';
  const openComments = Array.isArray(params.openComments) ? params.openComments[0] : params.openComments;
  const commentId = Array.isArray(params.commentId) ? params.commentId[0] : params.commentId;
  const autoOpenComments = openComments === '1' || openComments === 'true' || openComments === 'yes';

  return (
    <CollectionDetailViewer
      collectionId={designId}
      scope="design"
      autoOpenComments={autoOpenComments}
      initialCommentId={commentId ?? null}
    />
  );
}
