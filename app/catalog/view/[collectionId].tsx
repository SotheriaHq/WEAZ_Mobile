import { useLocalSearchParams } from 'expo-router';

import CollectionDetailViewer from '@/components/catalog/CollectionDetailViewer';

export default function CollectionDetailRoute() {
  const params = useLocalSearchParams<{ collectionId?: string | string[]; scope?: string | string[]; openComments?: string | string[] }>();
  const collectionId = Array.isArray(params.collectionId) ? params.collectionId[0] : params.collectionId ?? '';
  const scope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const openComments = Array.isArray(params.openComments) ? params.openComments[0] : params.openComments;
  const autoOpenComments = openComments === '1' || openComments === 'true' || openComments === 'yes';

  return <CollectionDetailViewer collectionId={collectionId} scope={scope} autoOpenComments={autoOpenComments} />;
}