import { Redirect, useLocalSearchParams } from 'expo-router';

export default function CollectionCreateAliasRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  return <Redirect href={{ pathname: '/catalog/create-collection', params } as any} />;
}
