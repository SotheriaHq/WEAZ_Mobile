import { useLocalSearchParams } from 'expo-router';

import CollectionCommerceViewer from '@/src/features/market/components/CollectionCommerceViewer';

export default function CollectionViewerRoute() {
  const params = useLocalSearchParams<{
    collectionId?: string;
    fallbackHref?: string;
    openComments?: string;
    commentId?: string;
  }>();
  return (
    <CollectionCommerceViewer
      collectionId={String(params.collectionId ?? '')}
      fallbackHref={typeof params.fallbackHref === 'string' ? params.fallbackHref : undefined}
      openComments={params.openComments === '1'}
      initialCommentId={typeof params.commentId === 'string' && params.commentId ? params.commentId : null}
    />
  );
}
