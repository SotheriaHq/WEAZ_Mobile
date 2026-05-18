import { useLocalSearchParams } from 'expo-router';

import CollectionGalleryViewer from '@/src/features/market/components/CollectionGalleryViewer';

export default function CollectionGalleryRoute() {
  const params = useLocalSearchParams<{ collectionId?: string }>();
  return <CollectionGalleryViewer collectionId={String(params.collectionId ?? '')} />;
}
