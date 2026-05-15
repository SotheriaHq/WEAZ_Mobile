import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DesignCreateAliasRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  return <Redirect href={{ pathname: '/catalog/create-design', params } as any} />;
}
