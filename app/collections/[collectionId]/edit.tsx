import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CollectionEditAliasRoute() {
  const params = useLocalSearchParams<{ collectionId?: string | string[] }>();
  const collectionId = Array.isArray(params.collectionId) ? params.collectionId[0] : params.collectionId;

  return (
    <Redirect
      href={{
        pathname: '/catalog/create-collection',
        params: collectionId ? { collectionId, mode: 'edit' } : undefined,
      } as any}
    />
  );
}
